# INK-09 — Polish, toolbar del editor y settings

## Objetivo

Spec final de Inkwell. Añade la toolbar de formato al editor, el modal de settings completo, reordenación del binder por drag & drop, el título de la ventana Tauri dinámico y los atajos de teclado que faltaban. Al finalizar la app está en estado MVP usable.

---

## Scope

**Incluido:**
- Toolbar de formato del editor (negrita, cursiva, headings, listas, blockquote, código, separador)
- Modal de settings completo (autosave, snapshots, modelo IA, API key, tema)
- Reordenación del binder por drag & drop (HTML5 nativo)
- Título de ventana Tauri dinámico (proyecto + documento)
- Atajos de teclado `Alt+1` / `Alt+2` para navegación
- Botón "Volver al inicio" (cerrar proyecto) en la nav
- Corrección del toggle de tema en `EditorTopBarComponent` (eliminarlo; ya está en `InkNavComponent`)

---

## Parte 1: Toolbar del editor

### Exponer la instancia del editor en TiptapEditorComponent

Añadir en `tiptap-editor.component.ts`:

```typescript
// Signal que expone la instancia inicializada del editor
readonly editorReady = signal<Editor | null>(null);

// En ngAfterViewInit, tras crear el editor:
ngAfterViewInit(): void {
  this.editor = new Editor({ ... });
  this.editorReady.set(this.editor);
}

ngOnDestroy(): void {
  this.editorReady.set(null);
  // resto del destroy...
}
```

---

### `src/app/features/editor/tiptap/editor-toolbar.component.ts`

