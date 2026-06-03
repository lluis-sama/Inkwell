# INK-24 — El Cajón

## Objetivo

Añadir un panel de notas de trabajo ("El Cajón") al área del editor. El panel contiene un binder especial vinculado a la carpeta `desk_notes` del proyecto y un mini-editor Tiptap para trabajar las notas. Puede anclarse en tres posiciones y permite guardar respuestas del asistente IA directamente como documentos.

---

## Scope

**Incluido:**
- Carpeta `desk_notes` gestionada automáticamente (oculta del binder principal)
- `DeskPanelComponent` con mini-binder + mini-editor interno
- Tres posiciones de anclaje: `bottom`, `left`, `right`
- Redimensionado: arrastre vertical (bottom) o horizontal (left/right)
- Clic en el handle de bottom: snap open/close
- Botones de cambio de posición dentro del panel
- Botón "Guardar en el cajón" en `AiAssistantPanelComponent`
- Persistencia de posición y dimensiones en `AppSettings`

**Excluido:**
- Múltiples cajones simultáneos
- Sincronización del cajón con el binder principal

---

## Parte 1: AppSettings

```typescript
export type DeskPosition = 'bottom' | 'left' | 'right' | 'closed';

export interface DeskPanelSettings {
  position: DeskPosition;  // default: 'closed'
  bottomHeight: number;    // px · default: 300 · min: 150 · max: 70% ventana
  sideWidth: number;       // px · shared left/right · default: 320 · min: 240 · max: 500
}
```

Default en `DEFAULT_SETTINGS`:
```typescript
deskPanel: {
  position: 'closed',
  bottomHeight: 300,
  sideWidth: 320,
},
```

Métodos en `SettingsService`:
```typescript
setDeskPosition(position: DeskPosition): void {
  this.updateSettings({ deskPanel: { ...this.settings().deskPanel, position } });
}

setDeskBottomHeight(height: number): void {
  const max = Math.floor(window.innerHeight * 0.70);
  const clamped = Math.min(Math.max(height, 150), max);
  this.updateSettings({ deskPanel: { ...this.settings().deskPanel, bottomHeight: clamped } });
}

setDeskSideWidth(width: number): void {
  const clamped = Math.min(Math.max(width, 240), 500);
  this.updateSettings({ deskPanel: { ...this.settings().deskPanel, sideWidth: clamped } });
}
```

---

## Parte 2: Carpeta desk_notes

### Comportamiento

`desk_notes` es una carpeta especial a raíz del proyecto. Se crea automáticamente la primera vez que se abre el proyecto si no existe. **No aparece en el binder principal** — se filtra en el momento de construir el árbol.

### `FileService` — cambios

```typescript
// Constante
static readonly DESK_NOTES_FOLDER = 'desk_notes';

// En loadProjectTree() — filtrar del árbol principal
private buildTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.filter(n => n.name !== FileService.DESK_NOTES_FOLDER);
}

// Nuevo método
async ensureDeskNotesFolder(projectPath: string): Promise<void> {
  const path = `${projectPath}/${FileService.DESK_NOTES_FOLDER}`;
  const exists = await this.exists(path);
  if (!exists) await this.createFolder(path);
}

// Nuevo método
async loadDeskNotesTree(projectPath: string): Promise<TreeNode[]> {
  const path = `${projectPath}/${FileService.DESK_NOTES_FOLDER}`;
  return this.buildTreeFromPath(path); // misma lógica que el binder
}
```

### `ProjectService` — cambios

Llamar a `ensureDeskNotesFolder` en `openProject()` y `createProject()` tras cargar el proyecto.

---

## Parte 3: DeskPanelComponent

### Ruta

```
src/app/features/editor/desk/
  desk-panel.component.ts
  desk-binder.component.ts   ← mini-binder scoped a desk_notes
```

### Layout interno del panel (todas las posiciones)

```
┌──────────────────────────────────────────────────────┐
│  [📋] El Cajón      [←][→][↓] [✕]                   │  ← cabecera 36px
├──────────────┬───────────────────────────────────────┤
│ Mini binder  │  Mini editor Tiptap                   │
│  (180px fijo)│  (flex-1)                             │
│              │                                       │
└──────────────┴───────────────────────────────────────┘
```

- **Cabecera**: título "El Cajón" + tres botones de anclaje (izquierda / derecha / abajo) + botón cerrar.
- **Mini binder**: árbol de `desk_notes`. Mismo comportamiento que el binder principal (crear carpeta, crear documento, renombrar, eliminar). Ancho fijo 180px.
- **Mini editor**: `TiptapEditorComponent` estándar pero sin toolbar de formato (la toolbar de INK-23 no aplica aquí, se usa la toolbar básica de Tiptap). Sin conteo de palabras.

