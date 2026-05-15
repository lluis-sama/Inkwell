# Plan de implementación — INK-09

## Resumen

INK-09 es el polish final del MVP. El Implementer añadirá la toolbar de formato al editor TipTap, reemplazará el settings modal con una versión de tres secciones, integrará el botón de settings y el botón "cerrar proyecto" en InkNavComponent, implementará el título de ventana Tauri dinámico añadiendo un comando Rust nuevo, habilitará drag & drop nativo en el binder con funciones puras de árbol, y realizará la limpieza final. Alt+1/Alt+2 ya están implementados en AppComponent; el toggle de tema no estaba duplicado en EditorTopBarComponent; ambos puntos se omiten.

---

## Tareas

### Tarea 1: Exponer `editorReady` signal en TiptapEditorComponent

- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
- **Qué hace**: Añadir `readonly editorReady = signal<Editor | null>(null)` como propiedad pública. En `ngAfterViewInit`, llamar `this.editorReady.set(this.editor)` inmediatamente después de crear la instancia del editor. En `ngOnDestroy`, llamar `this.editorReady.set(null)` antes de `this.editor?.destroy()`.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: `editorReady` debe setearse *después* de `new Editor({...})` pero *antes* de que el componente hijo EditorToolbarComponent intente leerlo. Dado que el hijo se crea en el mismo ciclo de AfterViewInit, el orden es: crear editor → set editorReady → Angular detecta el cambio por signal → toolbar recibe el valor. Es seguro porque el input signal de la toolbar se evaluará en la siguiente detección de cambios.

---

### Tarea 2: Crear EditorToolbarComponent (fichero .ts)

- **Fichero**: `src/app/features/editor/tiptap/editor-toolbar.component.ts` (crear)
- **Qué hace**: Componente standalone con `editor = input<Editor | null>(null)`. Contiene toda la lógica de la toolbar: métodos `toggleHeading(level)` e `isHeadingActive(level)`. El template está en fichero externo (siguiente tarea). Importar solo lo necesario de Angular. No necesita FormsModule ni HttpClient.
- **Depende de**: Tarea 1 (el tipo `Editor` debe importarse de `@tiptap/core`)
- **Riesgo**: La spec incluye el template inline en el .ts. En este proyecto **todos los componentes usan `templateUrl` externo**. El Implementer debe separar template y clase: `templateUrl: './editor-toolbar.component.html'` en el decorador, sin `template` inline. Los estilos pueden ir en `styles` array o en fichero externo; dado que son específicos del componente y cortos, se aceptan inline en el `styles` array del decorador.

---

### Tarea 3: Crear EditorToolbarComponent (fichero .html)

- **Fichero**: `src/app/features/editor/tiptap/editor-toolbar.component.html` (crear)
- **Qué hace**: Template de la toolbar con el bloque `@if (editor())` que contiene todos los botones: H1/H2/H3, negrita, cursiva, tachado, código inline, lista con viñetas, lista numerada, blockquote, bloque de código, separador horizontal, deshacer, rehacer. Separadores visuales (`toolbar-sep`) entre grupos. Usar los tokens `--ink-*` para colores (ya definidos via las clases Tailwind y CSS custom del proyecto).
- **Depende de**: Tarea 2

---

### Tarea 4: Integrar EditorToolbarComponent en TiptapEditorComponent

- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar) y `src/app/features/editor/tiptap/tiptap-editor.component.html` (modificar)
- **Qué hace**: 
  - En el .ts: añadir `EditorToolbarComponent` al array `imports` del decorador `@Component`.
  - En el .html: insertar `<app-editor-toolbar [editor]="editorReady()" />` entre el inicio del div `.tiptap-host` y el div `#editorEl`. La toolbar solo debe mostrarse cuando NO está en modo focus; sin embargo, el modo focus lo controla `EditorLayoutComponent` (no TiptapEditorComponent). Ver punto de atención abajo.
