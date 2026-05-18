# Plan de implementación — INK-16

## Resumen

INK-16 añade cuatro mejoras independientes de pulido final a Inkwell: corrector ortográfico nativo del navegador configurable por proyecto, indicadores visuales de estado en los nodos del binder, una barra de buscar y reemplazar integrada con TipTap, y exportación a DOCX. Las partes se implementan en orden secuencial (1 → 2 → 3 → 4) porque así lo requiere el plan, aunque no existe dependencia técnica entre ellas.

---

## Tareas

### Tarea 1: Ampliar `ProjectSettings` y `TreeNode` en el modelo
- **Fichero**: `src/app/core/models/project.model.ts` (modificar)
- **Qué hace**:
  - Añadir campo `spellcheck: boolean` a la interfaz `ProjectSettings` (justo después de `aiModel`).
  - Añadir el mismo campo con valor `true` a la constante `DEFAULT_PROJECT_SETTINGS`.
  - Definir el tipo `DocumentStatus` como unión de literales de string: `'draft' | 'revised' | 'final' | 'todo'`.
  - Definir la constante `DOCUMENT_STATUS_CONFIG` como objeto readonly que mapea cada valor de `DocumentStatus` a `{ label: string; color: string }`. El color debe ser una clase Tailwind de color de texto (`text-yellow-400`, `text-blue-400`, `text-green-400`, `text-red-400`) o similar que funcione con el sistema de theming existente.
  - Añadir campo opcional `status?: DocumentStatus` a la interfaz `TreeNode`.
- **Depende de**: ninguna dependencia previa.
- **Riesgo**: `DEFAULT_PROJECT_SETTINGS` se usa al crear proyectos nuevos. Los proyectos existentes no tendrán `spellcheck` ni `status` en sus JSON; los accesos deben usar `?? true` y `?? undefined` respectivamente. El Implementer no toca la serialización; Angular ya maneja que los campos opcionales ausentes sean `undefined`.

---

### Tarea 2: Añadir `updateNodeStatus` a `ProjectService`
- **Fichero**: `src/app/core/services/project.service.ts` (modificar)
- **Qué hace**:
  - Añadir una función pura privada `setNodeStatus(tree: TreeNode[], id: string, status: DocumentStatus): TreeNode[]` al final del fichero (junto al resto de funciones puras como `deleteNode`, `renameNode`, etc.). Recorre recursivamente el árbol y devuelve una copia con el `status` actualizado en el nodo cuyo `id` coincide.
  - Añadir el método público `async updateNodeStatus(id: string, status: DocumentStatus): Promise<void>` a la clase `ProjectService`. Actualiza el signal `project` aplicando `setNodeStatus` sobre el árbol actual, luego llama a `this.save()`.
  - Importar `DocumentStatus` desde el modelo.
- **Depende de**: Tarea 1.

---

### Tarea 3: Indicador visual de estado en `BinderNodeComponent`
- **Fichero**: `src/app/features/editor/binder/binder-node.component.ts` (modificar)
- **Qué hace**:
  - Importar `DOCUMENT_STATUS_CONFIG` y `DocumentStatus` desde el modelo.
  - Añadir método `statusColor(): string` que devuelve la clase de color CSS del estado actual del nodo, o una cadena vacía si el nodo no tiene `status`. Usa `DOCUMENT_STATUS_CONFIG[this.node().status!].color`.
  - Añadir método `statusLabel(): string` que devuelve el label del estado actual, o cadena vacía si no hay estado.
- **Depende de**: Tarea 1.

---

### Tarea 4: Template del indicador de estado en `binder-node.component.html`
- **Fichero**: `src/app/features/editor/binder/binder-node.component.html` (modificar)
- **Qué hace**:
  - Añadir un indicador de punto de color justo antes del span del título (o después del icono de documento/carpeta). Solo visible cuando `node().status` existe y el nodo es de tipo `document`. Usar un `<span>` pequeño con clases Tailwind para dimensiones (`w-2 h-2 rounded-full shrink-0`) y aplicar la clase de color dinámica con `[class]="statusColor()"`. Añadir `[title]="statusLabel()"` para accesibilidad.