```typescript
import { Component, input, signal, effect } from '@angular/core';
import { Editor } from '@tiptap/core';

interface ToolbarButton {
  label: string;
  title: string;
  action: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
  icon: string; // SVG path data
}

@Component({
  selector: 'app-editor-toolbar',
  standalone: true,
  template: `
    @if (editor()) {
      <div class="flex items-center gap-0.5 px-3 py-1.5 border-b border-ink-border
                  bg-ink-panel flex-wrap shrink-0">

        <!-- Headings -->
        @for (level of [1, 2, 3]; track level) {
          <button
            (click)="toggleHeading(level)"
            [title]="'Encabezado ' + level"
            class="toolbar-btn font-serif text-xs font-semibold px-2"
            [class.active]="isHeadingActive(level)">
            H{{ level }}
          </button>
        }

        <div class="toolbar-sep"></div>

        <!-- Negrita -->
        <button
          (click)="editor()!.chain().focus().toggleBold().run()"
          title="Negrita (Ctrl+B)"
          class="toolbar-btn font-bold"
          [class.active]="editor()!.isActive('bold')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5">
            <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
            <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
          </svg>
        </button>

        <!-- Cursiva -->
        <button
          (click)="editor()!.chain().focus().toggleItalic().run()"
          title="Cursiva (Ctrl+I)"
          class="toolbar-btn"
          [class.active]="editor()!.isActive('italic')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <line x1="19" y1="4" x2="10" y2="4"/>
            <line x1="14" y1="20" x2="5" y2="20"/>
            <line x1="15" y1="4" x2="9" y2="20"/>
          </svg>
        </button>

        <!-- Tachado -->
        <button
          (click)="editor()!.chain().focus().toggleStrike().run()"
          title="Tachado"
          class="toolbar-btn"
          [class.active]="editor()!.isActive('strike')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <path d="M16 6C16 6 14.5 4 12 4C9.5 4 7 5.5 7 8C7 10 8.5 11 10 11.5"/>
            <path d="M8 18C8 18 9.5 20 12 20C14.5 20 17 18.5 17 16C17 14 15.5 13 14 12.5"/>
          </svg>
        </button>

        <!-- Código inline -->
        <button
          (click)="editor()!.chain().focus().toggleCode().run()"
          title="Código inline"
          class="toolbar-btn font-mono text-xs"
          [class.active]="editor()!.isActive('code')">
          { }
        </button>

        <div class="toolbar-sep"></div>

        <!-- Lista con viñetas -->
        <button
          (click)="editor()!.chain().focus().toggleBulletList().run()"
          title="Lista con viñetas"
          class="toolbar-btn"
          [class.active]="editor()!.isActive('bulletList')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <line x1="9" y1="6" x2="20" y2="6"/>
            <line x1="9" y1="12" x2="20" y2="12"/>
            <line x1="9" y1="18" x2="20" y2="18"/>
            <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
        </button>

        <!-- Lista numerada -->
        <button
          (click)="editor()!.chain().focus().toggleOrderedList().run()"
          title="Lista numerada"
          class="toolbar-btn"
          [class.active]="editor()!.isActive('orderedList')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <line x1="10" y1="6" x2="21" y2="6"/>
            <line x1="10" y1="12" x2="21" y2="12"/>
            <line x1="10" y1="18" x2="21" y2="18"/>
            <path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
          </svg>
        </button>

        <!-- Blockquote -->
        <button
          (click)="editor()!.chain().focus().toggleBlockquote().run()"
          title="Cita"
          class="toolbar-btn"
          [class.active]="editor()!.isActive('blockquote')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4
                     c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1
                     1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4
                     c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25
                     .25 4-2.75 4v3c0 1 0 1 1 1z"/>
          </svg>
        </button>

        <!-- Bloque de código -->
        <button
          (click)="editor()!.chain().focus().toggleCodeBlock().run()"
          title="Bloque de código"
          class="toolbar-btn font-mono text-xs"
          [class.active]="editor()!.isActive('codeBlock')">
          &lt;/&gt;
        </button>

        <div class="toolbar-sep"></div>

        <!-- Separador horizontal -->
        <button
          (click)="editor()!.chain().focus().setHorizontalRule().run()"
          title="Separador horizontal"
          class="toolbar-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>

        <div class="toolbar-sep"></div>

        <!-- Deshacer -->
        <button
          (click)="editor()!.chain().focus().undo().run()"
          [disabled]="!editor()!.can().undo()"
          title="Deshacer (Ctrl+Z)"
          class="toolbar-btn disabled:opacity-30 disabled:cursor-not-allowed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>

        <!-- Rehacer -->
        <button
          (click)="editor()!.chain().focus().redo().run()"
          [disabled]="!editor()!.can().redo()"
          title="Rehacer (Ctrl+Y)"
          class="toolbar-btn disabled:opacity-30 disabled:cursor-not-allowed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
          </svg>
        </button>

      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .toolbar-btn {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 28px; height: 28px; padding: 0 4px;
      border-radius: 4px; border: none; background: transparent;
      color: var(--ink-subtle); cursor: pointer;
      transition: color 0.15s, background-color 0.15s;
    }
    .toolbar-btn:hover { color: var(--ink-text); background: var(--ink-border); }
    .toolbar-btn.active { color: var(--ink-accent); background: var(--ink-border); }

    .toolbar-sep {
      width: 1px; height: 18px;
      background: var(--ink-border); margin: 0 4px;
    }
  `],
})
export class EditorToolbarComponent {
  editor = input<Editor | null>(null);

  toggleHeading(level: 1 | 2 | 3): void {
    this.editor()?.chain().focus().toggleHeading({ level }).run();
  }

  isHeadingActive(level: 1 | 2 | 3): boolean {
    return this.editor()?.isActive('heading', { level }) ?? false;
  }
}
```

**Integrar en `TiptapEditorComponent`**: añadir `EditorToolbarComponent` encima del área del editor:

```html
<!-- En el template de TiptapEditorComponent -->
<div class="tiptap-host h-full flex flex-col">
  <app-editor-toolbar [editor]="editorReady()"/>
  <div #editorEl class="flex-1 overflow-y-auto px-16 py-12 focus:outline-none">
  </div>
  <!-- pie contador de palabras... -->
</div>
```

---

## Parte 2: Settings modal completo

Reemplaza `InkSettingsModalComponent` de INK-08 con una versión completa con secciones.

### `src/app/shared/components/ink-settings-modal.component.ts` (reemplazar)

```typescript
import { Component, inject, signal, OnInit, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../core/services/ai.service';
import { ProjectService } from '../../core/services/project.service';
import { ThemeService } from '../../core/services/theme.service';
import { InkModalComponent } from './ink-modal.component';
import { InkButtonComponent } from './ink-button.component';

type SettingsSection = 'editor' | 'ai' | 'appearance';

const AI_MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (recomendado)' },
  { id: 'claude-opus-4-20250514',   label: 'Claude Opus 4 (más capaz, más lento)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (más rápido)' },
];

@Component({
  selector: 'ink-settings-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Configuración" [hasActions]="false" (closed)="closed.emit()">

      <div class="flex gap-0 -mx-6 -mt-5">

        <!-- Sidebar de secciones -->
        <div class="flex flex-col w-36 border-r border-ink-border pt-2 pb-4 shrink-0">
          @for (s of sections; track s.id) {
            <button
              (click)="activeSection.set(s.id)"
              class="flex items-center gap-2.5 px-4 py-2.5 text-xs
                     transition-colors text-left"
              [class]="activeSection() === s.id
                ? 'bg-ink-surface text-ink-text font-medium border-r-2 border-ink-accent'
                : 'text-ink-subtle hover:text-ink-text hover:bg-ink-surface'">
              {{ s.label }}
            </button>
          }
        </div>

        <!-- Contenido de la sección -->
        <div class="flex-1 px-6 py-4 min-h-64">

          <!-- Editor -->
          @if (activeSection() === 'editor' && projectService.isLoaded()) {
            <div class="flex flex-col gap-5">

              <div class="flex flex-col gap-1.5">
                <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
                  Autoguardado
                </label>
                <select
                  [(ngModel)]="autosaveInterval"
                  class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                         text-ink-text text-sm focus:outline-none
                         focus:border-ink-accent transition-colors">
                  <option [ngValue]="0">Desactivado</option>
                  <option [ngValue]="15">Cada 15 segundos</option>
                  <option [ngValue]="30">Cada 30 segundos (por defecto)</option>
                  <option [ngValue]="60">Cada minuto</option>
                  <option [ngValue]="300">Cada 5 minutos</option>
                </select>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
                  Máximo de snapshots por documento
                </label>
                <select
                  [(ngModel)]="maxSnapshots"
                  class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                         text-ink-text text-sm focus:outline-none
                         focus:border-ink-accent transition-colors">
                  <option [ngValue]="5">5 snapshots</option>
                  <option [ngValue]="10">10 snapshots (por defecto)</option>
                  <option [ngValue]="20">20 snapshots</option>
                  <option [ngValue]="50">50 snapshots</option>
                </select>
                <p class="text-ink-muted text-xs">
                  Al superar el límite se elimina el más antiguo (FIFO).
                </p>
              </div>

              <ink-button variant="primary" (clicked)="saveEditorSettings()">
                Guardar cambios
              </ink-button>

            </div>
          }

          @if (activeSection() === 'editor' && !projectService.isLoaded()) {
            <p class="text-ink-subtle text-sm mt-4">
              Abre un proyecto para configurar las opciones del editor.
            </p>
          }

          <!-- IA -->
          @if (activeSection() === 'ai') {
            <div class="flex flex-col gap-5">

              <div class="flex flex-col gap-1.5">
                <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
                  Anthropic API Key
                </label>
                <input
                  [(ngModel)]="apiKeyInput"
                  type="password"
                  placeholder="sk-ant-..."
                  class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                         text-ink-text text-sm placeholder:text-ink-muted font-mono
                         focus:outline-none focus:border-ink-accent transition-colors"/>
                <p class="text-ink-muted text-xs leading-relaxed">
                  Guardada únicamente en este dispositivo (localStorage). Nunca se
                  envía a ningún servidor propio; solo a api.anthropic.com.
                </p>
                @if (aiService.hasApiKey()) {
                  <div class="flex items-center justify-between px-3 py-1.5 rounded
                              bg-ink-bg border border-ink-success/30 mt-1">
                    <span class="text-ink-success text-xs">✓ API key configurada</span>
                    <button
                      (click)="clearApiKey()"
                      class="text-ink-subtle text-xs hover:text-ink-danger transition-colors">
                      Eliminar
                    </button>
                  </div>
                }
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
                  Modelo
                </label>
                <select
                  [(ngModel)]="selectedModel"
                  class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                         text-ink-text text-sm focus:outline-none
                         focus:border-ink-accent transition-colors">
                  @for (model of aiModels; track model.id) {
                    <option [value]="model.id">{{ model.label }}</option>
                  }
                </select>
              </div>

              <ink-button
                variant="primary"
                [disabled]="!apiKeyInput.trim() && !aiService.hasApiKey()"
                (clicked)="saveAiSettings()">
                Guardar cambios
              </ink-button>

            </div>
          }

          <!-- Apariencia -->
          @if (activeSection() === 'appearance') {
            <div class="flex flex-col gap-5">

              <div class="flex flex-col gap-2">
                <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
                  Tema
                </label>
                <div class="flex gap-3">
                  @for (t of themes; track t.id) {
                    <button
                      (click)="themeService.setTheme(t.id)"
                      class="flex flex-col items-center gap-2 p-3 rounded-lg border-2
                             transition-all"
                      [class]="themeService.theme() === t.id
                        ? 'border-ink-accent bg-ink-surface'
                        : 'border-ink-border hover:border-ink-muted'">
                      <!-- Preview del tema -->
                      <div
                        class="w-16 h-10 rounded border border-black/10 overflow-hidden">
                        <div class="h-3 w-full" [style.background]="t.bg"></div>
                        <div class="h-7 w-full flex gap-1 p-1"
                             [style.background]="t.surface">
                          <div class="w-3 rounded-sm" [style.background]="t.accent"
                               style="opacity: 0.7"></div>
                          <div class="flex-1 flex flex-col gap-0.5 pt-0.5">
                            <div class="h-1 w-full rounded" [style.background]="t.text"
                                 style="opacity: 0.5"></div>
                            <div class="h-1 w-3/4 rounded" [style.background]="t.text"
                                 style="opacity: 0.3"></div>
                          </div>
                        </div>
                      </div>
                      <span class="text-ink-text text-xs">{{ t.label }}</span>
                    </button>
                  }
                </div>
              </div>

            </div>
          }

        </div>
      </div>

    </ink-modal>
  `,
})
export class InkSettingsModalComponent implements OnInit {
  aiService      = inject(AiService);
  projectService = inject(ProjectService);
  themeService   = inject(ThemeService);

