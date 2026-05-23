import {
  Component, inject, signal,
  input, output, ViewChild, ElementRef,
  AfterViewChecked, viewChild, computed, effect, OnDestroy,
} from '@angular/core';
import interact from 'interactjs';
import { FormsModule } from '@angular/forms';
import { AiService, AiMessage, AiMode } from '../../../core/services/ai.service';
import { ProjectService }  from '../../../core/services/project.service';
import { DocumentService } from '../../../core/services/document.service';
import { DeskService }     from '../../../core/services/desk.service';
import { DocumentFile }    from '../../../core/models/document.model';
import { tiptapToText }    from '../../../shared/utils/tiptap-to-text';
import { InkSettingsModalComponent } from '../../../shared/components/ink-settings-modal.component';
import { SettingsService } from '../../../core/services/settings.service';
import { TranslocoPipe } from '@jsverse/transloco';

const MODE_LABELS: Record<AiMode, string> = {
  analyze:    'Analizar escena',
  review:     'Revisar texto',
  brainstorm: 'Brainstorm',
  synopsis:   'Sinopsis',
};

const MODE_PLACEHOLDERS: Record<AiMode, string> = {
  analyze:    '¿Qué quieres que analice de esta escena?',
  review:     '¿Qué aspectos del texto quieres revisar?',
  brainstorm: '¿Sobre qué quieres explorar ideas?',
  synopsis:   '',
};

@Component({
  selector: 'app-ai-assistant-panel',
  standalone: true,
  imports: [FormsModule, InkSettingsModalComponent, TranslocoPipe],
  templateUrl: './ai-assistant-panel.component.html',
  styleUrl: './ai-assistant-panel.component.css',
})
export class AiAssistantPanelComponent implements AfterViewChecked, OnDestroy {
  @ViewChild('messagesEl') messagesEl!: ElementRef<HTMLDivElement>;

  private readonly resizeHandle = viewChild<ElementRef>('resizeHandle');

  /** Documento activo en el editor */
  activeDocument = input<DocumentFile | null>(null);

  insertIntoEditor = output<string>();
  closed           = output<void>();

  ai                     = inject(AiService);
  private project        = inject(ProjectService);
  private docService     = inject(DocumentService);
  private deskService    = inject(DeskService);
  private settingsService = inject(SettingsService);

  readonly panelWidth = computed(() => this.settingsService.settings().aiPanel.width);

  private interactable: ReturnType<typeof interact> | null = null;

  activeMode       = signal<AiMode>('analyze');
  messages         = signal<AiMessage[]>([]);
  streamingContent = signal<string>('');
  isStreaming      = signal(false);
  error            = signal<string | null>(null);
  showSettings     = signal(false);
  userInput        = '';

  readonly modeKeys         = ['analyze', 'review', 'brainstorm'] as AiMode[];
  readonly modeLabels       = MODE_LABELS;
  readonly modePlaceholders = MODE_PLACEHOLDERS;
  readonly modeDescription: Record<AiMode, string> = {
    analyze:    'Analiza la estructura, ritmo y eficacia narrativa de la escena activa.',
    review:     'Revisa gramática, estilo y coherencia del texto.',
    brainstorm: 'Explora ideas de trama, personajes y mundo de forma libre.',
    synopsis:   'Genera una sinopsis automática del capítulo.',
  };

  private shouldScrollToBottom = false;

  constructor() {
    effect(() => {
      const handle = this.resizeHandle()?.nativeElement;
      if (!handle || this.interactable) return;
      this.interactable = interact(handle).draggable({
        listeners: {
          move: (event: { dx: number }) => {
            const newWidth = this.settingsService.settings().aiPanel.width - event.dx;
            this.settingsService.setAiPanelWidth(newWidth);
          },
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.interactable?.unset();
  }

  providerMessage = () => this.ai.providerStatusMessage();

  canSend = () =>
    this.userInput.trim().length > 0 &&
    !this.isStreaming() &&
    this.ai.isProviderReady();

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  async send(): Promise<void> {
    if (!this.canSend()) return;

    const content = this.userInput.trim();
    this.userInput = '';
    this.error.set(null);

    // Añadir mensaje del usuario al historial
    this.messages.update(msgs => [...msgs, { role: 'user', content }]);
    this.shouldScrollToBottom = true;

    // Construir contexto del documento activo
    const context = this.buildContext();

    this.isStreaming.set(true);
    this.streamingContent.set('');

    try {
      let fullResponse = '';

      for await (const chunk of this.ai.streamMessage(
        this.messages(),
        this.activeMode(),
        context,
      )) {
        fullResponse += chunk;
        this.streamingContent.set(fullResponse);
        this.shouldScrollToBottom = true;
      }

      // Finalizar: mover streaming content al historial
      this.messages.update(msgs => [
        ...msgs,
        { role: 'assistant', content: fullResponse },
      ]);
      this.streamingContent.set('');

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error.set(msg);
      // Eliminar el mensaje de usuario si falló
      this.messages.update(msgs => msgs.slice(0, -1));
    } finally {
      this.isStreaming.set(false);
      this.shouldScrollToBottom = true;
    }
  }

  async saveToDesk(content: string, mode: AiMode): Promise<void> {
    const modeLabel: Record<AiMode, string> = {
      analyze:    'Análisis',
      review:     'Revisión',
      brainstorm: 'Ideas',
      synopsis:   'Sinopsis',
    };
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const docTitle = `${modeLabel[mode] ?? mode} · ${dateStr}`;

    try {
      await this.docService.createDocumentInDesk(docTitle, content);
      if (this.settingsService.settings().deskPanel.position === 'closed') {
        this.settingsService.setDeskPosition('bottom');
      }
      this.deskService.notifyNewDocument(docTitle);
    } catch {
    }
  }

  clearHistory(): void {
    this.messages.set([]);
    this.streamingContent.set('');
    this.error.set(null);
  }

  private buildContext(): string {
    const parts: string[] = [];

    const projectName = this.project.project()?.name;
    if (projectName) parts.push(`Proyecto: ${projectName}`);

    const doc = this.activeDocument();
    if (doc) {
      parts.push(`Documento: ${doc.title}`);
      const text = tiptapToText(doc.content);
      if (text.trim()) parts.push(`\nContenido:\n${text}`);
    }

    return parts.join('\n');
  }

  private scrollToBottom(): void {
    const el = this.messagesEl?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
