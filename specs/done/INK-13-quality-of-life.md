# INK-13 — Calidad de vida

## Objetivo

Mejoras de productividad y comodidad que no son críticas pero tienen un impacto notable en la experiencia diaria del escritor: objetivo de palabras por sesión, modo máquina de escribir, backup manual del proyecto y referencia de atajos de teclado.

---

## Scope

- **Objetivo de sesión** — popover en el binder footer; progreso visible mientras escribes
- **Modo máquina de escribir** — la línea activa se mantiene centrada verticalmente en el editor
- **Backup manual** — ZIP del proyecto completo con timestamp, guardado donde el usuario elija
- **Referencia de atajos** — modal con todos los atajos de la app, accesible con `?`

---

## Parte 1: Objetivo de sesión

### Estado del objetivo en `EditorLayoutComponent`

El objetivo es por sesión — no se persiste en disco, vive en memoria mientras el proyecto está abierto.

```typescript
// Nuevos signals en EditorLayoutComponent
sessionGoal        = signal<number>(0);       // 0 = sin objetivo
sessionWordsAdded  = signal<number>(0);       // palabras añadidas en esta sesión
sessionBaseCount   = signal<number>(0);       // palabras al inicio de la sesión

// Computed: progreso de la sesión (0-100)
sessionProgress = computed(() => {
  const goal = this.sessionGoal();
  if (goal === 0) return 0;
  return Math.min(100, Math.round((this.sessionWordsAdded() / goal) * 100));
});

sessionGoalReached = computed(() =>
  this.sessionGoal() > 0 && this.sessionWordsAdded() >= this.sessionGoal()
);
```

Al abrir un documento, guardar el recuento de palabras como base de la sesión:

```typescript
async openDocument(node: TreeNode): Promise<void> {
  // ...código existente...
  const doc = await this.docService.loadDocument(node.id);
  // ...

  // Si es el primer documento de la sesión, establecer base
  if (this.sessionBaseCount() === 0) {
    this.sessionBaseCount.set(this.projectService.totalWordCount());
  }
}
```

Al guardar un documento, actualizar las palabras añadidas en sesión:

```typescript
private async saveCurrentDocument(): Promise<void> {
  // ...código existente de guardado...
  const newTotal = this.projectService.totalWordCount();
  const added    = Math.max(0, newTotal - this.sessionBaseCount());
  this.sessionWordsAdded.set(added);
}
```

---

### Modificar `BinderFooterComponent`

Ampliar el footer para incluir el objetivo de sesión:

```typescript
import { Component, inject, input, output, signal, computed } from '@angular/core';
import { ProjectService } from '../../../core/services/project.service';

@Component({
  selector: 'app-binder-footer',
  standalone: true,
  template: `
    <div class="flex flex-col border-t border-ink-border bg-ink-panel shrink-0">

      <!-- Barra de progreso de sesión (solo si hay objetivo) -->
      @if (sessionGoal() > 0) {
        <div class="h-1 bg-ink-border relative overflow-hidden">
          <div
            class="h-full transition-all duration-500"
            [style.width.%]="sessionProgress()"
            [class]="sessionGoalReached()
              ? 'bg-ink-success'
              : 'bg-ink-accent'">
          </div>
        </div>
      }

      <!-- Fila principal -->
      <div class="flex items-center justify-between px-3 py-2 gap-2">

        <!-- Recuento total + objetivo de sesión -->
        <div class="flex flex-col gap-0">
          <span class="text-ink-subtle text-xs">
            {{ formatCount(totalWordCount()) }}
          </span>
          @if (sessionGoal() > 0) {
            <span class="text-xs"
                  [class]="sessionGoalReached() ? 'text-ink-success' : 'text-ink-subtle'">
              +{{ sessionWordsAdded() }} / {{ sessionGoal() }} hoy
              @if (sessionGoalReached()) { ✓ }
            </span>
          }
        </div>

        <div class="flex items-center gap-1">

          <!-- Botón definir/editar objetivo -->
          <div class="relative">
            <button
              (click)="showGoalPopover.update(v => !v)"
              title="{{ sessionGoal() === 0 ? 'Definir objetivo de hoy' : 'Cambiar objetivo' }}"
              class="p-1 rounded text-ink-subtle hover:text-ink-text
                     hover:bg-ink-border transition-colors text-xs"
              [class.text-ink-accent]="sessionGoal() > 0">
              🎯
            </button>

            <!-- Popover del objetivo -->
            @if (showGoalPopover()) {
              <div
                class="absolute bottom-full mb-2 left-0 w-52 rounded-lg border
                       border-ink-border bg-ink-surface shadow-xl p-3 z-50">
                <p class="text-ink-subtle text-xs mb-2">Objetivo de palabras para hoy</p>
                <div class="flex gap-2">
                  <input
                    #goalInput
                    type="number"
                    [value]="sessionGoal() || ''"
                    min="1" max="99999"
                    placeholder="500"
                    class="flex-1 px-2 py-1 rounded bg-ink-bg border border-ink-border
                           text-ink-text text-sm focus:outline-none
                           focus:border-ink-accent transition-colors"/>
                  <button
                    (click)="applyGoal(goalInput.value)"
                    class="px-3 py-1 rounded bg-ink-accent text-ink-panel
                           text-xs font-medium hover:opacity-90 transition-opacity">
                    OK
                  </button>
                </div>
                @if (sessionGoal() > 0) {
                  <button
                    (click)="clearGoal()"
                    class="mt-2 text-ink-subtle text-xs hover:text-ink-danger
                           transition-colors">
                    Quitar objetivo
                  </button>
                }
                <!-- Sugerencias rápidas -->
                <div class="flex gap-2 mt-2">
                  @for (n of [250, 500, 1000, 2000]; track n) {
                    <button
                      (click)="applyGoal(n.toString())"
                      class="flex-1 py-1 rounded bg-ink-bg border border-ink-border
                             text-ink-subtle text-xs hover:border-ink-accent
                             hover:text-ink-text transition-colors">
                      {{ n }}
                    </button>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Botón búsqueda -->
          <button
            (click)="searchToggled.emit()"
            title="Buscar en el proyecto (Ctrl+F)"
            class="p-1 rounded text-ink-subtle hover:text-ink-text
                   hover:bg-ink-border transition-colors"
            [class.text-ink-accent]="searchActive()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>

        </div>
      </div>
    </div>
  `,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class BinderFooterComponent {
  projectService = inject(ProjectService);

  // Inputs desde EditorLayoutComponent
  searchActive      = input<boolean>(false);
  sessionGoal       = input<number>(0);
  sessionWordsAdded = input<number>(0);
  sessionProgress   = input<number>(0);
  sessionGoalReached = input<boolean>(false);
  totalWordCount    = input<number>(0);

  // Outputs
  searchToggled = output<void>();
  goalChanged   = output<number>();  // 0 = sin objetivo

  showGoalPopover = signal(false);

  applyGoal(value: string): void {
    const n = parseInt(value, 10);
    this.goalChanged.emit(isNaN(n) || n <= 0 ? 0 : n);
    this.showGoalPopover.set(false);
  }

  clearGoal(): void {
    this.goalChanged.emit(0);
    this.showGoalPopover.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    // Cerrar el popover al hacer click fuera
    const target = event.target as HTMLElement;
    if (!target.closest('app-binder-footer')) {
      this.showGoalPopover.set(false);
    }
  }

  formatCount(n: number): string {
    if (n === 0) return 'Proyecto vacío';
    if (n < 1000) return `${n} palabras`;
    return `${(n / 1000).toFixed(1).replace('.', ',')}k palabras`;
  }
}
```

### Conectar el footer con `EditorLayoutComponent`

```html
<app-binder-footer
  [searchActive]="showSearch()"
  [sessionGoal]="sessionGoal()"
  [sessionWordsAdded]="sessionWordsAdded()"
  [sessionProgress]="sessionProgress()"
  [sessionGoalReached]="sessionGoalReached()"
  [totalWordCount]="projectService.totalWordCount()"
  (searchToggled)="showSearch.update(v => !v)"
  (goalChanged)="sessionGoal.set($event)"/>
```

### Toast al alcanzar el objetivo

En `saveCurrentDocument()`, detectar si se acaba de alcanzar el objetivo:

```typescript
private async saveCurrentDocument(): Promise<void> {
  // ...guardado...
  const newTotal   = this.projectService.totalWordCount();
  const wasReached = this.sessionGoalReached();
  const newAdded   = Math.max(0, newTotal - this.sessionBaseCount());
  this.sessionWordsAdded.set(newAdded);

  // Mostrar toast de felicitación una sola vez al alcanzar el objetivo
  if (!wasReached && this.sessionGoalReached()) {
    this.toast.success(`¡Objetivo de ${this.sessionGoal()} palabras alcanzado hoy! 🎉`);
  }
}
```

---

## Parte 2: Modo máquina de escribir

El modo máquina de escribir mantiene la línea activa del cursor centrada verticalmente en la ventana del editor. Se implementa escuchando los cambios de selección del editor TipTap y haciendo scroll para mantener el elemento activo centrado.

### Modificar `TiptapEditorComponent`

```typescript
// Nuevo input
typewriterMode = input<boolean>(false);

// En ngAfterViewInit, añadir listener al editor:
ngAfterViewInit(): void {
  this.editor = new Editor({
    // ...configuración existente...
    onSelectionUpdate: () => {
      if (this.typewriterMode()) this.centerActiveLine();
    },
    onUpdate: ({ editor }) => {
      // ...código existente de debounce...
      if (this.typewriterMode()) this.centerActiveLine();
    },
  });
  this.editorReady.set(this.editor);
}

private centerActiveLine(): void {
  // Obtener la posición del cursor en el DOM
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range    = selection.getRangeAt(0);
  const rect     = range.getBoundingClientRect();
  if (rect.height === 0) return;

  const container   = this.editorEl.nativeElement;
  const containerH  = container.clientHeight;
  const lineCenter  = rect.top + rect.height / 2;
  const containerCenter = container.getBoundingClientRect().top + containerH / 2;

  const scrollDelta = lineCenter - containerCenter;

  container.scrollBy({
    top:      scrollDelta,
    behavior: 'smooth',
  });
}
```

### Botón en `EditorTopBarComponent`

Añadir input y output:

```typescript
typewriterMode     = input<boolean>(false);
typewriterToggled  = output<void>();
```

Botón en el template (junto al botón de modo focus):

```html
<!-- Botón modo máquina de escribir -->
<button
  (click)="typewriterToggled.emit()"
  title="Modo máquina de escribir"
  class="p-1.5 rounded transition-colors"
  [class]="typewriterMode()
    ? 'text-ink-accent bg-ink-border'
    : 'text-ink-subtle hover:text-ink-text hover:bg-ink-border'">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01"/>
    <path d="M7 16h10"/>
  </svg>
</button>
```

### Signal y binding en `EditorLayoutComponent`

```typescript
typewriterMode = signal(false);
```

```html
<app-editor-top-bar
  ...
  [typewriterMode]="typewriterMode()"
  (typewriterToggled)="typewriterMode.update(v => !v)"
  .../>

<app-tiptap-editor
  [content]="activeDocument()!.content"
  [typewriterMode]="typewriterMode()"
  (contentChanged)="onContentChanged($event)"/>
```

---

## Parte 3: Backup manual

### Nuevas dependencias

```bash
pnpm add jszip
```

> Si `jszip` ya es dependencia transitiva de `epub-gen-memory` (INK-10), no añadir de nuevo — importar directamente.

### `BackupService`

### `src/app/core/services/backup.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { ToastService }       from '../../shared/services/toast.service';
import {
  projectJsonPath,
  documentsFolderPath,
  boardsFolderPath,
  documentPath,
  boardPath,
} from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);
  private toast   = inject(ToastService);

  async createBackup(): Promise<void> {
    const proj     = this.project.project();
    const basePath = this.project.basePath();
    if (!proj || !basePath) return;

    // Generar nombre de fichero con timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const defaultName = `${proj.name}-backup-${timestamp}.zip`;

    // Pedir al usuario dónde guardar
    const savePath = await this.bridge.saveFileDialog(defaultName, 'zip');
    if (!savePath) return;

    try {
      const zip = new JSZip();

      // project.json
      const projectJson = await this.bridge.readJsonFile(projectJsonPath(basePath));
      zip.file('project.json', projectJson);

      // documents/
      const docIds = await this.bridge.listJsonFiles(documentsFolderPath(basePath));
      for (const id of docIds) {
        const content = await this.bridge.readJsonFile(documentPath(basePath, id));
        zip.file(`documents/${id}.json`, content);
      }

      // boards/
      const boardIds = await this.bridge.listJsonFiles(boardsFolderPath(basePath));
      for (const id of boardIds) {
        const content = await this.bridge.readJsonFile(boardPath(basePath, id));
        zip.file(`boards/${id}.json`, content);
      }

      // Generar el ZIP
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      await this.bridge.writeBinaryFile(savePath, buffer);

      this.toast.success(`Backup guardado: ${defaultName}`);
    } catch (e) {
      this.toast.error(`Error al crear el backup: ${e}`);
    }
  }
}
```

### Añadir botón en `InkSettingsModalComponent` (sección Editor)

```html
<!-- En la sección Editor, tras las opciones de autosave y snapshots -->
<div class="pt-2 border-t border-ink-border">
  <p class="text-ink-subtle text-xs mb-3">
    Crea una copia de seguridad completa del proyecto como archivo ZIP.
  </p>
  <ink-button variant="secondary" [fullWidth]="true" (clicked)="backup()">
    Crear backup del proyecto
  </ink-button>
