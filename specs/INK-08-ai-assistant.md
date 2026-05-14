# INK-08 — AI Assistant

## Objetivo

Implementar el panel lateral de asistencia IA. Integra la API de Anthropic directamente desde el frontend con soporte de streaming. El panel tiene tres modos de asistencia, mantiene historial de conversación durante la sesión y permite insertar la respuesta del modelo directamente en el editor en la posición del cursor.

---

## Componentes a crear / modificar

```
src/app/
  core/
    services/
      ai.service.ts                    ← nuevo
  features/
    editor/
      ai-assistant/
        ai-assistant-panel.component.ts  ← nuevo
      tiptap/
        tiptap-editor.component.ts       ← modificar: exponer insertAtCursor()
      editor-layout.component.ts         ← modificar: integrar panel IA
      top-bar/
        editor-top-bar.component.ts      ← modificar: añadir botón IA
  shared/
    components/
      ink-settings-modal.component.ts    ← nuevo: configurar API key
```

---

## Parte 1: AiService

### `src/app/core/services/ai.service.ts`

```typescript
import { Injectable, signal } from '@angular/core';

export type AiMode = 'analyze' | 'review' | 'brainstorm';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPTS: Record<AiMode, string> = {
  analyze: `Eres un asistente experto en escritura creativa y narrativa.
Tu función es analizar escenas literarias: estructura, ritmo, tensión dramática,
consistencia de personajes, point of view, y eficacia narrativa.
Responde siempre en el mismo idioma que el texto que se te proporcione.
Sé directo, constructivo y específico. Cita fragmentos del texto cuando sea relevante.`,

  review: `Eres un editor literario profesional.
Tu función es revisar textos: corrección gramatical, ortográfica y de estilo,
claridad, coherencia, fluidez y precisión del lenguaje.
Responde siempre en el mismo idioma que el texto que se te proporcione.
Organiza tus comentarios de mayor a menor importancia. Propón alternativas concretas.`,

  brainstorm: `Eres un compañero creativo para escritores.
Tu función es ayudar a explorar ideas: tramas, personajes, mundos, conflictos,
giros narrativos, motivaciones, y cualquier elemento de la historia.
Responde siempre en el mismo idioma en que te hablen.
Sé generoso con las ideas, propón variantes y haz preguntas que abran posibilidades.`,
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL             = 'claude-sonnet-4-20250514';

@Injectable({ providedIn: 'root' })
export class AiService {
  readonly apiKey      = signal<string>(localStorage.getItem('inkwell-api-key') ?? '');
  readonly hasApiKey   = () => this.apiKey().trim().length > 0;

  saveApiKey(key: string): void {
    this.apiKey.set(key.trim());
    localStorage.setItem('inkwell-api-key', key.trim());
  }

  clearApiKey(): void {
    this.apiKey.set('');
    localStorage.removeItem('inkwell-api-key');
  }

  /**
   * Envía un mensaje al modelo y devuelve un AsyncGenerator que emite
   * chunks de texto a medida que llegan (streaming SSE).
   *
   * @param messages  Historial de conversación (sin el system prompt)
   * @param mode      Modo de asistencia; determina el system prompt
   * @param context   Contexto adicional (título del proyecto + texto del documento)
   */
  async *streamMessage(
    messages: AiMessage[],
    mode: AiMode,
    context: string,
  ): AsyncGenerator<string> {
    if (!this.hasApiKey()) throw new Error('API key no configurada');

    // Inyectar contexto en el primer mensaje de usuario si existe
    const messagesWithContext = this.injectContext(messages, context);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':                    'application/json',
        'x-api-key':                        this.apiKey(),
        'anthropic-version':               '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 2048,
        stream:     true,
        system:     SYSTEM_PROMPTS[mode],
        messages:   messagesWithContext,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { error?: { message?: string } }).error?.message
        ?? `Error ${response.status} de la API`
      );
    }

    // Leer el stream SSE
    const reader  = response.body!.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' &&
              parsed.delta?.type === 'text_delta') {
            yield parsed.delta.text as string;
          }
        } catch {
          // Ignorar líneas malformadas
        }
      }
    }
  }

  /**
   * Inyecta el contexto del proyecto/documento como prefijo
   * del primer mensaje de usuario en el historial.
   */
  private injectContext(messages: AiMessage[], context: string): AiMessage[] {
    if (!context.trim() || messages.length === 0) return messages;

    const [first, ...rest] = messages;
    return [
      {
        role:    'user',
        content: `[CONTEXTO DEL DOCUMENTO]\n${context}\n\n[MENSAJE]\n${first.content}`,
      },
      ...rest,
    ];
  }
}
```

---

## Parte 2: InkSettingsModalComponent

Modal mínimo para configurar la API key. Se reutilizará en INK-09 (settings completos).

### `src/app/shared/components/ink-settings-modal.component.ts`