- **Depende de**: Tarea 3.

---

### Tarea 5: Ampliar `ContextMenuAction` y actualizar template del context menu
- **Fichero**: `src/app/features/editor/binder/binder-context-menu.component.ts` (modificar)
- **Qué hace**:
  - Añadir campo opcional `disabled?: boolean` a la interfaz `ContextMenuAction`.
  - Añadir campo opcional `separator?: boolean` a la interfaz `ContextMenuAction` (para renderizar separadores visuales entre grupos de acciones).
- **Fichero**: `src/app/features/editor/binder/binder-context-menu.component.html` (modificar)
- **Qué hace**:
  - Actualizar el bucle `@for` para manejar tres casos con `@if`:
    1. Si `item.separator` es `true`: renderizar un `<hr>` con clase `border-ink-border my-1`.
    2. Si `item.disabled` es `true`: renderizar el item como `<span>` (no `<button>`) con estilos de texto atenuado (`text-ink-muted cursor-default px-4 py-1 text-xs`).
    3. Caso normal: el `<button>` existente, añadiendo la condición `disabled` para cuando `item.disabled` sea `true`.
- **Depende de**: Tarea 1 (para los tipos de status).
- **Riesgo**: El `@for` actual trackea por `item.action`. Los separadores no tienen `action` real; asignar una cadena única como `'separator-N'` o usar el índice `$index` como track fallback.

---

### Tarea 6: Integrar acciones de estado en `BinderComponent`
- **Fichero**: `src/app/features/editor/binder/binder.component.ts` (modificar)
- **Qué hace**:
  - Importar `DOCUMENT_STATUS_CONFIG`, `DocumentStatus` desde el modelo.
  - Importar `ProjectService` para poder llamar a `updateNodeStatus`.
  - Actualizar `contextActions` computed para que, cuando el nodo sea de tipo `document`, añada después de "Renombrar": un separador, luego una acción deshabilitada con label "Estado" (cabecera de grupo), y luego una acción por cada valor de `DocumentStatus` extraído de `DOCUMENT_STATUS_CONFIG` con `action: 'status:draft'`, `action: 'status:revised'`, etc. Las acciones de estado deben marcarse visualmente con el label del config (p.ej. "Borrador", "Revisado", "Final", "Pendiente").
  - Actualizar `onContextAction(action: string)` para detectar si la acción empieza con `'status:'`, extraer el valor del status, y llamar a `this.projectService.updateNodeStatus(node.id, status as DocumentStatus)`.
- **Depende de**: Tareas 2, 5.

---

### Tarea 7: Toggle de spellcheck en `InkSettingsModalComponent`
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (modificar)
- **Qué hace**:
  - Añadir propiedad de clase `spellcheck = true` (valor inicial) junto a `autosaveInterval` y `maxSnapshots`.
  - En `ngOnInit`, leer `settings.spellcheck ?? true` y asignarlo a `this.spellcheck`.
  - En `saveEditorSettings()`, añadir `spellcheck: this.spellcheck` al objeto pasado a `projectService.updateSettings(...)`.
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**:
  - Añadir un bloque de configuración de spellcheck en la sección editor (después del bloque de maxSnapshots, antes del botón "Guardar cambios"). El bloque consiste en un `<label>` con el texto "Corrector ortográfico" y un `<input type="checkbox">` con `[(ngModel)]="spellcheck"`.
- **Depende de**: Tarea 1.

---

### Tarea 8: Pasar `spellcheck` desde `EditorLayoutComponent` al editor y añadir input al `TiptapEditorComponent`
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
- **Qué hace**:
  - Añadir `spellcheck = input<boolean>(true)` junto al resto de inputs.
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.html` (modificar)
- **Qué hace**:
  - En el div `#editorEl`, añadir el binding `[attr.spellcheck]="spellcheck()"`. El atributo HTML nativo `spellcheck` con valor booleano habilitará o deshabilitará el corrector del navegador en el div contenteditable que TipTap gestiona.
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**:
  - En el elemento `<app-tiptap-editor>`, añadir el binding `[spellcheck]="projectService.project()?.settings.spellcheck ?? true"`.