  closed = output<void>();

  activeSection = signal<SettingsSection>('editor');

  // Editor settings
  autosaveInterval = 30;
  maxSnapshots     = 10;

  // AI settings
  apiKeyInput   = '';
  selectedModel = 'claude-sonnet-4-20250514';

  readonly sections = [
    { id: 'editor' as SettingsSection,     label: 'Editor' },
    { id: 'ai' as SettingsSection,         label: 'Asistente IA' },
    { id: 'appearance' as SettingsSection, label: 'Apariencia' },
  ];

  readonly aiModels = AI_MODELS;

  readonly themes = [
    {
      id: 'dark' as const, label: 'Mocha (oscuro)',
      bg: '#1e1e2e', surface: '#181825', accent: '#cba6f7', text: '#cdd6f4',
    },
    {
      id: 'light' as const, label: 'Latte (claro)',
      bg: '#eff1f5', surface: '#e6e9ef', accent: '#8839ef', text: '#4c4f69',
    },
  ];

  ngOnInit(): void {
    const settings = this.projectService.project()?.settings;
    if (settings) {
      this.autosaveInterval = settings.autosaveInterval;
      this.maxSnapshots     = settings.maxSnapshots;
      this.selectedModel    = settings.aiModel;
    }
  }

  async saveEditorSettings(): Promise<void> {
    await this.projectService.updateSettings({
      autosaveInterval: this.autosaveInterval,
      maxSnapshots:     this.maxSnapshots,
    });
    this.closed.emit();
  }