</div>
```

En `InkSettingsModalComponent`:
```typescript
private backupService = inject(BackupService);

backup(): void {
  this.closed.emit();   // cerrar modal antes de abrir el diálogo del sistema
  setTimeout(() => this.backupService.createBackup(), 100);
}
```

> Se cierra la modal antes de abrir el diálogo del sistema porque algunos entornos de Linux tienen problemas con dos ventanas de diálogo nativas activas simultáneamente.

---

## Parte 4: Referencia de atajos de teclado

### `ShortcutsModalComponent`

### `src/app/shared/components/shortcuts-modal.component.ts`

```typescript
import { Component, output } from '@angular/core';
import { InkModalComponent } from './ink-modal.component';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Navegación',
    shortcuts: [
      { keys: ['Alt', '1'],           description: 'Ir al editor' },
      { keys: ['Alt', '2'],           description: 'Ir a los tableros' },
      { keys: ['Ctrl', 'B'],          description: 'Mostrar / ocultar binder' },
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Modo focus (sin distracciones)' },
      { keys: ['Ctrl', 'F'],          description: 'Buscar en el proyecto' },
    ],
  },
  {
    title: 'Editor',
    shortcuts: [
      { keys: ['Ctrl', 'S'],          description: 'Guardar documento' },
      { keys: ['Ctrl', 'Z'],          description: 'Deshacer' },
      { keys: ['Ctrl', 'Y'],          description: 'Rehacer' },
      { keys: ['Ctrl', 'B'],          description: 'Negrita' },
      { keys: ['Ctrl', 'I'],          description: 'Cursiva' },
      { keys: ['Ctrl', 'Shift', 'A'], description: 'Abrir / cerrar asistente IA' },
    ],
  },
  {
    title: 'Snapshots y versiones',
    shortcuts: [
      { keys: ['—'],                  description: 'Crear snapshot (botón en top bar)' },
      { keys: ['—'],                  description: 'Ver historial (botón reloj en top bar)' },
    ],
  },
  {
    title: 'Modos de escritura',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Activar / desactivar modo focus' },
      { keys: ['—'],                  description: 'Modo máquina de escribir (botón en top bar)' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'],                  description: 'Mostrar esta referencia de atajos' },
      { keys: ['Esc'],                description: 'Cerrar modal / menú contextual activo' },
    ],
  },
];