- **Depende de**: Tarea 1.
- **Riesgo**: El div `#editorEl` no tiene el atributo `contenteditable` directamente en el template HTML; TipTap lo añade al montar el editor en `ngAfterViewInit`. El binding `[attr.spellcheck]` se aplica al elemento del DOM antes de que TipTap lo convierta en contenteditable, pero dado que el atributo persiste en el elemento y TipTap no lo elimina, esto es suficiente. No se necesita reaccionar a cambios del input dentro de TipTap porque `ngOnChanges` no tiene soporte para `spellcheck` — si el usuario cambia el setting deberá guardarlo y el binding se aplicará en la próxima carga. Alternativamente, si se quiere reactivo, el Implementer puede añadir un `effect()` que lea `this.spellcheck()` y llame a `this.editorEl.nativeElement.setAttribute('spellcheck', String(this.spellcheck()))`. **Preferir la opción de `effect()` para que el cambio en settings sea inmediato sin recargar.**

---

### Tarea 9: Instalar `@tiptap/extension-search-and-replace`
- **Fichero**: `package.json` + `pnpm-lock.yaml` (modificar via pnpm)
- **Qué hace**:
  - Ejecutar `pnpm add @tiptap/extension-search-and-replace` en la raíz del proyecto.
- **Depende de**: ninguna dependencia previa.
- **Riesgo**: Verificar que la versión instalada es compatible con la versión de `@tiptap/core` ya instalada (debe ser la misma major, probablemente `^2.x`). Si hay conflicto de pares, revisar antes de continuar.

---

### Tarea 10: Añadir extensión `SearchAndReplace` y métodos públicos al `TiptapEditorComponent`
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
- **Qué hace**:
  - Importar `SearchAndReplace` desde `@tiptap/extension-search-and-replace`.
  - Añadir `SearchAndReplace.configure({ disableRegex: false })` al array de extensiones en `ngAfterViewInit`, junto a `StarterKit`, `Placeholder` y `CharacterCount`.
  - Añadir los siguientes métodos públicos (todos comprueban `if (!this.editor) return` al inicio):
    - `find(term: string): void` — llama a `this.editor.commands.setSearchTerm(term)`.
    - `findNext(): void` — llama a `this.editor.commands.nextSearchResult()`.
    - `findPrev(): void` — llama a `this.editor.commands.previousSearchResult()`.
    - `replace(replacement: string): void` — llama a `this.editor.commands.replace(replacement)`.
    - `replaceAll(replacement: string): void` — llama a `this.editor.commands.replaceAll(replacement)`.
    - `clearSearch(): void` — llama a `this.editor.commands.resetIndex()` seguido de `this.editor.commands.setSearchTerm('')`.
    - `getSearchResultCount(): number` — devuelve `(this.editor.storage['searchAndReplace']?.results?.length ?? 0)`.
- **Depende de**: Tarea 9.
- **Riesgo**: La API exacta de comandos de `@tiptap/extension-search-and-replace` puede diferir ligeramente entre versiones. Consultar el README del paquete instalado para confirmar los nombres exactos de los comandos (`setSearchTerm`, `nextSearchResult`, `previousSearchResult`, `replace`, `replaceAll`, `resetIndex`). Si algún comando no existe, usar la alternativa equivalente que ofrezca la versión instalada.

---