  saveAiSettings(): void {
    if (this.apiKeyInput.trim()) this.aiService.saveApiKey(this.apiKeyInput);
    if (this.projectService.isLoaded()) {
      this.projectService.updateSettings({ aiModel: this.selectedModel });
    }
    this.closed.emit();
  }

  clearApiKey(): void {
    this.aiService.clearApiKey();
    this.apiKeyInput = '';
  }
}
```

---

## Parte 3: Botón Settings en InkNavComponent

Añadir al final de `InkNavComponent` (antes del toggle de tema), un botón para abrir settings:

```typescript
// Añadir signal y output
showSettings = signal(false);
```

```html
<!-- Botón settings -->
<button
  (click)="showSettings.set(true)"
  title="Configuración"
  class="nav-icon">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
             a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
             A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83
             -2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0
             1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2
             0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3
             a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06
             -.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0
             0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
</button>

<!-- Modal settings -->
@if (showSettings()) {
  <ink-settings-modal (closed)="showSettings.set(false)"/>
}
```

Añadir `InkSettingsModalComponent` a los imports del componente.

---

## Parte 4: Botón "Cerrar proyecto" en InkNavComponent

Añadir botón para volver al inicio (cierra el proyecto activo).

```typescript
private projectService = inject(ProjectService);
private router = inject(Router);