@Component({
  selector: 'app-shortcuts-modal',
  standalone: true,
  imports: [InkModalComponent],
  template: `
    <ink-modal title="Atajos de teclado" [hasActions]="false" (closed)="closed.emit()">
      <div class="flex flex-col gap-6 max-h-[60vh] overflow-y-auto pr-1">
        @for (group of shortcuts; track group.title) {
          <div>
            <h3 class="text-ink-subtle text-xs font-medium uppercase tracking-widest mb-3">
              {{ group.title }}
            </h3>
            <div class="flex flex-col gap-2">
              @for (s of group.shortcuts; track s.description) {
                <div class="flex items-center justify-between gap-4">
                  <span class="text-ink-text text-sm">{{ s.description }}</span>
                  <div class="flex items-center gap-1 shrink-0">
                    @for (key of s.keys; track key; let last = $last) {
                      <kbd class="px-1.5 py-0.5 rounded border border-ink-border
                                  bg-ink-surface text-ink-text text-xs font-mono
                                  shadow-sm">
                        {{ key }}
                      </kbd>
                      @if (!last && key !== '—') {
                        <span class="text-ink-muted text-xs">+</span>
                      }
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </ink-modal>
  `,
})
export class ShortcutsModalComponent {
  closed    = output<void>();
  shortcuts = SHORTCUTS;
}
```

### Activar con `?` desde `AppComponent`

```typescript
// En AppComponent, añadir al HostListener existente:
@HostListener('document:keydown', ['$event'])
onKeyDown(event: KeyboardEvent): void {
  // ...atajos existentes (Alt+1, Alt+2)...

  // Abrir referencia de atajos con '?'
  // Solo si no hay ningún input o textarea enfocado
  if (
    event.key === '?' &&
    !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)
  ) {
    this.showShortcuts.set(true);
  }
}
```

```typescript
showShortcuts = signal(false);
```

```html
<!-- En app.component.ts template -->
<router-outlet />
<ink-toast />