### Tarea 11: Añadir estilos de resultados de búsqueda al `TiptapEditorComponent`
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
- **Qué hace**:
  - En el array `styles` del decorador `@Component` (que ya contiene los estilos inline de ProseMirror), añadir dos reglas `::ng-deep`:
    - `::ng-deep .tiptap-host .ProseMirror .search-result` con `background-color: var(--ink-accent)` y `opacity: 0.35`, o una variable semejante que resulte visible en ambos temas.
    - `::ng-deep .tiptap-host .ProseMirror .search-result-current` con `background-color: var(--ink-accent)` y `opacity: 0.7`, diferenciándolo visualmente del resto de resultados.
  - Estas clases son las que `SearchAndReplace` aplica automáticamente a las coincidencias en el DOM del editor.
- **Depende de**: Tarea 9.
- **Riesgo**: El nombre exacto de las clases que aplica la extensión puede variar. Confirmar con la documentación o el código fuente del paquete instalado. Las clases típicas son `.search-result` y `.search-result-current`; si difieren, ajustar las reglas CSS.

---

### Tarea 12: Crear `FindReplaceBarComponent` — lógica
- **Fichero**: `src/app/features/editor/find-replace-bar/find-replace-bar.component.ts` (crear)
- **Qué hace**:
  - Componente standalone con selector `app-find-replace-bar`.
  - `templateUrl` apuntando a `./find-replace-bar.component.html`.
  - Inputs:
    - `searchResultCount = input<number>(0)` — número de resultados encontrados.
  - Outputs:
    - `termChanged = output<string>()` — emite el término de búsqueda cada vez que el input cambia.
    - `findNext = output<void>()`
    - `findPrev = output<void>()`
    - `replaced = output<string>()` — emite el texto de reemplazo al pulsar "Reemplazar".
    - `replacedAll = output<string>()` — emite el texto al pulsar "Reemplazar todo".
    - `closed = output<void>()`
  - Signals internos:
    - `searchTerm = signal<string>('')`
    - `replaceTerm = signal<string>('')`
    - `showReplace = signal<boolean>(false)`
  - Métodos:
    - `onSearchInput(event: Event): void` — actualiza `searchTerm` y emite `termChanged`.
    - `onToggleReplace(): void` — alterna `showReplace`.
    - `onFindNext(): void` — emite `findNext`.
    - `onFindPrev(): void` — emite `findPrev`.
    - `onReplace(): void` — emite `replaced` con `replaceTerm()`.
    - `onReplaceAll(): void` — emite `replacedAll` con `replaceTerm()`.
    - `onClose(): void` — emite `closed`.
  - HostListener para `keydown.escape` que llame a `onClose()`.
- **Depende de**: ninguna dependencia previa (es un componente nuevo independiente de TipTap).

---

### Tarea 13: Crear `find-replace-bar.component.html`
- **Fichero**: `src/app/features/editor/find-replace-bar/find-replace-bar.component.html` (crear)
- **Qué hace**:
  - Barra horizontal con fondo `bg-ink-surface border-b border-ink-border` y padding compacto.
  - Fila superior: input de búsqueda (`placeholder="Buscar..."`, `(input)="onSearchInput($event)"`), contador de resultados (`{{ searchResultCount() }} resultado(s)`), botones "Anterior" (←), "Siguiente" (→), botón toggle "Reemplazar", botón de cierre (×).
  - Fila de reemplazo (visible solo con `@if (showReplace())`): input de reemplazo (`placeholder="Reemplazar por..."`, `[(ngModel)]` o binding manual con `(input)`), botón "Reemplazar" (`(click)="onReplace()"`), botón "Reemplazar todo" (`(click)="onReplaceAll()"`).
  - Usar clases Tailwind para todos los estilos. Sin estilos CSS separados (el componente no necesita un `.css` aparte dado que todo puede cubrirse con Tailwind).
  - Importar `FormsModule` si se usa `ngModel` para el input de reemplazo.
- **Depende de**: Tarea 12.

---