closeProject(): void {
  this.projectService.closeProject();
  this.router.navigate(['/']);
}
```

```html
<!-- Añadir debajo del logo, antes de los botones de ruta -->
@if (projectService.isLoaded()) {
  <button
    (click)="closeProject()"
    title="Cerrar proyecto y volver al inicio"
    class="nav-icon">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  </button>
}
```

---

## Parte 5: Título de ventana Tauri dinámico

### Nuevo comando Tauri en `fs_commands.rs`

```rust
use tauri::Manager;

/// Actualiza el título de la ventana principal.
#[tauri::command]
pub fn set_window_title(app: AppHandle, title: String) -> Result<(), String> {
    app.get_webview_window("main")
       .ok_or("Ventana no encontrada".to_string())?
       .set_title(&title)
       .map_err(|e| e.to_string())
}
```

Registrar en `main.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... comandos existentes ...
    set_window_title,
])
```

### En `TauriBridgeService`

```typescript
setWindowTitle(title: string): Promise<void> {
  return invoke<void>('set_window_title', { title });
}
```

### En `EditorLayoutComponent`

Actualizar el título de ventana al abrir un documento y al cambiar el título:

```typescript
private updateWindowTitle(): void {
  const project = this.projectService.project()?.name ?? 'Inkwell';
  const doc     = this.activeDocument()?.title;
  const title   = doc ? `${doc} — ${project}` : project;
  this.bridge.setWindowTitle(title).catch(() => {});
}
```

Llamar a `updateWindowTitle()` en:
- `openDocument()` tras cargar el documento
- `onTitleChanged()` tras renombrar

---

## Parte 6: Reordenación del binder (drag & drop HTML5)

### Modificar `BinderNodeComponent`

Añadir atributos `draggable` y los eventos de drag:

```typescript
// Nuevos outputs
dragStarted = output<string>();   // emite el id del nodo
draggedOver = output<string>();   // emite el id del nodo destino
dropped     = output<{ draggedId: string; targetId: string }>();
```

```html
<!-- En la fila del nodo, añadir: -->
<div
  ...
  draggable="true"
  (dragstart)="dragStarted.emit(node().id)"
  (dragover)="$event.preventDefault(); draggedOver.emit(node().id)"
  (drop)="$event.preventDefault(); dropped.emit({ draggedId: draggedId, targetId: node().id })"
  [class.drag-over]="isDragTarget()">
```

### Modificar `BinderComponent`

```typescript
draggedNodeId = signal<string | null>(null);

onDragStart(id: string): void {
  this.draggedNodeId.set(id);
}

onDrop(event: { draggedId: string; targetId: string }): void {
  if (event.draggedId === event.targetId) return;
  this.moveDraggedNode(event.draggedId, event.targetId);
  this.draggedNodeId.set(null);
}