```typescript
import { Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../core/services/ai.service';
import { InkModalComponent } from './ink-modal.component';
import { InkButtonComponent } from './ink-button.component';

@Component({
  selector: 'ink-settings-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Configuración de IA" (closed)="closed.emit()">

      <div class="flex flex-col gap-5">

        <div class="flex flex-col gap-1.5">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Anthropic API Key
          </label>
          <input
            [(ngModel)]="keyInput"
            type="password"
            placeholder="sk-ant-..."
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-sm placeholder:text-ink-muted font-mono
                   focus:outline-none focus:border-ink-accent transition-colors"/>
          <p class="text-ink-subtle text-xs leading-relaxed">
            La clave se guarda únicamente en tu dispositivo (localStorage).
            Nunca sale de la app salvo para llamar directamente a api.anthropic.com.
          </p>
        </div>

        @if (ai.hasApiKey()) {
          <div class="flex items-center gap-2 px-3 py-2 rounded
                      bg-ink-bg border border-ink-success/30">
            <span class="text-ink-success text-xs">✓ API key configurada</span>
            <button
              (click)="clearKey()"
              class="ml-auto text-ink-subtle text-xs hover:text-ink-danger
                     transition-colors">
              Eliminar
            </button>
          </div>
        }
      </div>

      <ng-container slot="actions">
        <ink-button variant="ghost" (clicked)="closed.emit()">Cancelar</ink-button>
        <ink-button
          variant="primary"
          [disabled]="!keyInput.trim()"
          (clicked)="save()">
          Guardar
        </ink-button>
      </ng-container>

    </ink-modal>
  `,
})
export class InkSettingsModalComponent {
  ai = inject(AiService);
  closed = output<void>();

  keyInput = '';

  save(): void {
    this.ai.saveApiKey(this.keyInput);
    this.closed.emit();
  }

  clearKey(): void {
    this.ai.clearApiKey();
    this.keyInput = '';
  }
}
```

---

## Parte 3: Modificación a TiptapEditorComponent

Añadir un método público `insertAtCursor(text: string)` para que el panel IA pueda insertar texto en la posición actual del cursor.

En `tiptap-editor.component.ts`, añadir el método:

```typescript
/**
 * Inserta texto en la posición actual del cursor.
 * Si hay selección activa, la reemplaza.
 * Llamar solo cuando el editor está inicializado.
 */
insertAtCursor(text: string): void {
  if (!this.editor) return;
  this.editor
    .chain()
    .focus()
    .insertContent(text)
    .run();
}
```

---

## Parte 4: AiAssistantPanelComponent

### `src/app/features/editor/ai-assistant/ai-assistant-panel.component.ts`

```typescript
import {
  Component, inject, signal, computed,
  input, output, ViewChild, ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService, AiMessage, AiMode } from '../../../core/services/ai.service';
import { ProjectService }  from '../../../core/services/project.service';
import { DocumentService } from '../../../core/services/document.service';
import { DocumentFile }    from '../../../core/models/document.model';
import { ToastService }    from '../../../shared/services/toast.service';
import { tiptapToText }    from '../../../shared/utils/tiptap-to-text';
import { InkSettingsModalComponent } from '../../../shared/components/ink-settings-modal.component';

const MODE_LABELS: Record<AiMode, string> = {
  analyze:    'Analizar escena',
  review:     'Revisar texto',
  brainstorm: 'Brainstorm',
};

