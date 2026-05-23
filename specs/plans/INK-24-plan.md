# Plan de implementación — INK-24

## Resumen

Esta spec añade "El Cajón", un panel de notas de trabajo vinculado a una carpeta `desk_notes` del proyecto. El panel tiene tres posiciones de anclaje (bottom, left, right), redimensionado con interact.js, un mini-binder propio y un mini-editor TipTap. También se añade un botón "Guardar en el cajón" en el panel de IA. La implementación sigue el orden: modelo → capa de acceso a disco → servicio de estado → componentes → integración.

No existe ningún `FileService` en el proyecto. Las responsabilidades que la spec asigna a ese servicio se distribuyen entre `ProjectService` (gestión de carpeta y árbol de desk_notes) y `DocumentService` (creación de documento en desk_notes). Esta es la decisión de diseño central del plan.

---

## Tareas

### Tarea 1: Añadir `DeskPosition` y `DeskPanelSettings` al modelo AppSettings

- **Fichero**: `/home/david/dev/inkwell/src/app/core/models/app-settings.model.ts` (modificar)
- **Qué hace**: Añadir el tipo `DeskPosition` (`'bottom' | 'left' | 'right' | 'closed'`) y la interfaz `DeskPanelSettings` con campos `position`, `bottomHeight` y `sideWidth`. Extender la interfaz `AppSettings` con un campo `deskPanel: DeskPanelSettings`. Añadir el bloque `deskPanel` a `DEFAULT_APP_SETTINGS` con los valores por defecto de la spec (`position: 'closed'`, `bottomHeight: 300`, `sideWidth: 320`).
- **Depende de**: ninguna dependencia previa

---

### Tarea 2: Añadir métodos de desk al `SettingsService`

- **Fichero**: `/home/david/dev/inkwell/src/app/core/services/settings.service.ts` (modificar)
- **Qué hace**: Actualizar el bloque de merge en `loadSettings()` para incluir `deskPanel: { ...DEFAULT_APP_SETTINGS.deskPanel, ...stored?.deskPanel }`. Añadir tres métodos nuevos: `setDeskPosition(position: DeskPosition)`, `setDeskBottomHeight(height: number)` con clampeo 150–70%vh, y `setDeskSideWidth(width: number)` con clampeo 240–500. Cada método llama a `updateSettings` con shallow merge del objeto `deskPanel`. Importar `DeskPosition` desde el modelo.
- **Depende de**: Tarea 1

---

### Tarea 3: Añadir comandos Rust para crear carpeta y verificar existencia

- **Fichero**: `/home/david/dev/inkwell/src-tauri/src/commands/fs_commands.rs` (modificar)
- **Qué hace**: Añadir dos comandos nuevos al final del fichero:
  - `create_folder(path: String) -> Result<(), String>`: crea el directorio con `fs::create_dir_all`.
  - `folder_exists(path: String) -> bool`: retorna `Path::new(&path).is_dir()`.
  Ambos se registran en el `tauri::Builder` en `main.rs` (o donde esté el registro de comandos del proyecto).
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Localizar el fichero que invoca `.invoke_handler(tauri::generate_handler![...])` para añadir los dos comandos nuevos. En la mayoría de proyectos Tauri 2 está en `src-tauri/src/main.rs` o `src-tauri/src/lib.rs`.

---

### Tarea 4: Exponer `createFolder` y `folderExists` en `TauriBridgeService`

- **Fichero**: `/home/david/dev/inkwell/src/app/core/services/tauri-bridge.service.ts` (modificar)
- **Qué hace**: Añadir dos métodos nuevos que invocan los comandos Rust de la Tarea 3:
  - `createFolder(path: string): Promise<void>` — invoca `'create_folder'`.
  - `folderExists(path: string): Promise<boolean>` — invoca `'folder_exists'`.
  Ambos se añaden junto al resto de métodos existentes, sin alterar los existentes.
