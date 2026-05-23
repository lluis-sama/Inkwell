import {
  Component,
  input,
  output,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-find-replace-bar',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './find-replace-bar.component.html',
})
export class FindReplaceBarComponent implements AfterViewInit {
  @ViewChild('searchInput') searchInputEl!: ElementRef<HTMLInputElement>;

  resultCount        = input<{ current: number; total: number }>({ current: 0, total: 0 });
  openWithReplace    = input<boolean>(false);

  queryChanged        = output<{ query: string; caseSensitive: boolean }>();
  nextRequested       = output<void>();
  prevRequested       = output<void>();
  replaceRequested    = output<string>();
  replaceAllRequested = output<string>();
  closed              = output<void>();

  searchQuery   = '';
  replaceQuery  = '';
  caseSensitive = signal(false);
  showReplace   = signal(false);

  ngAfterViewInit(): void {
    if (this.openWithReplace()) {
      this.showReplace.set(true);
    }
    setTimeout(() => this.searchInputEl?.nativeElement.focus(), 50);
  }

  onQueryChange(value: string): void {
    this.searchQuery = value;
    this.queryChanged.emit({ query: value, caseSensitive: this.caseSensitive() });
  }

  toggleCase(): void {
    this.caseSensitive.update(v => !v);
    this.queryChanged.emit({ query: this.searchQuery, caseSensitive: this.caseSensitive() });
  }

  toggleShowReplace(): void {
    this.showReplace.update(v => !v);
  }
}