@if (showShortcuts()) {
  <app-shortcuts-modal (closed)="showShortcuts.set(false)"/>
}
```

### Botón de ayuda en `InkNavComponent`

```html
<!-- Al final de la nav, junto a settings y tema -->
<button
  (click)="shortcutsRequested.emit()"
  title="Atajos de teclado (?)"
  class="nav-icon">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
</button>
```

```typescript
shortcutsRequested = output<void>();
```

El `AppComponent` escucha este output y togglea `showShortcuts`.

---

## Criterios de aceptación

**Objetivo de sesión:**
- [ ] El footer del binder muestra un icono 🎯 para definir el objetivo
- [ ] Al pulsar, aparece un popover con input numérico y atajos rápidos (250 / 500 / 1000 / 2000)
- [ ] Al definir un objetivo, el footer muestra "+N / META hoy" bajo el recuento total
- [ ] Una barra de progreso fina aparece sobre el footer y se llena conforme se escribe
- [ ] Al alcanzar el objetivo, la barra cambia a verde y aparece el checkmark ✓
- [ ] Al alcanzar el objetivo, aparece un toast de felicitación (una sola vez)
- [ ] "Quitar objetivo" elimina el progreso del footer y oculta la barra
- [ ] El objetivo no persiste al cerrar la app (es por sesión)
- [ ] El popover se cierra al hacer click fuera de él

**Modo máquina de escribir:**
- [ ] El botón de máquina de escribir en la top bar activa/desactiva el modo
- [ ] El botón queda resaltado (activo) cuando el modo está activado
- [ ] Al escribir con el modo activo, la línea del cursor se mantiene centrada verticalmente
- [ ] El scroll es suave, no brusco
- [ ] Al desactivar el modo, el editor vuelve al scroll normal
- [ ] El modo funciona tanto con el binder visible como en modo focus

**Backup:**
- [ ] El botón "Crear backup" está en la sección Editor de settings
- [ ] Al pulsar, la modal se cierra y se abre el diálogo de guardar del sistema
- [ ] El nombre sugerido sigue el patrón `nombre-proyecto-backup-YYYY-MM-DD.zip`
- [ ] El ZIP contiene `project.json`, todos los ficheros de `documents/` y todos los de `boards/`
- [ ] Al abrir el ZIP resultante, la estructura es correcta (no hay carpetas anidadas extra)
- [ ] Toast de éxito con el nombre del fichero al completar
- [ ] Cancelar el diálogo no muestra error

**Referencia de atajos:**
- [ ] Pulsar `?` sin ningún input enfocado abre la modal
- [ ] El botón `?` en la nav también la abre
- [ ] La modal muestra todos los grupos con sus atajos y las teclas con estilo `<kbd>`
- [ ] `Esc` cierra la modal
- [ ] El atajo `?` no funciona cuando el foco está en un input o textarea (para no interferir con la escritura)

---

## Lo que NO hacer en esta spec

- No persistir el objetivo de sesión en disco ni entre sesiones
- No implementar estadísticas históricas de escritura (palabras por día, racha, etc.) — backlog
- No añadir modo typewriter en los tableros
- No implementar restore de un backup (el usuario puede descomprimirlo manualmente y abrirlo como proyecto)
- No calcular el recuento diferencial de palabras a nivel de carácter — usar solo el guardado como punto de medición
