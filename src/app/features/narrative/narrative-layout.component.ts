import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InkNavComponent } from '../../shared/components/ink-nav.component';
import { NarrativeCardComponent } from './narrative-card.component';
import { NarrativeService, NarrativeCard } from '../../core/services/narrative.service';
import { ProjectService } from '../../core/services/project.service';
import { DocumentService } from '../../core/services/document.service';

@Component({
  selector: 'app-narrative-layout',
  standalone: true,
  imports: [InkNavComponent, NarrativeCardComponent, TranslocoPipe],
  templateUrl: './narrative-layout.component.html',
})
export class NarrativeLayoutComponent implements OnInit {
  private narrativeService = inject(NarrativeService);
  protected projectService = inject(ProjectService);
  private documentService  = inject(DocumentService);
  private router           = inject(Router);

  cards   = signal<NarrativeCard[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);
  columns = signal(3);

  groupedItems = computed(() => {
    const groups: Array<{ sectionTitle: string | null; cards: NarrativeCard[] }> = [];
    let current: { sectionTitle: string | null; cards: NarrativeCard[] } = {
      sectionTitle: null,
      cards: [],
    };
    for (const item of this.cards()) {
      if (item.isSection) {
        if (current.cards.length > 0 || current.sectionTitle !== null) {
          groups.push(current);
        }
        current = { sectionTitle: item.title, cards: [] };
      } else {
        current.cards.push(item);
      }
    }
    if (current.cards.length > 0 || current.sectionTitle !== null) {
      groups.push(current);
    }
    return groups;
  });

  async ngOnInit(): Promise<void> {
    if (!this.projectService.isLoaded()) {
      this.router.navigate(['/']);
      return;
    }

    try {
      const result = await this.narrativeService.buildNarrativeCards();
      this.cards.set(result);
      this.loading.set(false);
    } catch {
      this.error.set('No se pudo cargar la vista narrativa.');
      this.loading.set(false);
    }
  }

  async onSynopsisChanged(card: NarrativeCard, synopsis: string): Promise<void> {
    const doc = await this.documentService.loadDocument(card.id);
    await this.documentService.saveDocument({
      ...doc,
      synopsis: synopsis.trim() || undefined,
    });
    this.cards.update(list =>
      list.map(c => (c.id === card.id ? { ...c, synopsis: synopsis.trim() } : c)),
    );
  }

  onOpenInEditor(card: NarrativeCard): void {
    this.router.navigate(['/editor'], { queryParams: { doc: card.id } });
  }
}
