## Plan de implementación — INK-05

### Resumen

Implementar la vista principal de escritura compuesta por tres zonas: binder lateral (árbol de
documentos con menú contextual), editor TipTap centralizado y franja lateral reservada para IA.
El flujo completo cubre abrir y cambiar de documento, editar, guardar automáticamente y activar
el modo focus. Al finalizar, el usuario puede escribir en un proyecto real desde cero.

---

### Tareas

#### Tarea 1: Instalar dependencias TipTap
- **Fichero**: `package.json` / `pnpm-lock.yaml` (modificar mediante pnpm)
- **Qué hace**: Instala los cuatro paquetes de TipTap que no están presentes:
  `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` y
  `@tiptap/extension-character-count`. Ejecutar con pnpm. Verificar que el
  comando termina sin error antes de continuar.
- **Depende de**: ninguna dependencia previa

---

#### Tarea 2: Actualizar diccionarios i18n
- **Fichero**: `src/assets/i18n/es.json` (modificar) y `src/assets/i18n/en.json` (modificar)
- **Qué hace**: Añade todas las claves nuevas que usan los componentes de esta spec.
  Las claves a añadir son las siguientes (el Implementer debe respetar el namespace
  `EDITOR.*` para todo lo que pertenezca al editor):
  - `EDITOR.UNTITLED` — "Sin título" / "Untitled"
  - `EDITOR.NEW_FOLDER` — "Nueva carpeta" / "New folder"
  - `EDITOR.SAVED` — "Guardado" / "Saved"
  - `EDITOR.SAVING` — "Guardando..." / "Saving..."
  - `EDITOR.UNSAVED` — "Sin guardar" / "Unsaved"
  - `EDITOR.SAVE_ERROR` — "Error al guardar" / "Error saving"
  - `EDITOR.NO_DOCS` — "Sin documentos todavía.\nCrea uno con el botón +" /
    "No documents yet.\nCreate one with the + button"
  - `EDITOR.EMPTY_STATE` — "Selecciona o crea un documento en el binder" /
    "Select or create a document in the binder"
  - `EDITOR.PLACEHOLDER` — "Empieza a escribir..." / "Start writing..."
  - `EDITOR.NO_DOC_OPEN` — "Ningún documento abierto" / "No document open"
  - `EDITOR.SHOW_HIDE_BINDER` — "Mostrar/ocultar binder (Ctrl+B)" /
    "Show/hide binder (Ctrl+B)"
  - `EDITOR.CREATE_SNAPSHOT` — "Crear snapshot" / "Create snapshot"
  - `EDITOR.FOCUS_MODE` — "Modo focus (Ctrl+Shift+F)" / "Focus mode (Ctrl+Shift+F)"
  - `EDITOR.EXIT_FOCUS` — "Salir del modo focus (Ctrl+Shift+F)" /
    "Exit focus mode (Ctrl+Shift+F)"
  - `EDITOR.NEW_DOC` — "Nuevo documento" / "New document"
  - `EDITOR.NEW_FOLDER_BTN` — "Nueva carpeta" / "New folder"
  - `EDITOR.CTX_RENAME` — "Renombrar" / "Rename"
  - `EDITOR.CTX_ADD_DOC` — "Nuevo documento aquí" / "New document here"
  - `EDITOR.CTX_ADD_FOLDER` — "Nueva carpeta aquí" / "New folder here"
  - `EDITOR.CTX_DELETE` — "Eliminar" / "Delete"
  - `EDITOR.WORDS` — "palabras" / "words"
  - `EDITOR.CHARS` — "caracteres" / "characters"
- **Depende de**: ninguna dependencia previa

---

#### Tarea 3: Utilidad tiptap-to-text
- **Fichero**: `src/app/shared/utils/tiptap-to-text.ts` (crear)
- **Qué hace**: Exporta la función `tiptapToText(doc: object): string` que convierte
  el JSON de TipTap a texto plano añadiendo saltos de línea entre bloques. Define
  internamente la interfaz `TipTapNode` y el set `BLOCK_NODES`. La función es pura,
  sin dependencias de Angular ni TipTap.
- **Depende de**: Tarea 1 (no importa nada de TipTap, pero conviene que los paquetes
  ya estén en node_modules para que el compilador no falle al resolver imports vecinos)

---