- **Depende de**: Tareas 1, 2, 3
- **Riesgo**: La spec dice "La toolbar no aparece en modo focus". TiptapEditorComponent no tiene acceso al signal `focusMode` de EditorLayoutComponent. La solución correcta: añadir un input `focusMode = input<boolean>(false)` a TiptapEditorComponent y pasarlo desde EditorLayoutComponent en su template. Luego en el .html de TiptapEditorComponent: `@if (!focusMode()) { <app-editor-toolbar .../> }`. El Implementer debe verificar el template de `editor-layout.component.html` para añadir el binding `[focusMode]="focusMode()"` en el tag `<app-tiptap-editor>`.

---

### Tarea 5: Reemplazar InkSettingsModalComponent

- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (modificar — reemplazo completo)
- **Qué hace**: Reemplazar la implementación actual (solo API key) por la versión de tres secciones: "Editor" (autosave, maxSnapshots), "Asistente IA" (API key, modelo), "Apariencia" (selector visual de tema). El componente implementa `OnInit` para leer la configuración del proyecto al abrirse. Mantiene el mismo selector `ink-settings-modal` y el mismo output `closed`. El template pasa a ser `templateUrl` externo.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: 
  - El componente actual usa `template` inline. El nuevo también **debe usar `templateUrl` externo** según convención del proyecto. El Implementer debe crear `ink-settings-modal.component.html` con el template.
  - `projectService.updateSettings()` es async — el método `saveEditorSettings()` debe ser `async` y usar `await`.
  - La sección "Editor" usa `[(ngModel)]` con `[ngValue]` para los `<select>` con valores numéricos. Requiere `FormsModule` en `imports`.
  - `ThemeService.setTheme()` espera `'dark' | 'light'`. Verificar que el tipo del array `themes` coincide con lo que acepta `setTheme()`.

---

### Tarea 6: Crear ink-settings-modal.component.html

- **Fichero**: `src/app/shared/components/ink-settings-modal.component.html` (crear)
- **Qué hace**: Template completo con sidebar de secciones y panel de contenido condicional para cada sección (`@if (activeSection() === 'editor')`, etc.). Usar tokens `--ink-*` via clases Tailwind del proyecto.
- **Depende de**: Tarea 5

---

### Tarea 7: Añadir botón Settings y modal a InkNavComponent

- **Ficheros**: `src/app/shared/components/ink-nav.component.ts` (modificar) y `src/app/shared/components/ink-nav.component.html` (modificar)
- **Qué hace**: 
  - En el .ts: añadir `showSettings = signal(false)` e importar `InkSettingsModalComponent` en el array `imports` del decorador.
  - En el .html: añadir el botón settings (icono de engranaje) justo antes del toggle de tema (al final de la nav, en la zona inferior). Añadir `@if (showSettings()) { <ink-settings-modal (closed)="showSettings.set(false)" /> }` después del botón, fuera del `<nav>` pero dentro del `:host`.
- **Depende de**: Tareas 5, 6
- **Riesgo**: El modal debe renderizarse fuera del `<nav>` para evitar problemas de overflow/z-index. El `:host` de InkNavComponent actualmente tiene `display: flex; height: 100%`. Si el modal se renderiza como hijo directo del host, puede interferir con el layout. Solución: el modal de `InkSettingsModalComponent` ya usa `InkModalComponent` que presumiblemente tiene `position: fixed`. Revisar `ink-modal.component.ts` para confirmar. Si es fixed, la posición en el DOM no importa para el layout.

---

### Tarea 8: Añadir botón "Cerrar proyecto" a InkNavComponent

- **Ficheros**: `src/app/shared/components/ink-nav.component.ts` (modificar) y `src/app/shared/components/ink-nav.component.html` (modificar)
- **Qué hace**: 
  - En el .ts: inyectar `ProjectService` (como `protected` o `private`) y añadir el método `closeProject()` que llama a `this.projectService.closeProject()` y luego `this.router.navigate(['/'])`. `Router` ya está inyectado.
  - En el .html: añadir el botón con icono de casa `@if (projectService.isLoaded())` justo después del logo y antes de los links de ruta.