### Tarea 14: Añadir output `findReplaceToggled` a `EditorTopBarComponent`
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.ts` (modificar)
- **Qué hace**:
  - Añadir `showFindReplace = input<boolean>(false)`.
  - Añadir `findReplaceToggled = output<void>()`.
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.html` (modificar)
- **Qué hace**:
  - Añadir un botón de lupa/buscar-reemplazar en la barra de herramientas (junto al resto de botones), con icono SVG apropiado (dos líneas con lupa, o una lupa con flechas). El botón emite `findReplaceToggled.emit()` en `(click)`. Aplicar el mismo patrón activo/inactivo que tienen los botones `showSnapshots` y `showAiPanel`: cuando `showFindReplace()` es `true`, usar `text-ink-accent bg-ink-border`; si no, el estilo normal. Añadir `title="Buscar y reemplazar (Ctrl+H)"`.
- **Depende de**: ninguna dependencia previa.

---

### Tarea 15: Integrar la barra Find & Replace en `EditorLayoutComponent`
- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**:
  - Importar `FindReplaceBarComponent`.
  - Añadir `FindReplaceBarComponent` al array `imports`.
  - Añadir signal `showFindReplace = signal(false)`.
  - Añadir signal `findReplaceCount = signal<number>(0)`.
  - Añadir método `toggleFindReplace(): void` que alterna `showFindReplace`.
  - Añadir método `onFindTermChanged(term: string): void` que llama a `this.tiptapEditor?.find(term)` y actualiza `findReplaceCount` con `this.tiptapEditor?.getSearchResultCount() ?? 0`.
  - Añadir método `onFindNext(): void` que llama a `this.tiptapEditor?.findNext()`.
  - Añadir método `onFindPrev(): void` que llama a `this.tiptapEditor?.findPrev()`.
  - Añadir método `onReplace(term: string): void` que llama a `this.tiptapEditor?.replace(term)`.
  - Añadir método `onReplaceAll(term: string): void` que llama a `this.tiptapEditor?.replaceAll(term)`.
  - Añadir método `onFindReplaceClosed(): void` que pone `showFindReplace.set(false)` y llama a `this.tiptapEditor?.clearSearch()`.
  - Ampliar el `@HostListener` `onKeyDown` (o añadir uno adicional) para:
    - `Ctrl+H`: `event.preventDefault(); this.toggleFindReplace()`.
    - `Ctrl+G`: `event.preventDefault(); this.tiptapEditor?.findNext()`.
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**:
  - En el elemento `<app-editor-top-bar>`, añadir el input `[showFindReplace]="showFindReplace()"` y el output `(findReplaceToggled)="toggleFindReplace()"`.
  - Insertar `<app-find-replace-bar>` entre la top-bar y el área de contenido (`<div class="flex flex-1 overflow-hidden">`), visible solo cuando `showFindReplace()` es `true`. Conectar todos sus outputs a los métodos del componente:
    ```
    (termChanged)="onFindTermChanged($event)"
    (findNext)="onFindNext()"
    (findPrev)="onFindPrev()"
    (replaced)="onReplace($event)"
    (replacedAll)="onReplaceAll($event)"
    (closed)="onFindReplaceClosed()"
    [searchResultCount]="findReplaceCount()"
    ```
- **Depende de**: Tareas 10, 12, 13, 14.

---

### Tarea 16: Actualizar `ShortcutsModalComponent` con los nuevos atajos
- **Fichero**: `src/app/shared/components/shortcuts-modal.component.ts` (modificar)
- **Qué hace**:
  - En el grupo `'Editor'` de la constante `SHORTCUTS`, añadir:
    - `{ keys: ['Ctrl', 'H'], description: 'Abrir / cerrar buscar y reemplazar' }`
    - `{ keys: ['Ctrl', 'G'], description: 'Siguiente resultado de búsqueda' }`
  - El componente usa template inline; la modificación se hace directamente en el array `SHORTCUTS` dentro del `.ts`.
- **Depende de**: ninguna dependencia previa (es puramente informativo).

---

### Tarea 17: Instalar `docx`
- **Fichero**: `package.json` + `pnpm-lock.yaml` (modificar via pnpm)
- **Qué hace**:
  - Ejecutar `pnpm add docx` en la raíz del proyecto.