- **Depende de**: Tarea 3

---

### Tarea 5: Añadir `deskNotesPath` a `project-paths.ts`

- **Fichero**: `/home/david/dev/inkwell/src/app/shared/utils/project-paths.ts` (modificar)
- **Qué hace**: Añadir dos helpers de ruta:
  - `deskNotesFolderPath(basePath: string): string` — retorna `${basePath}/desk_notes`.
  - `deskNotePath(basePath: string, id: string): string` — retorna `${basePath}/desk_notes/${id}.json`.
  Constante `DESK_NOTES_FOLDER = 'desk_notes'` exportada desde este mismo fichero (en lugar de crear un `FileService`).
- **Depende de**: ninguna dependencia previa

---

### Tarea 6: Añadir métodos de desk_notes a `ProjectService`

- **Fichero**: `/home/david/dev/inkwell/src/app/core/services/project.service.ts` (modificar)
- **Qué hace**: Añadir dos métodos públicos:
  - `async ensureDeskNotesFolder(): Promise<void>` — obtiene `this.basePath()`, verifica con `this.bridge.folderExists(...)`, y si no existe lo crea con `this.bridge.createFolder(...)`. Retorna sin error si no hay proyecto abierto.
  - `async loadDeskNotesTree(): Promise<TreeNode[]>` — lista los ficheros con `this.bridge.listJsonFiles(deskNotesFolderPath(basePath))`, lee cada JSON con `readJsonFile`, parsea, y construye un array plano de `TreeNode[]` donde cada nodo tiene `type: 'document'`. El campo `title` se lee del JSON del documento (`doc.title`). Los `children` siempre son `[]`.
  Llamar a `this.ensureDeskNotesFolder()` al final de `openProject()` y `createProject()`, después de que `this.project.set(project)` y `this.basePath.set(basePath)` ya estén establecidos.
- **Depende de**: Tareas 4 y 5
- **Riesgo**: `listJsonFiles` retorna UUIDs sin extensión (ver la implementación Rust actual). En `loadDeskNotesTree` usar `deskNotePath(basePath, id)` para construir la ruta completa de cada fichero a leer.

---

### Tarea 7: Añadir `createDocumentInDesk` a `DocumentService`

- **Fichero**: `/home/david/dev/inkwell/src/app/core/services/document.service.ts` (modificar)
- **Qué hace**: Añadir el método `async createDocumentInDesk(title: string, content: string): Promise<TreeNode>`. Obtiene `basePath` con `this.project.basePath()` (lanza si null). Genera un UUID. Construye un `DocumentFile` con `EMPTY_TIPTAP_CONTENT` para el campo `content` (el `content` string recibido se convierte a un nodo párrafo de TipTap: `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] }`). Escribe el JSON en `deskNotePath(basePath, id)` con `this.bridge.writeJsonFile`. Retorna el `TreeNode` `{ id, title, type: 'document', children: [] }`.
  No llama a `this.project.addNode` porque los documentos de desk_notes no viven en el árbol de `project.json`.
- **Depende de**: Tarea 5
- **Riesgo**: El campo `content` del modelo `DocumentFile` es `object` (TipTap JSON), no `string`. El string HTML/texto plano que llega de la IA debe envolverse en estructura TipTap válida.

---

### Tarea 8: Crear `DeskService`

- **Fichero**: `/home/david/dev/inkwell/src/app/core/services/desk.service.ts` (crear)
- **Qué hace**: Servicio mínimo `providedIn: 'root'` con un `Subject<string>` privado `_newDocument$` y su observable público `newDocument$`. Expone un método `notifyNewDocument(name: string): void` que hace `.next(name)`. Importar `Subject` de `rxjs`.
- **Depende de**: ninguna dependencia previa

---

### Tarea 9: Crear `DeskBinderComponent`

- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/desk/desk-binder.component.ts` (crear)
- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/desk/desk-binder.component.html` (crear)
- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/desk/desk-binder.component.css` (crear, puede estar vacío)
- **Qué hace**: Componente standalone que recibe `tree = input<TreeNode[]>([])` y `activeId = input<string | null>(null)`. Emite `documentSelected = output<string>()` al hacer clic en un nodo documento. Emite `treeChanged = output<void>()` tras crear/renombrar/eliminar. Internamente usa `ProjectService` y `DocumentService` (para crear documentos de desk). Las operaciones de CRUD (crear documento, crear carpeta, renombrar, eliminar) son simplificadas respecto al binder principal: no hay drag-and-drop ni menú contextual en la primera versión; solo botones inline de "nuevo doc", "nueva carpeta" y "eliminar" por nodo. Los nodos de tipo `folder` pueden tener hijos; los nodos `document` son hojas.
  El template es un listado recursivo simple usando `@for`. Cada fila muestra el título del nodo, botón de eliminar y — si es documento — abre/carga al hacer clic. Los estilos siguen las clases TailwindCSS del binder principal.
- **Depende de**: Tareas 6 y 7
- **Riesgo**: Este componente no gestiona su propio árbol de estado: recibe `tree` como input y emite `treeChanged` para que el padre (`DeskPanelComponent`) recargue. No hay acceso directo al disco desde aquí, solo a través de `ProjectService`/`DocumentService`.

---

### Tarea 10: Crear `DeskPanelComponent`

- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/desk/desk-panel.component.ts` (crear)
- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/desk/desk-panel.component.html` (crear)
- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/desk/desk-panel.component.css` (crear, puede estar vacío)
- **Qué hace**: Componente standalone `AfterViewInit` que integra `DeskBinderComponent` y `TiptapEditorComponent`. Inyecta `SettingsService`, `ProjectService`, `DocumentService` y `DeskService`. Signals computados `position`, `bottomHeight`, `sideWidth` desde `SettingsService`. Signal local `deskTree = signal<TreeNode[]>([])` y `activeDocId = signal<string | null>(null)`. Método `loadDeskTree()` que llama a `ProjectService.loadDeskNotesTree()` y setea `deskTree`. En `ngOnInit` llama a `loadDeskTree()`. Se suscribe a `DeskService.newDocument$` en el constructor (con `takeUntilDestroyed`) para refrescar árbol y seleccionar el documento recién guardado (busca en el árbol el nodo con el title que llega). En `ngAfterViewInit` llama a `initResize()` con interact.js sobre el `#resizeHandle`. Los métodos `pinLeft()`, `pinRight()`, `pinBottom()`, `close()` delegan en `SettingsService`. El `resizeHandleClass()` computed retorna las clases CSS según posición. El template sigue exactamente el layout de la spec (cabecera + mini-binder 180px + mini-editor flex-1). Los tres botones de ancla y el botón cerrar usan SVG inline de 14px. El `TiptapEditorComponent` se usa con `[content]` del documento activo y `[showToolbar]="false"` — pero verificar si `TiptapEditorComponent` tiene ese input; si no existe, omitir el toolbar controlando desde el CSS del cajón. El `[showWordCount]="false"` ídem.
- **Depende de**: Tareas 1, 2, 6, 8, 9
- **Riesgo**: `TiptapEditorComponent` tiene inputs fijos (`content`, `editable`, etc.) pero no tiene `showToolbar` ni `showWordCount` actualmente. En `DeskPanelComponent` no pasar esos inputs inexistentes; en su lugar, ocultar la toolbar visualmente con CSS o simplemente aceptar que el mini-editor la muestra. Ajustar en la Tarea 11 si es necesario.
  La suscripción a `DeskService.newDocument$` debe usar `takeUntilDestroyed` (patrón zoneless del proyecto) con el `DestroyRef` inyectado.
  `TiptapEditorComponent` necesita el `content` del documento activo, no solo el ID. El componente debe cargar el documento con `DocumentService.loadDocument(activeDocId())` cuando cambia `activeDocId`, y guardar el contenido editado al cambio.