private async moveDraggedNode(draggedId: string, targetId: string): Promise<void> {
  const project = this.projectService.project();
  if (!project) return;

  // Extraer el nodo arrastrado del árbol
  const dragged = findNode(project.tree, draggedId);
  if (!dragged) return;

  // Construir el nuevo árbol: eliminar el nodo de su posición actual
  // e insertarlo después del nodo destino
  const treeWithoutDragged = deleteNode(project.tree, draggedId);
  const newTree = insertAfter(treeWithoutDragged, targetId, dragged);

  await this.projectService.updateTree(newTree);
}
```

**Añadir la función pura `insertAfter`** en `project.service.ts`:

```typescript
// Insertar nodo inmediatamente después del nodo con id targetId (en el mismo nivel)
function insertAfter(tree: TreeNode[], targetId: string, node: TreeNode): TreeNode[] {
  const result: TreeNode[] = [];
  for (const n of tree) {
    result.push({ ...n, children: insertAfter(n.children, targetId, node) });
    if (n.id === targetId) result.push(node);
  }
  return result;
}
```

---

## Parte 7: Atajos de teclado globales

### En `AppComponent`

```typescript
import { Component, inject, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectService } from './core/services/project.service';

@Component({ ... })
export class AppComponent implements OnInit {
  private router         = inject(Router);
  private projectService = inject(ProjectService);

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.projectService.isLoaded()) return;

    if (event.altKey && event.key === '1') {
      event.preventDefault();
      this.router.navigate(['/editor']);
    }
    if (event.altKey && event.key === '2') {
      event.preventDefault();
      this.router.navigate(['/boards']);
    }
  }
}
```

---

## Criterios de aceptación

**Toolbar del editor:**
- [ ] La toolbar aparece entre la top-bar y el área de texto
- [ ] H1, H2, H3 aplican/quitan el heading correspondiente y se resaltan cuando están activos
- [ ] Negrita, cursiva y tachado funcionan y muestran su estado activo
- [ ] Listas con viñetas y numeradas funcionan
- [ ] Blockquote aplica/quita el estilo de cita
- [ ] Bloque de código aplica/quita el estilo
- [ ] Separador horizontal inserta una línea `<hr>`
- [ ] Deshacer/Rehacer están deshabilitados cuando no hay historial disponible
- [ ] La toolbar no aparece en modo focus

**Settings:**
- [ ] El botón de settings en `InkNavComponent` abre el modal
- [ ] Sección "Editor": cambiar y guardar autosave e intervalo actualiza `project.json`
- [ ] Sección "Editor": sin proyecto abierto muestra mensaje informativo
- [ ] Sección "IA": guardar API key la persiste; limpiar la elimina
- [ ] Sección "IA": el selector de modelo guarda en `project.json`
- [ ] Sección "Apariencia": los dos previews de tema son visuales y el click aplica el tema

**Ventana Tauri:**
- [ ] El título de la ventana muestra `Documento — Proyecto` al abrir un documento
- [ ] El título se actualiza al renombrar el documento
- [ ] Sin documento abierto, el título muestra solo el nombre del proyecto

**Binder drag & drop:**
- [ ] Arrastrar un documento y soltarlo sobre otro lo reposiciona en el árbol
- [ ] El nodo destino muestra algún indicador visual durante el arrastre
- [ ] La posición nueva persiste en `project.json`

**Navegación:**
- [ ] `Alt+1` navega a `/editor` desde cualquier vista
- [ ] `Alt+2` navega a `/boards` desde cualquier vista
- [ ] El botón de casa en la nav cierra el proyecto y vuelve a `/`

---

## Limpieza final

Antes de entregar el MVP, verificar:

- [ ] Eliminar el bloque de prueba del `ProjectManagerComponent` de INK-02 si no se eliminó en INK-04
- [ ] Eliminar el toggle de tema de `EditorTopBarComponent` (está en la nav)
- [ ] No hay `console.log` de desarrollo en el código
- [ ] `npm run build` produce un bundle limpio sin warnings de TypeScript
- [ ] `npm run tauri build` genera el instalador `.deb` correctamente en Linux

---

## Lo que queda fuera del MVP (backlog)

Estas funcionalidades se pueden implementar en fases posteriores:

- Diff visual entre dos snapshots
- Modo escritura con fuente configurable y ancho de columna ajustable
- Búsqueda de texto dentro del proyecto
- Exportación a `.docx`, `.pdf` y Markdown
- Historial de conversación IA persistente entre sesiones
- Redimensionado de tarjetas en los tableros
- Estadísticas de escritura (palabras por sesión, progreso hacia objetivo)
- Soporte para imágenes incrustadas en el editor