- **Depende de**: ninguna dependencia previa.
- **Riesgo**: La librería `docx` genera documentos `.docx` en el browser usando la API `Blob`. Verificar que la versión instalada soporte entorno browser (debe ser `docx@^8.x` o superior, que no depende de Node fs). Si se instala una versión que requiera Node, habrá error en tiempo de ejecución de Tauri WebView.

---

### Tarea 18: Añadir `'docx'` a `ExportFormat`
- **Fichero**: `src/app/core/models/export.model.ts` (modificar)
- **Qué hace**:
  - Ampliar el tipo `ExportFormat = 'pdf-manuscript' | 'epub' | 'docx'`.
- **Depende de**: ninguna dependencia previa.

---

### Tarea 19: Implementar métodos de exportación DOCX en `ExportService`
- **Fichero**: `src/app/core/services/export.service.ts` (modificar)
- **Qué hace**:
  - Añadir importación de los tipos necesarios de `docx`: `Document`, `Paragraph`, `TextRun`, `HeadingLevel`, `Packer` (y cualquier otro tipo que sea necesario para representar negritas, cursivas, headings y párrafos normales).
  - Añadir caso `'docx'` en el método `export()`: si `options.format === 'docx'`, llamar a `this.exportDocx(ordered, options.metadata, projectTitle)`.
  - Añadir método privado `async exportDocx(docs: DocumentFile[], meta: ExportMetadata, title: string): Promise<void>`:
    - Pide una ruta al usuario con `this.bridge.saveFileDialog(title + '.docx', 'docx')`. Si no hay ruta, retornar.
    - Llama a `this.buildDocxDocument(docs, meta, title)` para obtener un `Document`.
    - Serializa con `await Packer.toBuffer(doc)` o `await Packer.toBlob(doc)` según lo que ofrezca la versión instalada.
    - Escribe el fichero con `this.bridge.writeBinaryFile(path, arrayBuffer)`.
  - Añadir método privado `buildDocxDocument(docs: DocumentFile[], meta: ExportMetadata, title: string): Document`:
    - Crea y devuelve un `new Document({ sections: [{ children: paragraphs }] })` donde `paragraphs` es el resultado de `this.tiptapToDocxParagraphs(docs)`.
  - Añadir método privado `tiptapToDocxParagraphs(docs: DocumentFile[]): Paragraph[]`:
    - Itera los documentos. Para cada uno, añade un `Paragraph` con `HeadingLevel.HEADING_1` con el título, seguido del resultado de `this.nodeToDocx(doc.content)`.
    - Devuelve la lista plana de todos los `Paragraph` de todos los documentos.
  - Añadir método privado `nodeToDocx(node: object): Paragraph[]`:
    - Inspecciona el campo `type` del nodo TipTap. Casos a manejar:
      - `'doc'`: iterar `content[]` y concatenar resultados recursivos.
      - `'paragraph'`: crear un `Paragraph` con los `TextRun` de `this.inlineToRuns(node.content ?? [])`.
      - `'heading'`: crear un `Paragraph` con `heading: HeadingLevel.HEADING_N` según `node.attrs.level`, con los mismos `TextRun`.
      - `'blockquote'`: iterar el `content[]` recursivamente.
      - `'bulletList'`, `'orderedList'`: iterar `content[]`.
      - `'listItem'`: iterar `content[]`.
      - `'hardBreak'`: devolver un `Paragraph` vacío.
      - Cualquier otro tipo desconocido: devolver `[]`.
  - Añadir método privado `inlineToRuns(nodes: object[]): TextRun[]`:
    - Para cada nodo inline de tipo `'text'`: crear un `TextRun({ text: node.text, bold: node.marks?.some(m => m.type === 'bold'), italics: node.marks?.some(m => m.type === 'italic') })`.
    - Para tipo `'hardBreak'`: crear un `TextRun({ break: 1 })`.
    - Cualquier otro: ignorar o devolver `TextRun({ text: '' })`.