#### Tarea 4: TiptapEditorComponent — clase TypeScript
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (crear)
- **Qué hace**: Implementa el componente Angular wrapper del editor TipTap.
  Puntos clave que el Implementer debe respetar:
  - `wordCount` y `charCount` deben ser `signal<number>(0)`, actualizados dentro
    del callback `onUpdate` del editor tras cada cambio (no funciones de flecha
    que leen del editor, que no disparan change detection en zoneless).
  - El editor se crea en `ngAfterViewInit` sobre `@ViewChild('editorEl')`.
  - El input `content` usa `ngOnChanges` para detectar cambios de documento y
    llamar a `editor.commands.setContent(...)` sin emitir el evento (segundo
    parámetro `false`).
  - El debounce del output `contentChanged` se implementa con `setTimeout`
    (300 ms) limpiado en `ngOnDestroy`.
  - Los estilos de ProseMirror van en el array `styles` del decorador con
    `::ng-deep` (el componente no usa `ViewEncapsulation.None` explícito;
    `::ng-deep` es suficiente aquí).
  - `templateUrl` apunta a `./tiptap-editor.component.html`.
- **Depende de**: Tarea 1, Tarea 2

---

#### Tarea 5: TiptapEditorComponent — template HTML
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.html` (crear)
- **Qué hace**: Template externo del editor. Contiene el `div#editorEl` que TipTap
  monta y el pie con el contador de palabras/caracteres. El contador lee los signals
  `wordCount()` y `charCount()` y usa la pipe `transloco` para las etiquetas
  `EDITOR.WORDS` y `EDITOR.CHARS`. No hay lógica, solo interpolación.
- **Depende de**: Tarea 4

---

#### Tarea 6: BinderContextMenuComponent
- **Fichero**: `src/app/features/editor/binder/binder-context-menu.component.ts` (crear)
  y `src/app/features/editor/binder/binder-context-menu.component.html` (crear)
- **Qué hace**: Componente de menú contextual flotante posicionado con `[style.left.px]`
  y `[style.top.px]`. Recibe la lista de acciones vía input signal y emite la acción
  seleccionada. Las etiquetas de las acciones vienen ya traducidas desde el padre
  (el BinderComponent construye las acciones con los strings traducidos usando
  `TranslocoService`), por lo que este componente no necesita importar TranslocoPipe.
  Exporta la interfaz `ContextMenuAction { label, action, danger? }`.
- **Depende de**: Tarea 2
- **Riesgo**: El componente se posiciona con `fixed`. Si el menú aparece fuera de
  la ventana en resoluciones pequeñas, está fuera del scope de esta spec.

---

#### Tarea 7: BinderNodeComponent — clase TypeScript
- **Fichero**: `src/app/features/editor/binder/binder-node.component.ts` (crear)
- **Qué hace**: Componente recursivo para un nodo del árbol. Puntos clave:
  - `expanded` debe ser un `signal<boolean>(true)` (no el objeto-función de la spec).
    El método `onRowClick()` llama a `this.expanded.update(v => !v)` para carpetas.
  - `isActive` y `renaming` deben ser `computed()` basados en los inputs `activeId`
    y `renamingId`.
  - El input para auto-foco del campo de renombrado: declarar
    `@ViewChild('renameInput') renameInputEl?: ElementRef<HTMLInputElement>` y crear
    un `effect()` en el constructor que, cuando `renaming()` sea `true`, llame a
    `this.renameInputEl?.nativeElement.focus()` en un `setTimeout(0)` para esperar
    al siguiente ciclo de renderizado.
  - El componente se importa a sí mismo en `imports: [BinderNodeComponent]` para
    la recursión.
  - `templateUrl` apunta a `./binder-node.component.html`.
  - Exporta la interfaz `NodeContextEvent { node: TreeNode; x: number; y: number }`.
- **Depende de**: Tarea 6
- **Riesgo**: La auto-referencia en `imports` puede causar un error de dependencia
  circular si el fichero no está correctamente guardado antes de compilar. Verificar
  que compila antes de continuar.

---

#### Tarea 8: BinderNodeComponent — template HTML
- **Fichero**: `src/app/features/editor/binder/binder-node.component.html` (crear)
- **Qué hace**: Template externo del nodo. Contiene la fila del nodo (chevron, icono,
  título / input de renombrado) y el bloque `@if (node().type === 'folder' && expanded())`
  con el `@for` que renderiza hijos recursivos via `<app-binder-node>`. Todos los
  strings de UI usan la pipe `transloco` donde aplique. El input de renombrado tiene
  la referencia de template `#renameInput`.
- **Depende de**: Tarea 7

---