### `DeskPanelComponent` — esqueleto

```typescript
@Component({
  selector: 'ink-desk-panel',
  standalone: true,
  imports: [DeskBinderComponent, TiptapEditorComponent, ...],
  template: `...` // ver sección de template
})
export class DeskPanelComponent implements AfterViewInit {
  private readonly settings = inject(SettingsService);
  private readonly project  = inject(ProjectService);
  private readonly file     = inject(FileService);
  private readonly handleEl = viewChild<ElementRef>('resizeHandle');

  readonly position     = computed(() => this.settings.settings().deskPanel.position);
  readonly bottomHeight = computed(() => this.settings.settings().deskPanel.bottomHeight);
  readonly sideWidth    = computed(() => this.settings.settings().deskPanel.sideWidth);

  readonly deskTree = signal<TreeNode[]>([]);
  readonly activeDocId = signal<string | null>(null);

  ngOnInit(): void {
    this.loadDeskTree();
  }

  ngAfterViewInit(): void {
    this.initResize();
  }

  private async loadDeskTree(): Promise<void> {
    const projectPath = this.project.currentProject()?.path;
    if (!projectPath) return;
    const tree = await this.file.loadDeskNotesTree(projectPath);
    this.deskTree.set(tree);
  }

  pinLeft():   void { this.settings.setDeskPosition('left');   }
  pinRight():  void { this.settings.setDeskPosition('right');  }
  pinBottom(): void { this.settings.setDeskPosition('bottom'); }
  close():     void { this.settings.setDeskPosition('closed'); }

  private initResize(): void {
    const handle = this.handleEl()?.nativeElement;
    if (!handle) return;

    interact(handle).draggable({
      listeners: {
        move: (event) => {
          const pos = this.position();
          if (pos === 'bottom') {
            // Arrastrar hacia arriba (dy negativo) aumenta altura
            this.settings.setDeskBottomHeight(this.bottomHeight() - event.dy);
          } else if (pos === 'left') {
            // Arrastrar hacia la derecha (dx positivo) aumenta anchura
            this.settings.setDeskSideWidth(this.sideWidth() + event.dx);
          } else if (pos === 'right') {
            // Arrastrar hacia la izquierda (dx negativo) aumenta anchura
            this.settings.setDeskSideWidth(this.sideWidth() - event.dx);
          }
        },
      },
    });
  }
}
```

### Template

```html
<div class="flex flex-col h-full w-full bg-ink-surface border-ink-border overflow-hidden relative"
     [class.border-t]="position() === 'bottom'"
     [class.border-r]="position() === 'left'"
     [class.border-l]="position() === 'right'"
>

  <!-- Resize handle — posición varía según anclaje -->
  <div
    #resizeHandle
    class="absolute z-10 bg-transparent hover:bg-ink-accent/30 transition-colors"
    [class]="resizeHandleClass()"
  ></div>

  <!-- Cabecera -->
  <div class="flex items-center justify-between px-3 h-9 border-b border-ink-border shrink-0">
    <span class="text-xs font-medium text-ink-text-secondary">El Cajón</span>
    <div class="flex items-center gap-1">
      <!-- Pin izquierda -->
      <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-ink-hover"
              [class.text-ink-accent]="position() === 'left'"
              (click)="pinLeft()" title="Anclar a la izquierda">
        <!-- icono panel-left SVG 14px -->
      </button>
      <!-- Pin abajo -->
      <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-ink-hover"
              [class.text-ink-accent]="position() === 'bottom'"
              (click)="pinBottom()" title="Anclar abajo">
        <!-- icono panel-bottom SVG 14px -->
      </button>
      <!-- Pin derecha -->
      <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-ink-hover"
              [class.text-ink-accent]="position() === 'right'"
              (click)="pinRight()" title="Anclar a la derecha">
        <!-- icono panel-right SVG 14px -->
      </button>
      <!-- Separador -->
      <div class="w-px h-4 bg-ink-border mx-1"></div>
      <!-- Cerrar -->
      <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-ink-hover
                     text-ink-text-muted hover:text-ink-text-primary"
              (click)="close()" title="Cerrar El Cajón">✕</button>
    </div>
  </div>

  <!-- Contenido: mini binder + mini editor -->
  <div class="flex flex-1 min-h-0 overflow-hidden">
    <!-- Mini binder -->
    <div class="w-[180px] shrink-0 border-r border-ink-border overflow-y-auto">
      <ink-desk-binder
        [tree]="deskTree()"
        [activeId]="activeDocId()"
        (documentSelected)="activeDocId.set($event)"
        (treeChanged)="loadDeskTree()"
      />
    </div>
    <!-- Mini editor -->
    <div class="flex-1 min-w-0 overflow-hidden">
      @if (activeDocId()) {
        <ink-tiptap-editor
          [documentId]="activeDocId()!"
          [showToolbar]="false"
          [showWordCount]="false"
        />
      } @else {
        <div class="flex items-center justify-center h-full text-xs text-ink-text-muted">
          Selecciona o crea una nota
        </div>
      }
    </div>
  </div>
</div>
```