- **Depende de**: Tareas 17, 18.
- **Riesgo**: La API de la librería `docx` cambia entre versiones mayores. Asegurarse de usar la API de la versión instalada. En `docx@^8.x`, `Packer.toBuffer()` devuelve un `Buffer` que en el browser es un `Uint8Array`. Para pasarlo a `writeBinaryFile` se necesita el `ArrayBuffer` subyacente: `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)` — el mismo patrón que ya usa `exportEpub`. Tipar el contenido de los nodos TipTap como `any` localmente en estos métodos (es el único lugar donde `any` está justificado en esta spec).

---

### Tarea 20: Añadir botón DOCX en `StepFormatComponent`
- **Fichero**: `src/app/features/export/steps/step-format.component.ts` (modificar)
- **Qué hace**:
  - ATENCION: Este componente usa `template:` inline, no `templateUrl`. La modificación del template se hace directamente en el decorador `@Component` dentro del `.ts`.
  - Añadir un tercer botón de formato junto a "PDF Manuscrito" y "EPUB", con acción `format.set('docx')`, título "DOCX" y descripción "Microsoft Word. Para colaboración y revisiones con editores.", e icono SVG de documento Word (o un icono genérico de documento).
  - El botón debe seguir el mismo patrón de clases activo/inactivo que los existentes: `border-ink-accent bg-ink-surface` cuando activo, `border-ink-border hover:border-ink-muted` cuando inactivo.
- **Depende de**: Tarea 18.

---

### Tarea 21: Manejar caso `docx` en `ExportModalComponent.doExport()`
- **Fichero**: `src/app/features/export/export-modal.component.ts` (modificar)
- **Qué hace**:
  - ATENCION: Este componente usa `template:` inline. El `signal` `selectedFormat` ya admitirá `'docx'` gracias a la Tarea 18.
  - En el método `doExport()`, actualizar el mensaje del toast para manejar el caso `docx`. El `ExportService.export()` ya enruta a `exportDocx` gracias a la Tarea 19, así que no se necesita lógica adicional aquí más allá del mensaje.
  - Cambiar la condición del toast de:
    ```
    this.selectedFormat() === 'epub' ? '...' : '...'
    ```
    a una expresión que distinga los tres formatos: `epub` → "EPUB guardado correctamente.", `docx` → "Documento DOCX guardado correctamente.", `pdf-manuscript` → "Manuscrito abierto. Pulsa ..."
- **Depende de**: Tareas 18, 19.

---

## Orden de ejecución

1. Tarea 1 — Ampliar modelo (`project.model.ts` y `export.model.ts`)
2. Tarea 18 — Ampliar `ExportFormat` (puede ir con Tarea 1 en la misma llamada si el Implementer quiere)
3. Tarea 2 — `updateNodeStatus` en `ProjectService`
4. Tarea 3 — Métodos `statusColor/statusLabel` en `BinderNodeComponent`
5. Tarea 4 — Template del indicador de estado en `binder-node.component.html`
6. Tarea 5 — `ContextMenuAction.disabled/separator` + template del context menu
7. Tarea 6 — Acciones de estado en `BinderComponent`
8. Tarea 7 — Toggle spellcheck en `InkSettingsModalComponent` (.ts y .html)
9. Tarea 8 — Input `spellcheck` en `TiptapEditorComponent` + binding en `EditorLayoutComponent`
10. Tarea 9 — `pnpm add @tiptap/extension-search-and-replace`
11. Tarea 10 — Extensión `SearchAndReplace` + métodos públicos en `TiptapEditorComponent`
12. Tarea 11 — Estilos `.search-result` en `TiptapEditorComponent`
13. Tarea 12 — Crear `FindReplaceBarComponent` (.ts)
14. Tarea 13 — Crear `find-replace-bar.component.html`
15. Tarea 14 — Output `findReplaceToggled` en `EditorTopBarComponent`
16. Tarea 15 — Integrar `FindReplaceBarComponent` en `EditorLayoutComponent`
17. Tarea 16 — Actualizar `ShortcutsModalComponent`
18. Tarea 17 — `pnpm add docx`
19. Tarea 19 — Métodos DOCX en `ExportService`
20. Tarea 20 — Botón DOCX en `StepFormatComponent`
21. Tarea 21 — Toast para DOCX en `ExportModalComponent`