- **Depende de**: Tarea 7 (para no tocar el fichero varias veces de forma innecesaria; puede hacerse junto con la Tarea 7 en una sola pasada si se coordinan, pero se separan para atomicidad)
- **Riesgo**: `projectService.isLoaded()` es un `computed()` en ProjectService. Para usarlo en el template con `@if`, el campo debe ser `protected` (o `public`) en el componente. El Implementer debe inyectarlo como `protected projectService = inject(ProjectService)`.

---

### Tarea 9: Añadir comando Rust `set_window_title`

- **Fichero**: `src-tauri/src/commands/fs_commands.rs` (modificar)
- **Qué hace**: Añadir al final del fichero la función pública `set_window_title` anotada con `#[tauri::command]`. La función recibe `app: AppHandle` y `title: String`, obtiene la ventana con `app.get_webview_window("main")` y llama a `.set_title(&title)`. Ambos unwraps se mapean a `String` de error.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: El import `use tauri::Manager` es necesario para que `app.get_webview_window()` esté disponible. Verificar si ya está importado al inicio del fichero (actualmente no lo está). Debe añadirse al bloque de `use` statements del fichero.

---

### Tarea 10: Registrar `set_window_title` en lib.rs

- **Fichero**: `src-tauri/src/lib.rs` (modificar)
- **Qué hace**: Añadir `commands::fs_commands::set_window_title` al array del macro `tauri::generate_handler![]`.
- **Depende de**: Tarea 9

---

### Tarea 11: Añadir `setWindowTitle()` a TauriBridgeService

- **Fichero**: `src/app/core/services/tauri-bridge.service.ts` (modificar)
- **Qué hace**: Añadir el método `setWindowTitle(title: string): Promise<void>` que llama a `invoke<void>('set_window_title', { title })`.
- **Depende de**: Tareas 9, 10

---

### Tarea 12: Actualizar título de ventana en EditorLayoutComponent

- **Ficheros**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**: 
  - Inyectar `TauriBridgeService` como `private bridge = inject(TauriBridgeService)`.
  - Añadir el método privado `updateWindowTitle()` que construye el string `"Documento — Proyecto"` o solo el nombre del proyecto si no hay documento activo, y llama a `this.bridge.setWindowTitle(title).catch(() => {})`.
  - Llamar a `updateWindowTitle()` al final de `openDocument()` (tras el `this.activeDocument.set(doc)`) y al final de `onTitleChanged()` (tras el `renameNode`).
- **Depende de**: Tarea 11
- **Riesgo**: `TauriBridgeService` ya está importado transitivamente via otros servicios pero no en este componente directamente. Añadir el import explícito. El `.catch(() => {})` es intencional para no romper la UI si Tauri no responde (p.ej. en tests o en web).

---

### Tarea 13: Añadir funciones puras de árbol para drag & drop en ProjectService

- **Fichero**: `src/app/core/services/project.service.ts` (modificar)
- **Qué hace**: Añadir tres funciones puras al final del fichero (junto a `insertNode`, `deleteNode`, `renameNode`):
  - `findNode(tree, id)` — busca un nodo por ID recursivamente. **Nota**: el Explorer indica que existe internamente en el servicio; verificar si ya está definida antes de añadirla para evitar duplicado.
  - `insertAfter(tree, targetId, node)` — inserta el nodo inmediatamente después del nodo con targetId al mismo nivel.
  - `insertInside(tree, targetId, node)` — inserta el nodo como primer hijo de la carpeta con targetId.
  - `isDescendant(tree, ancestorId, nodeId)` — comprueba si nodeId es descendiente de ancestorId.
  - Exportar `findNode` con `export` para que BinderComponent pueda usarla, o bien exportar las cuatro funciones. La spec muestra que BinderComponent llama `findNode` directamente.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: `findNode` puede que ya exista como función interna no exportada. El Implementer debe buscarla en el fichero antes de crearla. Si existe, solo añadir `export` y las tres nuevas funciones. Exportar una función de módulo no rompe nada.

---

### Tarea 14: Añadir `DropEvent` interface y handlers en BinderNodeComponent

