import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NarrativeCard } from '../../core/services/narrative.service';
import { AiService } from '../../core/services/ai.service';
import { tiptapToText } from '../../shared/utils/tiptap-to-text';

@Component({
  selector: 'app-narrative-card',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './narrative-card.component.html',
  styleUrl: './narrative-card.component.css',
})
export class NarrativeCardComponent {
  protected ai = inject(AiService);

  card = input.required<NarrativeCard>();

  synopsisChanged = output<string>();
  openInEditor    = output<void>();

  editingSynopsis = signal<boolean>(false);
  draftSynopsis   = signal<string>('');
  generating      = signal<boolean>(false);

  canGenerateAi = computed(() =>
    this.ai.hasApiKey() && tiptapToText(this.card().content).trim().length > 50,
  );

  startEditing(): void {
    this.draftSynopsis.set(this.card().synopsis);
    this.editingSynopsis.set(true);
  }

  async generateWithAi(): Promise<void> {
    this.generating.set(true);
    try {
      const docText = tiptapToText(this.card().content);
      let full = '';
      for await (const chunk of this.ai.streamMessage(
        [{ role: 'user', content: `Capítulo: "${this.card().title}"` }],
        'synopsis',
        docText,
      )) {
        full += chunk;
        if (full.length > 500) full = full.slice(0, 500);
        this.draftSynopsis.set(full);
      }
    } catch {
      // Error silencioso
    } finally {
      this.generating.set(false);
    }
  }

  commitEdit(): void {
    this.synopsisChanged.emit(this.draftSynopsis());
    this.editingSynopsis.set(false);
  }

  cancelEdit(): void {
    this.editingSynopsis.set(false);
  }

  formatWords(n: number): string {
    if (n === 0) return 'Sin palabras';
    if (n === 1) return '1 palabra';
    return `${n} palabras`;
  }
}