Computed para las clases del resize handle:

```typescript
readonly resizeHandleClass = computed(() => {
  switch (this.position()) {
    case 'bottom': return 'top-0 left-0 right-0 h-1 cursor-row-resize';
    case 'left':   return 'top-0 right-0 bottom-0 w-1 cursor-col-resize';
    case 'right':  return 'top-0 left-0 bottom-0 w-1 cursor-col-resize';
    default:       return '';
  }
});
```

---

## Parte 4: Handle de apertura (posición bottom)

Cuando el cajón está en modo `bottom` o `closed`, el editor muestra una barra handle en su parte inferior para abrirlo/cerrarlo con clic o arrastre.

### Añadir en `TiptapEditorComponent` (o en `EditorLayoutComponent`)

```html
<!-- Bottom of the editor writing area -->
<div
  #deskTriggerHandle
  class="shrink-0 h-5 flex items-center justify-center cursor-pointer
         hover:bg-ink-hover/50 transition-colors group"
  (click)="onDeskHandleClick()"
  title="El Cajón"
>
  <!-- Pill indicator, estilo iOS home bar -->
  <div class="w-10 h-1 rounded-full bg-ink-border group-hover:bg-ink-accent/50 transition-colors"></div>
</div>
```

```typescript
// Solo visible cuando position === 'bottom' | 'closed'
readonly showDeskHandle = computed(() => {
  const pos = this.settings.settings().deskPanel.position;
  return pos === 'bottom' || pos === 'closed';
});

onDeskHandleClick(): void {
  const pos = this.settings.settings().deskPanel.position;
  if (pos === 'closed') {
    this.settings.setDeskPosition('bottom');
  } else {
    this.settings.setDeskPosition('closed');
  }
}
```

> El arrastre desde este handle usa el mismo `initResize()` del `DeskPanelComponent` — no hay lógica duplicada. El handle es el trigger visual; el resize real lo gestiona el `resizeHandle` dentro del cajón.

---

## Parte 5: Integración en EditorLayoutComponent

### Layout con cajón en bottom

```html
<!-- Editor area (columna central) -->
<div class="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
  <ink-editor-top-bar ... />
  <ink-editor-toolbar ... />

  <!-- Editor + desk trigger + desk panel (columna) -->
  <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
    <!-- Tiptap -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <ink-tiptap-editor ... />
    </div>

    <!-- Handle trigger (solo bottom/closed) -->
    @if (deskPos() === 'bottom' || deskPos() === 'closed') {
      <!-- handle pill — ver Parte 4 -->
    }

    <!-- Cajón bottom -->
    @if (deskPos() === 'bottom') {
      <ink-desk-panel
        [style.height.px]="deskSettings().bottomHeight"
        class="shrink-0"
      />
    }
  </div>
</div>
```

### Layout con cajón en left/right

```html
<!-- Root layout horizontal -->
<div class="flex flex-1 min-h-0 overflow-hidden">

  <!-- Binder -->
  <ink-binder ... />

  <!-- Cajón LEFT -->
  @if (deskPos() === 'left') {
    <ink-desk-panel
      [style.width.px]="deskSettings().sideWidth"
      class="shrink-0"
    />
  }

  <!-- Editor (columna) -->
  <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
    <ink-editor-top-bar ... />
    <ink-editor-toolbar ... />
    <ink-tiptap-editor class="flex-1 min-h-0" ... />
    <!-- Handle pill (solo bottom/closed) -->
    @if (deskPos() === 'bottom' || deskPos() === 'closed') {
      <!-- handle pill -->
    }
  </div>

  <!-- Cajón RIGHT -->
  @if (deskPos() === 'right') {
    <ink-desk-panel
      [style.width.px]="deskSettings().sideWidth"
      class="shrink-0"
    />
  }

  <!-- AI Sidebar (si está abierto) -->
  @if (aiPanelOpen()) {
    <ink-ai-assistant-panel ... />
  }

</div>
```

Computed de apoyo:

```typescript
readonly deskPos      = computed(() => this.settings.settings().deskPanel.position);
readonly deskSettings = computed(() => this.settings.settings().deskPanel);
```

---

## Parte 6: Guardar en el Cajón (AiAssistantPanelComponent)

### Reemplazar / añadir junto al botón "Insertar en el editor"

El botón actual "Insertar en el editor" se mantiene. Se añade un botón "Guardar en el cajón" junto a él, visible únicamente en el último mensaje del asistente.

```typescript
async saveToDesk(content: string, mode: AiMode): Promise<void> {
  const projectPath = this.project.currentProject()?.path;
  if (!projectPath) return;

  // Nombre del documento: "{modo} · {fecha}"
  const modeLabel: Record<AiMode, string> = {
    analyze:    'Análisis',
    review:     'Revisión',
    brainstorm: 'Ideas',
  };
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const docName = `${modeLabel[mode]} · ${dateStr}`;

  // Crear documento en la raíz de desk_notes
  await this.file.createDocumentInDesk(projectPath, docName, content);

  // Abrir el cajón si estaba cerrado (ir a bottom como posición por defecto)
  if (this.settings.settings().deskPanel.position === 'closed') {
    this.settings.setDeskPosition('bottom');
  }

  // Notificar al DeskPanelComponent para que refresque el árbol y seleccione el doc nuevo
  // Usar un Subject en un DeskService o un event bus ligero
  this.deskService.notifyNewDocument(docName);
}
```

Template (junto al mensaje del asistente):

```html
<div class="flex gap-2 mt-2">
  <button
    class="text-xs px-2 py-1 rounded border border-ink-border
           text-ink-text-secondary hover:bg-ink-hover transition-colors"
    (click)="insertInEditor(message.content)"
  >
    Insertar en el editor
  </button>
  <button
    class="text-xs px-2 py-1 rounded border border-ink-accent/50
           text-ink-accent hover:bg-ink-accent/10 transition-colors"
    (click)="saveToDesk(message.content, currentMode())"
  >
    Guardar en el cajón
  </button>
</div>
```

### `FileService` — método auxiliar

```typescript
async createDocumentInDesk(
  projectPath: string,
  name: string,
  content: string
): Promise<TreeNode> {
  const deskPath = `${projectPath}/${FileService.DESK_NOTES_FOLDER}`;
  const id = crypto.randomUUID();
  const filePath = `${deskPath}/${id}.json`;

  const doc: DocumentFile = {
    id,
    name,
    content,           // HTML de Tiptap o texto plano
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await this.writeJson(filePath, doc);
  return { id, name, type: 'document', path: filePath, children: [] };
}
```

### `DeskService` (nuevo, ligero)

```typescript
@Injectable({ providedIn: 'root' })
export class DeskService {
  private readonly _newDocument$ = new Subject<string>();
  readonly newDocument$ = this._newDocument$.asObservable();

  notifyNewDocument(name: string): void {
    this._newDocument$.next(name);
  }
}
```

`DeskPanelComponent` se suscribe a `DeskService.newDocument$` para refrescar el árbol y seleccionar el documento recién creado.

---

## Parte 7: Comportamiento del cierre y animaciones

### Cierre desde cualquier posición

El botón ✕ del cajón **siempre** establece `position: 'closed'`, independientemente de si el cajón está en `bottom`, `left` o `right`. Al cerrarse desde `left` o `right`:

- El cajón desaparece del layout lateral.
- La pill handle reaparece en el fondo del editor (ya que `showDeskHandle` evalúa `'closed'` como `true`).
- La próxima apertura es siempre desde abajo (`bottom`).

Esto da coherencia: el cajón "vive" abajo por defecto y se puede desplazar lateralmente, pero su origen y destino al cerrar es siempre el borde inferior.

---

### Animaciones con Angular Animations

Las transiciones CSS puras no funcionan con `@if` porque el elemento no existe en el DOM cuando está cerrado. Se usa la API de Angular Animations para manejar `:enter` / `:leave`.

> **Nota:** Angular Animations funciona con zoneless. Instalar `@angular/animations` si no está ya en el proyecto y añadir `provideAnimations()` o `provideAnimationsAsync()` en `app.config.ts`.

#### Definición de triggers

En un fichero compartido `src/app/shared/animations/desk.animations.ts`:

```typescript
import { animate, style, transition, trigger } from '@angular/animations';

const EASE_SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const slideUpAnimation = trigger('slideUp', [
  transition(':enter', [
    style({ height: '0px', opacity: 0 }),
    animate(`320ms ${EASE_SPRING}`, style({ height: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    animate(`220ms ease-in`, style({ height: '0px', opacity: 0 })),
  ]),
]);

export const slideInLeftAnimation = trigger('slideInLeft', [
  transition(':enter', [
    style({ width: '0px', opacity: 0 }),
    animate(`320ms ${EASE_SPRING}`, style({ width: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    animate(`220ms ease-in`, style({ width: '0px', opacity: 0 })),
  ]),
]);

export const slideInRightAnimation = trigger('slideInRight', [
  transition(':enter', [
    style({ width: '0px', opacity: 0 }),
    animate(`320ms ${EASE_SPRING}`, style({ width: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    animate(`220ms ease-in`, style({ width: '0px', opacity: 0 })),
  ]),
]);
```

#### Aplicar en `EditorLayoutComponent`

```typescript
@Component({
  animations: [slideUpAnimation, slideInLeftAnimation, slideInRightAnimation],
  // ...
})
```

```html
<!-- Bottom -->
@if (deskPos() === 'bottom') {
  <ink-desk-panel @slideUp [style.height.px]="deskSettings().bottomHeight" class="shrink-0 overflow-hidden" />
}

<!-- Left -->
@if (deskPos() === 'left') {
  <ink-desk-panel @slideInLeft [style.width.px]="deskSettings().sideWidth" class="shrink-0 overflow-hidden" />
}

<!-- Right -->
@if (deskPos() === 'right') {
  <ink-desk-panel @slideInRight [style.width.px]="deskSettings().sideWidth" class="shrink-0 overflow-hidden" />
}
```

#### Animación de la pill handle

La pill reacciona visualmente al estado del cajón:

```html
<div
  class="shrink-0 h-5 flex items-center justify-center cursor-pointer group
         transition-colors hover:bg-ink-hover/40"
  (click)="onDeskHandleClick()"
>
  <div
    class="h-1 rounded-full transition-all duration-300"
    [class]="deskPos() === 'closed'
      ? 'w-10 bg-ink-border group-hover:bg-ink-accent/60'
      : 'w-14 bg-ink-accent/70 group-hover:bg-ink-accent'"
  ></div>
</div>
```

La pill se ensancha (`w-10` → `w-14`) y cambia de color cuando el cajón está abierto, dando feedback visual del estado.

---

### Polish visual del panel

El `DeskPanelComponent` debe sentirse como una superficie elevada sobre el editor, no como un bloque pegado. Añadir en su contenedor raíz:

```html
<div class="flex flex-col h-full w-full overflow-hidden
            bg-ink-surface
            shadow-[0_-2px_12px_0_rgba(0,0,0,0.08)]"
     [class.border-t]="position() === 'bottom'"
     [class.border-r]="position() === 'left'"
     [class.border-l]="position() === 'right'"
     [class.border-ink-border]="true"
>
```

> `shadow-[0_-2px_12px_0_rgba(0,0,0,0.08)]` proyecta la sombra hacia arriba en modo bottom. En modo dark, aumentar la opacidad a `0.18` para que sea perceptible sobre fondos oscuros — se puede condicionar con la clase `dark:shadow-[0_-2px_12px_0_rgba(0,0,0,0.18)]` si Tailwind tiene el modo dark configurado.

El resize handle también merece un poco de atención visual:

```html
<div
  #resizeHandle
  class="absolute z-10 transition-colors duration-150
         bg-transparent hover:bg-ink-accent/25 active:bg-ink-accent/50"
  [class]="resizeHandleClass()"
></div>
```

---

## Tests

- `SettingsService.setDeskBottomHeight(50)` → clampea a 150.
- `FileService.createDocumentInDesk` → crea archivo en `desk_notes/`, devuelve `TreeNode` correcto.
- `AiAssistantPanelComponent`: click en "Guardar en el cajón" → crea documento + abre cajón si estaba `closed`.
- `DeskPanelComponent`: cambio de posición refleja cambio en `resizeHandleClass()`.

---

## Dependencias

- `interactjs` (ya instalado — INK-07)
- `DeskService` nuevo (6 líneas)
- Sin nuevos paquetes npm

## Orden de implementación sugerido

1. `AppSettings` + `SettingsService` (base)
2. `FileService` — `desk_notes` management
3. `DeskService` (ligero)
4. `DeskPanelComponent` + `DeskBinderComponent`
5. Integración en `EditorLayoutComponent` (sin animaciones primero)
6. Handle trigger de apertura + pill handle
7. Botón "Guardar en el cajón" en AI panel
8. Animaciones y polish visual (Parte 7) — añadir al final, una vez el flujo funciona

## Spec anterior

INK-23 (QoL: tipografía y sidebar)