- **Ficheros**: `src/app/features/editor/binder/binder-node.component.ts` (modificar) y `src/app/features/editor/binder/binder-node.component.html` (modificar)
- **Qué hace**: 
  - En el .ts: exportar la interface `DropEvent { draggedId: string; targetId: string; position: 'after' | 'inside' }`. Añadir outputs `dragStarted = output<string>()` y `dropped = output<DropEvent>()`. Añadir signals locales `isDragOver = signal(false)` e `isDragOverInner = signal(false)`. Añadir los tres métodos: `onDragStart()`, `onDragOver()`, `onDrop()`.
  - En el .html: añadir atributos drag al div de la fila: `draggable="true"`, event bindings `(dragstart)`, `(dragend)`, `(dragover)`, `(dragleave)`, `(drop)`, y bindings de clase para feedback visual `[class.ring-1]`, `[class.ring-ink-accent]`, `[class.bg-ink-accent]`, `[class.bg-opacity-10]`. Añadir la franja indicadora de "drop inside" en el fondo del div para carpetas.
  - Propagar `dragStarted` y `dropped` desde los hijos recursivos (el template ya propaga `nodeClicked`, `contextMenu`, `renamed`, `renameCancel`; añadir los dos nuevos de la misma forma).
- **Depende de**: Tarea 13
- **Riesgo**: 
  - `event.stopPropagation()` en `onDragOver` es crítico para evitar que eventos de drag se propaguen a nodos padre cuando el árbol es anidado.
  - La detección de zona "inferior 40%" en `onDragOver` usa `event.currentTarget` (el div de la fila), no `event.target` (que podría ser un elemento hijo).
  - El div de la fila actualmente no tiene `position: relative`. Para que la franja indicadora `position: absolute` funcione correctamente, se debe añadir `relative` a las clases del div de la fila.

---

### Tarea 15: Añadir lógica de drop en BinderComponent

- **Ficheros**: `src/app/features/editor/binder/binder.component.ts` (modificar) y `src/app/features/editor/binder/binder.component.html` (modificar)
- **Qué hace**: 
  - En el .ts: añadir `draggedNodeId = signal<string | null>(null)`, el método `onDragStart(id: string)`, el método público `onDrop(event: DropEvent)`, y el método privado async `applyDrop(event: DropEvent)`. Importar `DropEvent` desde `binder-node.component.ts`. Importar `findNode`, `deleteNode`, `insertAfter`, `insertInside`, `isDescendant` desde `project.service.ts`.
  - En el .html: añadir los bindings `(dragStarted)="onDragStart($event)"` y `(dropped)="onDrop($event)"` en el tag `<app-binder-node>` raíz. Verificar que los eventos propagados desde nodos hijos también llegan correctamente (el template usa recursión, los eventos burbujean via los outputs de BinderNodeComponent).
- **Depende de**: Tareas 13, 14
- **Riesgo**: 
  - Las funciones `findNode`, `deleteNode`, `insertAfter`, `insertInside`, `isDescendant` son funciones de módulo privadas en `project.service.ts`. Solo serán accesibles en BinderComponent si se exportan (Tarea 13 cubre esto).
  - La operación de drop es: (1) obtener el nodo arrastrado con `findNode`, (2) eliminarlo del árbol con `deleteNode`, (3) insertarlo con `insertAfter` o `insertInside`. El orden importa: primero delete, luego insert, sobre el árbol resultante del delete.
  - Después de `applyDrop` se llama a `projectService.updateTree(newTree)` que es async y persiste en disco.

---

### Tarea 16: Limpieza final

- **Ficheros**: múltiples (revisión, no escritura)
- **Qué hace**: Revisar que no haya `console.log` de desarrollo en los ficheros modificados en esta spec. Confirmar que `EditorTopBarComponent` no tiene toggle de tema duplicado (ya verificado por el Explorer, confirmación visual). Verificar que `ng build` (equivalente: `pnpm run build`) no genera warnings de TypeScript.
- **Depende de**: Todas las tareas anteriores

---

## Orden de ejecución