---

### Tarea 11: Añadir `provideAnimations` en `app.config.ts` e instalar `@angular/animations`

- **Fichero**: `/home/david/dev/inkwell/src/app/app.config.ts` (modificar)
- **Qué hace**: `@angular/animations` NO está en `package.json`. Ejecutar `pnpm add @angular/animations`. Importar `provideAnimationsAsync` desde `@angular/platform-browser/animations/async` y añadirlo al array `providers` de `appConfig`. Usar `provideAnimationsAsync` (no `provideAnimations`) ya que es la recomendación para zoneless/standalone.
- **Depende de**: ninguna dependencia previa (puede hacerse en paralelo con las demás tareas)
- **Riesgo**: Verificar que la versión del paquete coincide con `^20.1.4` (`@angular/core`, etc.) para evitar peer dependency conflicts. Usar `pnpm add @angular/animations@^20.1.4`.

---

### Tarea 12: Crear fichero de animaciones `desk.animations.ts`

- **Fichero**: `/home/david/dev/inkwell/src/app/shared/animations/desk.animations.ts` (crear)
- **Qué hace**: Exportar tres triggers de Angular Animations según la spec: `slideUpAnimation` (bottom enter/leave con `height`), `slideInLeftAnimation` (left enter/leave con `width`), `slideInRightAnimation` (right enter/leave con `width`). Usar la constante `EASE_SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)'` para enter (320ms) y `ease-in` para leave (220ms). Importar `animate`, `style`, `transition`, `trigger` de `@angular/animations`.
- **Depende de**: Tarea 11

---

### Tarea 13: Integrar `DeskPanelComponent` en `EditorLayoutComponent` (sin animaciones)

- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/editor-layout.component.ts` (modificar)
- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace en el .ts**: Añadir `SettingsService` inyectado. Añadir `DeskPanelComponent` al array `imports`. Añadir computed `deskPos = computed(() => this.settings.settings().deskPanel.position)` y `deskSettings = computed(() => this.settings.settings().deskPanel)`. Añadir método `onDeskHandleClick()` que alterna entre `'closed'` y `'bottom'`.
- **Qué hace en el .html**: Reestructurar el template del área principal para los tres casos de anclaje (ver Parte 5 de la spec). La estructura concreta:
  - El div raíz `flex flex-1 overflow-hidden` pasa a contener: Binder (si visible) + cajón LEFT (si `deskPos() === 'left'`) + columna-editor + cajón RIGHT (si `deskPos() === 'right'`) + panel-IA.
  - La columna-editor pasa a ser `flex-col` con: top-bar, toolbar, div con `flex-1 min-h-0` (el editor TipTap), pill-handle (si `'bottom' | 'closed'`), cajón BOTTOM (si `deskPos() === 'bottom'`).
  - El cajón BOTTOM lleva `[style.height.px]="deskSettings().bottomHeight"`.
  - El cajón LEFT/RIGHT lleva `[style.width.px]="deskSettings().sideWidth"`.
  - La pill-handle es el div con `#deskTriggerHandle` de la Parte 4.
  - Sin animaciones en esta tarea; los `@if` desnudos.
  El selector del componente es `ink-desk-panel` (el componente usa `selector: 'ink-desk-panel'`).
- **Depende de**: Tarea 10
- **Riesgo**: El template actual tiene un bloque `<!-- Panel derecho: IA / Snapshots / Franja colapsada -->` con lógica `@if / @else if`. Esa lógica no cambia; solo se reordena el layout para acomodar el cajón. El binder y la franja de IA siguen funcionando igual. Prestar atención a los `min-h-0` y `overflow-hidden` en los contenedores flex para que el cajón no expanda la página.

---