const MODE_PLACEHOLDERS: Record<AiMode, string> = {
  analyze:    '¿Qué quieres que analice de esta escena?',
  review:     '¿Qué aspectos del texto quieres revisar?',
  brainstorm: '¿Sobre qué quieres explorar ideas?',
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

  ai             = inject(AiService);
  private project = inject(ProjectService);
  private toast   = inject(ToastService);

  activeMode      = signal<AiMode>('analyze');
  messages        = signal<AiMessage[]>([]);
  streamingContent = signal<string>('');
  isStreaming     = signal(false);
  error           = signal<string | null>(null);
  showSettings    = signal(false);
  userInput       = '';

  readonly modeKeys        = ['analyze', 'review', 'brainstorm'] as AiMode[];
  readonly modeLabels      = MODE_LABELS;
  readonly modePlaceholders = MODE_PLACEHOLDERS;
  readonly modeDescription: Record<AiMode, string> = {
    analyze:    'Analiza la estructura, ritmo y eficacia narrativa de la escena activa.',
    review:     'Revisa gramática, estilo y coherencia del texto.',
    brainstorm: 'Explora ideas de trama, personajes y mundo de forma libre.',
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
```

---

## Parte 5: Modificaciones a EditorTopBarComponent

Añadir input/output para el panel IA junto al botón de historial de snapshots.

**Nuevos inputs/outputs:**
```typescript
showAiPanel = input<boolean>(false);
aiPanelToggled = output<void>();
```

**Nuevo botón en el template** (añadir después del botón de snapshots):

```html
<!-- Separador -->
<div class="w-px h-5 bg-ink-border shrink-0"></div>

<!-- Botón toggle panel IA -->
<button
  (click)="aiPanelToggled.emit()"
  title="Asistente IA (Ctrl+Shift+A)"
  class="p-1.5 rounded transition-colors"
  [class]="showAiPanel()
    ? 'text-ink-accent bg-ink-border'
    : 'text-ink-subtle hover:text-ink-text hover:bg-ink-border'">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <path d="M8 9h8M8 13h5" stroke-linecap="round"/>
  </svg>
</button>
```

---

## Parte 6: Modificaciones a EditorLayoutComponent

Integrar el panel IA y la lógica de inserción en el editor.

**Añadir imports:**
```typescript
import { AiAssistantPanelComponent } from './ai-assistant/ai-assistant-panel.component';
```

**Añadir ViewChild para el editor TipTap:**
```typescript
@ViewChild(TiptapEditorComponent) tiptapEditor?: TiptapEditorComponent;
```

**Añadir signal:**
```typescript
showAiPanel = signal(false);
```

**Actualizar binding de top-bar:**
```html
<app-editor-top-bar
  ...
  [showAiPanel]="showAiPanel()"
  (aiPanelToggled)="showAiPanel.update(v => !v)"
  .../>
```

**Añadir panel en el template** (reemplazar la franja placeholder "IA"):

```html
<!-- Panel IA (reemplaza la franja placeholder de INK-05/06) -->
@if (showAiPanel() && !focusMode()) {
  <app-ai-assistant-panel
    [activeDocument]="activeDocument()"
    (insertIntoEditor)="onInsertIntoEditor($event)"
    (closed)="showAiPanel.set(false)"/>
} @else if (!showSnapshotsPanel() && !focusMode()) {
  <!-- Franja mínima cuando ningún panel está abierto -->
  <div class="w-8 shrink-0 border-l border-ink-border bg-ink-panel
              flex flex-col items-center pt-3 gap-3">
    <!-- Botón IA colapsado -->
    <button
      (click)="showAiPanel.set(true)"
      title="Abrir asistente IA (Ctrl+Shift+A)"
      class="p-1.5 rounded text-ink-muted hover:text-ink-accent
             hover:bg-ink-border transition-colors">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  </div>
}
```

**Añadir método para insertar texto en el editor:**
```typescript
onInsertIntoEditor(text: string): void {
  this.tiptapEditor?.insertAtCursor(text);
}
```

**Actualizar el HostListener de teclado** para añadir el shortcut de IA:
```typescript
if (event.ctrlKey && event.shiftKey && event.key === 'A') {
  event.preventDefault();
  this.showAiPanel.update(v => !v);
}
```

**Lógica de exclusión de paneles** — solo un panel puede estar abierto a la vez. Actualizar los métodos de toggle:
```typescript
// Al abrir el panel IA, cerrar snapshots
showAiPanel.update(v => {
  if (!v) this.showSnapshotsPanel.set(false);
  return !v;
});

// Al abrir snapshots, cerrar IA
showSnapshotsPanel.update(v => {
  if (!v) this.showAiPanel.set(false);
  return !v;
});
```

---

## Criterios de aceptación

**Configuración:**
- [ ] Sin API key, el panel muestra aviso con enlace a configuración
- [ ] El modal de settings permite introducir y guardar la API key
- [ ] La API key persiste entre sesiones (localStorage)
- [ ] El icono de settings se pone en amarillo cuando no hay API key configurada

**Panel IA:**
- [ ] `Ctrl+Shift+A` abre/cierra el panel
- [ ] El botón en la top bar abre/cierra el panel y queda resaltado cuando está abierto
- [ ] Abrir el panel IA cierra el panel de snapshots (y viceversa)
- [ ] En modo focus, el panel no se muestra
- [ ] Los tres modos muestran su descripción en el estado vacío

**Conversación:**
- [ ] El selector de modo cambia el system prompt activo
- [ ] Enter envía el mensaje; Shift+Enter añade nueva línea
- [ ] Los mensajes del usuario aparecen a la derecha; los del asistente a la izquierda
- [ ] La respuesta del modelo se muestra en streaming (caracteres apareciendo progresivamente)
- [ ] El cursor parpadeante aparece al final del texto durante el streaming
- [ ] El scroll baja automáticamente al aparecer contenido nuevo
- [ ] El botón "Limpiar conversación" limpia el historial
- [ ] Si la API devuelve error, se muestra el mensaje de error y se elimina el mensaje de usuario

**Contexto:**
- [ ] El contexto enviado incluye nombre del proyecto + título del documento + texto plano del contenido
- [ ] Si no hay documento abierto, solo se envía el nombre del proyecto

**Inserción en editor:**
- [ ] Cada respuesta del asistente tiene botón "Insertar en editor"
- [ ] Al pulsarlo, el texto se inserta en la posición actual del cursor del editor TipTap
- [ ] El editor recupera el foco después de la inserción

---

## Lo que NO hacer en esta spec

- No implementar historial de conversación persistente entre sesiones
- No añadir soporte para adjuntar imágenes o archivos al chat
- No implementar selección de modelo en esta spec (va en INK-09 settings completos)
- No mostrar el número de tokens usados