1. Tarea 1 — `editorReady` signal en TiptapEditorComponent
2. Tarea 2 — Crear `editor-toolbar.component.ts`
3. Tarea 3 — Crear `editor-toolbar.component.html`
4. Tarea 4 — Integrar toolbar en TiptapEditorComponent (ts + html)
5. Tarea 5 — Reemplazar `ink-settings-modal.component.ts`
6. Tarea 6 — Crear `ink-settings-modal.component.html`
7. Tarea 7 — Añadir botón settings a InkNavComponent (ts + html)
8. Tarea 8 — Añadir botón "cerrar proyecto" a InkNavComponent (ts + html)
9. Tarea 9 — Añadir comando Rust `set_window_title` en fs_commands.rs
10. Tarea 10 — Registrar el comando en lib.rs
11. Tarea 11 — Añadir `setWindowTitle()` a TauriBridgeService
12. Tarea 12 — Actualizar título de ventana en EditorLayoutComponent
13. Tarea 13 — Funciones puras de árbol en ProjectService
14. Tarea 14 — BinderNodeComponent: DropEvent, handlers, template
15. Tarea 15 — BinderComponent: lógica de drop completa
16. Tarea 16 — Limpieza final

---

## Puntos de atención para el Implementer

### Convención templateUrl obligatoria
Todos los componentes de este proyecto usan `templateUrl` externo, no `template` inline. La spec incluye templates inline en los snippets de código a modo ilustrativo. El Implementer **debe** separar siempre en fichero `.html` aparte.

### focusMode en la toolbar
La toolbar no debe mostrarse en modo focus. Esto requiere pasar `focusMode` como input a `TiptapEditorComponent`. El Implementer debe:
- Añadir `focusMode = input<boolean>(false)` en `TiptapEditorComponent`
- Envolver `<app-editor-toolbar>` con `@if (!focusMode())` en el template
- Añadir `[focusMode]="focusMode()"` en el tag `<app-tiptap-editor>` del template de `EditorLayoutComponent`

### findNode puede ya existir
Revisar `project.service.ts` antes de crear `findNode`. Si ya existe como función interna (no exportada), solo añadir `export` y crear las tres nuevas funciones. No duplicar.

### Importación de funciones puras en BinderComponent
Las funciones `findNode`, `deleteNode`, `insertAfter`, `insertInside`, `isDescendant` son funciones de módulo en `project.service.ts`. Para que BinderComponent las use, deben estar exportadas. El Implementer debe confirmar que se exportan en la Tarea 13 antes de importarlas en la Tarea 15.

### position: relative en binder-node fila
El div de la fila del nodo en `binder-node.component.html` necesita la clase `relative` para que la franja de "drop inside" (con `position: absolute bottom-0`) se posicione correctamente.

### use tauri::Manager en fs_commands.rs
El método `app.get_webview_window()` requiere el trait `Manager` en scope. Añadir `use tauri::Manager;` al inicio de `fs_commands.rs` junto a los imports existentes.

### El invoke_handler en lib.rs (no main.rs)
La spec menciona `main.rs` para el registro del comando. En este proyecto, el handler está en `src-tauri/src/lib.rs`. El Implementer debe modificar `lib.rs`, no `main.rs`.

### Zoneless: sin NgZone, sin detectChanges manual
Los signals se actualizan solos. Los handlers de drag usan `signal.set()` directamente — correcto y compatible con zoneless. No añadir `NgZone.run()` ni `ChangeDetectorRef.detectChanges()`.

### No usar console.log
La limpieza final (Tarea 16) verifica ausencia de logs de desarrollo. El Implementer no debe dejar `console.log` ni `console.error` salvo los que ya existían antes de esta spec (hay uno en `openDocument()` del EditorLayoutComponent que es preexistente; no es necesario eliminarlo pero tampoco añadir nuevos).

### Lo que NO hacer (de la spec)
- No implementar Alt+1/Alt+2 — ya están en AppComponent.
- No eliminar toggle de tema de EditorTopBarComponent — el Explorer confirmó que no existe ahí; no hay nada que eliminar.
- No tocar la lógica de snapshots, AI panel ni boards — fuera del scope de esta spec.