#### Tarea 9: BinderComponent — clase TypeScript
- **Fichero**: `src/app/features/editor/binder/binder.component.ts` (crear)
- **Qué hace**: Componente orquestador del binder. Puntos clave:
  - Inyecta `ProjectService`, `DocumentService` y `TranslocoService`.
  - `contextActions` debe ser un `computed()` (no una función de flecha), que
    devuelve el array de `ContextMenuAction` con los labels ya traducidos via
    `this.translocoService.translate(...)`.
  - El host binding `'(document:click)': 'closeContextMenu()'` cierra el menú
    al hacer click fuera.
  - `addDocument` llama a `this.docService.createDocument(this.translocoService.translate('EDITOR.UNTITLED'), parentId)`.
  - `addFolder` llama a `this.projectService.addNode('folder', this.translocoService.translate('EDITOR.NEW_FOLDER'), parentId)`.
  - `templateUrl` apunta a `./binder.component.html`.
- **Depende de**: Tarea 7, Tarea 8

---

#### Tarea 10: BinderComponent — template HTML
- **Fichero**: `src/app/features/editor/binder/binder.component.html` (crear)
- **Qué hace**: Template externo del binder. Contiene el header con el nombre del
  proyecto y los botones + (documento y carpeta), el árbol con el estado vacío
  (`EDITOR.NO_DOCS`) y el `@if` para el `<app-binder-context-menu>`. Los títulos de
  los botones usan la pipe `transloco` con las claves `EDITOR.NEW_DOC` y
  `EDITOR.NEW_FOLDER_BTN`.
- **Depende de**: Tarea 9

---

#### Tarea 11: EditorTopBarComponent — clase TypeScript
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.ts` (crear)
- **Qué hace**: Barra superior con toggle del binder, título editable del documento,
  indicador de estado de guardado y botones de snapshot y focus mode. Puntos clave:
  - Todos los inputs son signals: `documentTitle`, `saveStatus`, `focusMode`.
  - Exporta el tipo `SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'`.
  - `templateUrl` apunta a `./editor-top-bar.component.html`.
  - El componente no tiene lógica propia, solo emite outputs.
- **Depende de**: Tarea 2

---