---

## Puntos de atención para el Implementer

### Convenciones del proyecto
- Todos los templates nuevos van en fichero `.html` separado. Sin excepción para `FindReplaceBarComponent`.
- Si se crea un CSS separado para `FindReplaceBarComponent`, debe apuntarse con `styleUrl`. Sin embargo, dado que todo puede cubrirse con Tailwind, se puede omitir el `.css` y no declarar `styleUrl`.
- Signals everywhere: `signal()`, `input()`, `output()`, `computed()`. Sin `BehaviorSubject`.
- Sin `NgZone`. Zoneless.
- `crypto.randomUUID()` para IDs, pero en esta spec no se crean IDs.

### Anomalías detectadas en el código existente
- `StepFormatComponent` usa `template:` inline (no `templateUrl`). La adición del botón DOCX se hace en el `.ts`.
- `ExportModalComponent` usa `template:` inline. La modificación del toast se hace en el `.ts`.
- `ShortcutsModalComponent` usa `template:` inline. Los nuevos atajos se añaden en el array `SHORTCUTS` dentro del `.ts`.
- `TiptapEditorComponent` usa `styles:` inline (array de strings). Los estilos de search-result se añaden en ese array, no en un `.css` separado.

### Riesgos específicos de la Parte 3 (Find & Replace)
- `SearchAndReplace` debe añadirse en `ngAfterViewInit`, no en `ngOnInit`, porque el editor se inicializa en `AfterViewInit`.
- Los métodos públicos del `TiptapEditorComponent` (`find`, `findNext`, etc.) se llaman desde `EditorLayoutComponent` vía `@ViewChild`. Si `tiptapEditor` es `undefined` (no hay documento abierto), los métodos deben protegerse con `this.tiptapEditor?.method()`.
- El `HostListener` para `Ctrl+H` en `EditorLayoutComponent` puede colisionar con el comportamiento nativo del browser (historial en algunos contextos). El `event.preventDefault()` es obligatorio.
- `Ctrl+G` también puede colisionar con comportamientos del browser (en algunos sistemas abre el diálogo de ir a línea). Siempre `event.preventDefault()`.
- El `HostListener` existente en `EditorLayoutComponent` maneja `Ctrl+f` (minúscula) con `!event.shiftKey`. Al añadir `Ctrl+H`, verificar que la condición de `event.key` sea case-insensitive o usar el key exacto que emite el browser (`'h'` en minúscula sin shift, `'H'` con shift — en este caso sin shift).

### Riesgos específicos de la Parte 4 (DOCX)
- La librería `docx` debe ser compatible con el entorno browser de Tauri WebView. Confirmar con `import { Document } from 'docx'` que no hay errores de módulo Node.
- El método `tiptapToDocxParagraphs` accede a la estructura JSON de TipTap; tipar el nodo como `any` localmente para evitar errores de strict TypeScript.
- `Packer.toBuffer()` en el browser puede devolver `Uint8Array` en lugar de un `Buffer` de Node. Usar el mismo patrón de extracción de `ArrayBuffer` que ya usa `exportEpub`: `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)`.
- `TauriBridgeService.saveFileDialog` y `writeBinaryFile` ya existen y funcionan (se usan en `exportEpub`). No hay que crear comandos Rust nuevos.

### Retrocompatibilidad con proyectos existentes
- Los proyectos guardados en disco no tendrán `spellcheck` en `settings`; leer siempre con `?? true`.
- Los nodos del árbol no tendrán `status`; tratarlo siempre como opcional y comprobar su existencia antes de acceder a `DOCUMENT_STATUS_CONFIG[status]`.
