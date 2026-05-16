import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { DocumentFile } from '../../../core/models/document.model';
import { DocumentService } from '../../../core/services/document.service';
import { AiService } from '../../../core/services/ai.service';
import { tiptapToText } from '../../../shared/utils/tiptap-to-text';
import { InkModalComponent } from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';

@Component({
  selector: 'app-synopsis-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule, TranslocoPipe],
  templateUrl: './synopsis-modal.component.html',
})
export class SynopsisModalComponent implements OnInit {
  private docService = inject(DocumentService);
  ai = inject(AiService);

  document = input.required<DocumentFile>();
  saved    = output<DocumentFile>();
  closed   = output<void>();

  synopsisText = signal('');
  generating   = signal(false);
  saving       = signal(false);

  charCount     = computed(() => this.synopsisText().length);
  canGenerateAi = computed(() =>
    this.ai.hasApiKey() && tiptapToText(this.document().content).trim().length > 50,
  );

  ngOnInit(): void {
    this.synopsisText.set(this.document().synopsis ?? '');
  }

  async generateWithAi(): Promise<void> {
    this.generating.set(true);
    try {
      const docText = tiptapToText(this.document().content);
      let full = '';
      for await (const chunk of this.ai.streamMessage(
        [{ role: 'user', content: `Capítulo: "${this.document().title}"` }],
        'synopsis',
        docText,
      )) {
        full += chunk;
        if (full.length > 500) full = full.slice(0, 500);
        this.synopsisText.set(full);
      }
    } catch {
      // Error silencioso — el usuario ve el textarea vacío o con el texto parcial
    } finally {
      this.generating.set(false);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const updated = await this.docService.saveDocument({
        ...this.document(),
        synopsis: this.synopsisText().trim() || undefined,
      });
      this.saved.emit(updated);
      this.closed.emit();
    } finally {
      this.saving.set(false);
    }
  }
}
