import {
  Component, inject, signal,
  input, output, ViewChild, ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService, AiMessage, AiMode } from '../../../core/services/ai.service';
import { ProjectService }  from '../../../core/services/project.service';
import { DocumentFile }    from '../../../core/models/document.model';
import { tiptapToText }    from '../../../shared/utils/tiptap-to-text';
import { InkSettingsModalComponent } from '../../../shared/components/ink-settings-modal.component';

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
  imports: [FormsModule, InkSettingsModalComponent],
  template: `
    <aside class="flex flex-col h-full w-80 border-l border-ink-border
                  bg-ink-panel shrink-0">

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3
                  border-b border-ink-border shrink-0">
        <span class="text-ink-subtle text-xs font-medium uppercase tracking-widest">
          Asistente IA
        </span>
        <div class="flex gap-1">
          <!-- Botón settings (API key) -->
          <button
            (click)="showSettings.set(true)"
            title="Configurar API key"
            class="p-1 rounded text-ink-subtle hover:text-ink-text
                   hover:bg-ink-border transition-colors"
            [class.text-ink-warning]="!ai.hasApiKey()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83
                       2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1
                       1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65
                       0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65
                       0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65
                       1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1
                       2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51
                       V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0
                       1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0
                       19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65
                       1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <!-- Botón limpiar historial -->
          <button
            (click)="clearHistory()"
            title="Limpiar conversación"
            [disabled]="messages().length === 0"
            class="p-1 rounded text-ink-subtle hover:text-ink-text
                   hover:bg-ink-border transition-colors disabled:opacity-30
                   disabled:cursor-not-allowed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/>
            </svg>
          </button>
          <!-- Cerrar panel -->
          <button
            (click)="closed.emit()"
            class="p-1 rounded text-ink-subtle hover:text-ink-text
                   hover:bg-ink-border transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586 5.207
                       2.793a1 1 0 0 0-1.414 1.414L6.586 7l-2.793 2.793a1
                       1 0 1 0 1.414 1.414L8 8.414l2.793 2.793a1 1 0 0 0
                       1.414-1.414L9.414 7l2.793-2.793z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Sin API key -->
      @if (!ai.hasApiKey()) {
        <div class="flex flex-col items-center gap-3 m-4 p-4 rounded-lg
                    border border-ink-warning/30 bg-ink-bg">
          <p class="text-ink-warning text-xs text-center leading-relaxed">
            Configura tu Anthropic API key para usar el asistente.
          </p>
          <button
            (click)="showSettings.set(true)"
            class="text-ink-accent text-xs hover:underline">
            Abrir configuración →
          </button>
        </div>
      }

      <!-- Selector de modo -->
      <div class="flex gap-1 px-3 py-2 border-b border-ink-border shrink-0">
        @for (modeKey of modeKeys; track modeKey) {
          <button
            (click)="activeMode.set(modeKey)"
            class="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors"
            [class]="activeMode() === modeKey
              ? 'bg-ink-surface text-ink-accent border border-ink-accent/30'
              : 'text-ink-subtle hover:text-ink-text hover:bg-ink-surface'">
            {{ modeLabels[modeKey] }}
          </button>
        }
      </div>

      <!-- Historial de mensajes -->
      <div
        #messagesEl
        class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">

        @if (messages().length === 0) {
          <div class="flex flex-col items-center gap-3 mt-8 opacity-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5" class="text-ink-subtle">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p class="text-ink-subtle text-xs text-center leading-relaxed">
              Modo: <strong class="text-ink-text">{{ modeLabels[activeMode()] }}</strong><br>
              {{ modeDescription[activeMode()] }}
            </p>
          </div>
        }

        @for (msg of messages(); track $index) {
          <div class="flex flex-col gap-1.5"
               [class]="msg.role === 'user' ? 'items-end' : 'items-start'">

            <!-- Burbuja -->
            <div
              class="max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed"
              [class]="msg.role === 'user'
                ? 'bg-ink-accent/20 text-ink-text border border-ink-accent/20'
                : 'bg-ink-surface text-ink-text border border-ink-border'">
              <p class="whitespace-pre-wrap break-words">{{ msg.content }}</p>
            </div>

            <!-- Botón insertar en editor (solo respuestas del asistente) -->
            @if (msg.role === 'assistant') {
              <button
                (click)="insertIntoEditor.emit(msg.content)"
                title="Insertar en el editor"
                class="flex items-center gap-1.5 text-ink-subtle text-xs
                       hover:text-ink-accent transition-colors px-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <polyline points="9,10 4,15 9,20"/>
                  <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                </svg>
                Insertar en editor
              </button>
            }
          </div>
        }

        <!-- Respuesta en streaming -->
        @if (streamingContent()) {
          <div class="flex flex-col items-start gap-1.5">
            <div class="max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed
                        bg-ink-surface text-ink-text border border-ink-border">
              <p class="whitespace-pre-wrap break-words">{{ streamingContent() }}</p>
              <span class="inline-block w-1.5 h-3.5 bg-ink-accent ml-0.5
                           animate-pulse align-middle"></span>
            </div>
          </div>
        }

        <!-- Error -->
        @if (error()) {
          <div class="px-3 py-2 rounded-lg bg-ink-bg border border-ink-danger/30">
            <p class="text-ink-danger text-xs">{{ error() }}</p>
          </div>
        }
      </div>

      <!-- Input de mensaje -->
      <div class="px-3 py-3 border-t border-ink-border shrink-0">
        <div class="flex flex-col gap-2">
          <textarea
            [(ngModel)]="userInput"
            [placeholder]="modePlaceholders[activeMode()]"
            [disabled]="isStreaming()"
            rows="3"
            (keydown)="onKeyDown($event)"
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-xs placeholder:text-ink-muted resize-none
                   focus:outline-none focus:border-ink-accent transition-colors
                   disabled:opacity-50">
          </textarea>
          <div class="flex items-center justify-between">
            <span class="text-ink-muted text-xs">Enter envía · Shift+Enter nueva línea</span>
            <button
              (click)="send()"
              [disabled]="!canSend()"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs
                     font-medium transition-colors disabled:opacity-30
                     disabled:cursor-not-allowed"
              [class]="canSend()
                ? 'bg-ink-accent text-ink-panel hover:opacity-90'
                : 'bg-ink-surface text-ink-subtle'">
              @if (isStreaming()) {
                <span class="inline-block w-3 h-3 border border-current
                             border-t-transparent rounded-full animate-spin"></span>
              } @else {
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              }
              Enviar
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Modal settings -->
    @if (showSettings()) {
      <ink-settings-modal (closed)="showSettings.set(false)"/>
    }
  `,
})
export class AiAssistantPanelComponent implements AfterViewChecked {
  @ViewChild('messagesEl') messagesEl!: ElementRef<HTMLDivElement>;

  /** Documento activo en el editor */
  activeDocument = input<DocumentFile | null>(null);

  insertIntoEditor = output<string>();
  closed           = output<void>();

  ai              = inject(AiService);
  private project = inject(ProjectService);

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

  canSend = () =>
    this.userInput.trim().length > 0 &&
    !this.isStreaming() &&
    this.ai.hasApiKey();

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