### Tarea 14: Añadir botón "Guardar en el cajón" en `AiAssistantPanelComponent`

- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/ai-assistant/ai-assistant-panel.component.ts` (modificar)
- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/ai-assistant/ai-assistant-panel.component.html` (modificar)
- **Qué hace en el .ts**: Inyectar `DocumentService`, `SettingsService` y `DeskService`. Añadir el método `async saveToDesk(content: string, mode: AiMode): Promise<void>` según la spec: construye el nombre del documento `"${modeLabel[mode]} · ${dateStr}"`, llama a `this.docService.createDocumentInDesk(docName, content)`, abre el cajón si estaba cerrado con `this.settingsService.setDeskPosition('bottom')`, y llama a `this.deskService.notifyNewDocument(docName)`. El tipo `AiMode` ya incluye `'synopsis'`; añadir su label `'Sinopsis'` al objeto `modeLabel` local.
- **Qué hace en el .html**: En el bloque `@if (msg.role === 'assistant')` reemplazar el botón único "Insertar en editor" por un `div.flex.gap-2.mt-2` con dos botones: el existente "Insertar en el editor" y el nuevo "Guardar en el cajón". El nuevo botón llama a `saveToDesk(msg.content, activeMode())`.
- **Depende de**: Tareas 7 y 8
- **Riesgo**: La spec muestra el botón solo en el "último mensaje del asistente". En el template actual, el botón existe en todos los mensajes de tipo `assistant`. Para coherencia con la spec, añadir una condición como `$last` al `@for` o comparar con el índice. Dado que el template ya usa `track $index`, la condición `$last` está disponible en el bloque `@for`. Aplicar `@if ($last)` al contenedor con los dos botones.

---

### Tarea 15: Añadir animaciones Angular al `EditorLayoutComponent`

- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/editor-layout.component.ts` (modificar)
- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace en el .ts**: Importar `slideUpAnimation`, `slideInLeftAnimation`, `slideInRightAnimation` desde el fichero de animaciones. Añadir el array `animations: [slideUpAnimation, slideInLeftAnimation, slideInRightAnimation]` al decorador `@Component`.
- **Qué hace en el .html**: Añadir los atributos de trigger `@slideUp`, `@slideInLeft`, `@slideInRight` a las tres instancias de `<ink-desk-panel>` según su posición. Añadir `overflow-hidden` a los contenedores padre de los cajones para que la animación de height/width no desborde.
- **Depende de**: Tareas 12 y 13
- **Riesgo**: Angular Animations con `@if` en control flow (`@if` nuevo estilo) requiere Angular 17+. El proyecto usa Angular 20, así que es compatible. Verificar que `provideAnimationsAsync` está activo antes de probar.

---

### Tarea 16: Polish visual del `DeskPanelComponent`

- **Fichero**: `/home/david/dev/inkwell/src/app/features/editor/desk/desk-panel.component.html` (modificar)
- **Qué hace**: Aplicar las clases de sombra y borde del cajón según la spec: `shadow-[0_-2px_12px_0_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_12px_0_rgba(0,0,0,0.18)]` en el contenedor raíz. Asegurar `border-ink-border` siempre presente. Actualizar las clases del resize handle a `bg-transparent hover:bg-ink-accent/25 active:bg-ink-accent/50 transition-colors duration-150`. Actualizar la pill-handle para que cambie de `w-10 bg-ink-border` a `w-14 bg-ink-accent/70` cuando `deskPos() !== 'closed'`.
- **Depende de**: Tarea 13

---

## Orden de ejecución

1. Tarea 11 — instalar `@angular/animations` y añadir `provideAnimationsAsync` (puede hacerse en paralelo con cualquier otra)
2. Tarea 1 — modelo `AppSettings`
3. Tarea 2 — `SettingsService` métodos desk
4. Tarea 3 — comandos Rust `create_folder` / `folder_exists`
5. Tarea 4 — `TauriBridgeService` métodos bridge
6. Tarea 5 — helpers de ruta en `project-paths.ts`
7. Tarea 6 — `ProjectService` métodos desk_notes
8. Tarea 7 — `DocumentService.createDocumentInDesk`
9. Tarea 8 — `DeskService`
10. Tarea 9 — `DeskBinderComponent`
11. Tarea 10 — `DeskPanelComponent`
12. Tarea 12 — `desk.animations.ts`
13. Tarea 13 — integración en `EditorLayoutComponent` (sin animaciones)
14. Tarea 14 — botón "Guardar en el cajón" en AI panel
15. Tarea 15 — añadir animaciones al layout
16. Tarea 16 — polish visual

---

## Puntos de atención para el Implementer

### Inconsistencias spec vs realidad (resueltas en este plan)

- **No existe `FileService`**. La spec lo menciona en Partes 2 y 6. En este plan: `ensureDeskNotesFolder` y `loadDeskNotesTree` van en `ProjectService`; `createDocumentInDesk` va en `DocumentService`. Ningún `FileService` nuevo.
- **`this.project.currentProject()?.path` no existe**. Usar `this.project.basePath()` en todos los componentes que necesiten la ruta base.
- **`TreeNode.name` no existe**. El campo es `title`. En cualquier lugar donde la spec use `n.name`, usar `n.title`.

### Convenciones del proyecto

- Templates y estilos **siempre en ficheros separados** (`.html` y `.css`). Nunca `template:` ni `styles:` inline en `@Component` excepto si ya existen en el componente que se modifica (el `TiptapEditorComponent` usa `styles:` inline — no tocar eso).
- Todos los componentes son **standalone**. Sin NgModules.
- **Zoneless**: sin `NgZone`. Las suscripciones deben usar `takeUntilDestroyed(this.destroyRef)` o manejarse con `effect()`.
- **interact.js en `ngAfterViewInit`**, nunca en `ngOnInit`. El resize handle debe existir en el DOM antes de pasárselo a interact.
- **`TauriBridgeService`** es el único lugar con `invoke`. Ningún componente importa `@tauri-apps/api` directamente.
- **`crypto.randomUUID()`** para IDs. Sin librerías externas.
- Los documentos de desk_notes **no entran en `project.json`**. No llamar a `ProjectService.addNode()` para ellos.
- El selector del panel debe ser `ink-desk-panel` para que el template del layout lo use con ese prefijo.

### Puntos de riesgo técnico

- **`TiptapEditorComponent` no tiene inputs `showToolbar`/`showWordCount`**: En `DeskPanelComponent`, pasar solo `[content]` y `[editable]`. Si la toolbar del cajón es molesta visualmente, se puede ocultar con CSS en `desk-panel.component.css` usando `:host ::ng-deep`.
- **Carga de documento en el mini-editor**: `TiptapEditorComponent` recibe `content: input<object>`. `DeskPanelComponent` debe mantener un signal `activeDocContent = signal<object>(EMPTY_TIPTAP_CONTENT)` y cargar el documento con `DocumentService.loadDocument` cuando `activeDocId` cambia. Usar un `effect()` para eso. Guardar los cambios del mini-editor con `contentChanged` output del `TiptapEditorComponent`.
- **`listJsonFiles` retorna UUIDs sin extensión**: Ya verificado en el código Rust. Construir la ruta completa en `loadDeskNotesTree` con `deskNotePath(basePath, id)`.
- **`@angular/animations` versión**: Instalar con `pnpm add @angular/animations@^20.1.4` para alinear con el resto del stack Angular 20.
- **Animaciones con `@if` control flow**: Compatible con Angular 17+. No usar `*ngIf` (directiva legacy).
- **Lo que NO hacer** (de la spec implícitamente): no crear múltiples cajones, no sincronizar desk_notes con el binder principal, no añadir lógica de negocio en los comandos Rust.