#### Tarea 12: EditorTopBarComponent — template HTML
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.html` (crear)
- **Qué hace**: Template externo de la barra superior. Contiene el botón de toggle
  del binder, el input editable del título del documento (con el placeholder
  `EDITOR.UNTITLED` vía `transloco`), el bloque `@switch` del estado de guardado con
  claves `EDITOR.SAVED`, `EDITOR.SAVING`, `EDITOR.UNSAVED` y `EDITOR.SAVE_ERROR`,
  y los botones de snapshot y focus mode con sus títulos traducidos. Cuando no hay
  documento abierto, muestra el span con `EDITOR.NO_DOC_OPEN`.
- **Depende de**: Tarea 11

---

#### Tarea 13: EditorLayoutComponent — reescribir clase TypeScript
- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar —
  reescritura completa del componente existente)
- **Qué hace**: Reemplaza el skeleton placeholder por el orquestador real.
  Puntos clave:
  - Inyecta `ProjectService`, `DocumentService` y `Router`.
  - Signals: `showBinder`, `focusMode`, `saveStatus`, `activeDocumentId`, `activeDocument`.
  - En `ngOnInit`, si `!projectService.isLoaded()`, navega a `/` y retorna.
    Si el proyecto está cargado, llama a `startAutosave()`.
  - `startAutosave` lee `projectService.project()?.settings.autosaveInterval`;
    si es `0`, no activa el interval.
  - `@HostListener('document:keydown')` gestiona `Ctrl+B`, `Ctrl+Shift+F` y `Ctrl+S`.
  - `openDocument` guarda el documento actual si `isDirty` antes de cargar el nuevo.
  - `onContentChanged` marca `isDirty = true` y pone `saveStatus` a `'unsaved'`.
  - `onTitleChanged` actualiza el signal `activeDocument`, llama a
    `projectService.renameNode` y marca `isDirty`.
  - `createSnapshot` llama a `docService.createSnapshot(doc)` (sin label) y luego
    a `docService.saveDocument(withSnapshot)`.
  - `templateUrl` apunta a `./editor-layout.component.html`.
  - Eliminar el import de `TranslocoPipe` y `ThemeService` que tiene el skeleton.
- **Depende de**: Tarea 9, Tarea 10, Tarea 11, Tarea 12
- **Riesgo**: El fichero `.ts` existente tiene un `templateUrl` que apunta al `.html`
  existente. El Implementer debe reescribir el `.ts` completo; el `.html` se reemplaza
  en la siguiente tarea.

---

#### Tarea 14: EditorLayoutComponent — reescribir template HTML
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar —
  reescritura completa)
- **Qué hace**: Reemplaza el placeholder HTML por el layout real de tres zonas.
  Estructura: `div.flex.flex-col.h-screen` > `@if (!focusMode()) { <app-editor-top-bar> }` +
  `div.flex.flex-1` > `@if (showBinder() && !focusMode()) { div.w-60 > <app-binder> }` +
  `div.flex-1 > @if (activeDocument()) { <app-tiptap-editor> } @else { estado vacío }` +
  botón de salida de focus mode + `@if (!focusMode()) { franja IA }`.
  Todos los strings de UI usan la pipe `transloco`.
- **Depende de**: Tarea 13

---

### Orden de ejecución

1. Tarea 1 — Instalar paquetes TipTap (pnpm)
2. Tarea 2 — Actualizar diccionarios i18n (es.json y en.json)
3. Tarea 3 — Crear utilidad tiptap-to-text
4. Tarea 4 — TiptapEditorComponent (clase .ts)
5. Tarea 5 — TiptapEditorComponent (template .html)
6. Tarea 6 — BinderContextMenuComponent (clase .ts + template .html)
7. Tarea 7 — BinderNodeComponent (clase .ts)
8. Tarea 8 — BinderNodeComponent (template .html)
9. Tarea 9 — BinderComponent (clase .ts)
10. Tarea 10 — BinderComponent (template .html)
11. Tarea 11 — EditorTopBarComponent (clase .ts)
12. Tarea 12 — EditorTopBarComponent (template .html)
13. Tarea 13 — EditorLayoutComponent (reescribir clase .ts)
14. Tarea 14 — EditorLayoutComponent (reescribir template .html)

---

### Puntos de atención para el Implementer

**Convenciones obligatorias:**

- Todos los componentes usan `templateUrl` externo. Sin `template` inline.
- Todos los componentes son `standalone: true`. Sin NgModules.
- Signals everywhere: `signal()`, `computed()`, `effect()`. Sin BehaviorSubject.
- Zoneless ya configurado: no usar `NgZone` ni `ChangeDetectorRef.markForCheck()`.
- `TauriBridgeService` es el único lugar con `import { invoke }`. Los componentes
  de esta spec nunca importan Tauri directamente.
- IDs generados con `crypto.randomUUID()`.
- Tokens CSS `--ink-*` siempre. Nunca `--ctp-*`.

**Correcciones de bugs respecto a la spec original:**

1. `expanded` en `BinderNodeComponent`: implementar como `expanded = signal<boolean>(true)`.
   La spec muestra un objeto-función que no es compatible con zoneless (no dispara
   change detection). `onRowClick()` debe llamar a `this.expanded.update(v => !v)`.

2. `isActive` y `renaming` en `BinderNodeComponent`: implementar como `computed()`
   derivados de los inputs, no como funciones de flecha:
   `isActive = computed(() => this.activeId() === this.node().id)`.

3. `wordCount` y `charCount` en `TiptapEditorComponent`: implementar como
   `wordCount = signal<number>(0)` y `charCount = signal<number>(0)`, actualizados
   dentro del callback `onUpdate` del editor TipTap. Las funciones de flecha de la
   spec no se actualizan en el template con zoneless.

4. Auto-foco del input de renombrado: usar `@ViewChild('renameInput')` +
   `effect()` que llama a `setTimeout(() => el.focus(), 0)` cuando `renaming()`
   es `true`. El `setTimeout` es necesario para esperar a que Angular haya
   renderizado el input en el DOM.

5. `contextActions` en `BinderComponent`: implementar como `computed()` que lee
   `this.contextMenu()?.node` y devuelve el array con los labels traducidos via
   `TranslocoService.translate(...)`. La función de flecha de la spec no reacciona
   reactivamente a cambios en el signal `contextMenu`.

**Restricciones de la spec (Lo que NO hacer):**

- No implementar el panel de snapshots (INK-06).
- No implementar el panel de IA (INK-08).
- No añadir toolbar de formato al editor (INK-09).
- No implementar drag & drop para reordenar el árbol (INK-09).

**Verificación entre tareas:**

- Tras la Tarea 1: confirmar que `node_modules/@tiptap/core` existe.
- Tras cada componente nuevo: ejecutar `pnpm run build` o `ng build` para verificar
  que no hay errores de TypeScript antes de pasar a la siguiente tarea.
- La Tarea 7 (BinderNodeComponent) se auto-referencia en `imports`. Si el compilador
  lanza un error de referencia circular, es señal de que el fichero no fue guardado
  correctamente. Revisar antes de continuar.
