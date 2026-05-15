import { Component, computed, inject, OnDestroy, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { SearchResult, SearchService } from '../../../core/services/search.service';

@Component({
  selector: 'app-binder-search',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './binder-search.component.html',
})
export class BinderSearchComponent implements OnDestroy {
  private svc = inject(SearchService);

  documentSelected = output<string>();
  closed = output<void>();

  query = '';
  wholeWord = true;
  results = signal<SearchResult[]>([]);
  searching = signal(false);
  totalMatches = computed(() => this.results().reduce((s, r) => s + r.matches.length, 0));

  private timer: ReturnType<typeof setTimeout> | null = null;

  onQueryChange(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.query.trim()) { this.results.set([]); return; }
    this.timer = setTimeout(async () => {
      this.searching.set(true);
      try {
        this.results.set(await this.svc.search(this.query, this.wholeWord));
      } finally { this.searching.set(false); }
    }, 400);
  }

  highlight(context: string): string {
    if (!this.query.trim()) return this.escapeHtml(context);
    const esc = this.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.escapeHtml(context).replace(
      new RegExp(`(${esc})`, 'gi'),
      '<mark style="background:var(--ink-accent);color:var(--ink-panel);border-radius:2px;padding:0 1px">$1</mark>',
    );
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  ngOnDestroy(): void { if (this.timer) clearTimeout(this.timer); }
}
