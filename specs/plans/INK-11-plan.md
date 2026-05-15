# Plan INK-11 — Búsqueda, recuento global, perfil de autor y sinopsis

## Resumen

Esta spec añade cuatro capacidades interrelacionadas: (1) un caché de recuento de palabras por documento mantenido automáticamente en `project.json`; (2) un `SearchService` que busca texto plano en todos los documentos del proyecto; (3) un perfil de autor persistido en `project.json` que pre-rellena el formulario de exportación; y (4) sinopsis opcionales por documento con generación vía IA. Las tareas se ordenan de modelo a servicio a componente para garantizar que cada capa compile antes de que la siguiente dependa de ella.

---

## Tareas

### Tarea 1 — Ampliar project.model.ts

**Fichero(s)**: `src/app/core/models/project.model.ts` (modificar)

**Qué hacer**:
- Añadir la interfaz `AuthorProfile` con los campos: `legalName: string`, `penName?: string`, `email: string`, `phone?: string`, `address?: string`, `agentName?: string`, `agentContact?: string`, `genre: string`, `language: string`, `copyrightYear: number`, `publisher?: string`.
- Añadir al interfaz `Project` los campos `wordCountCache: Record<string, number>` y `authorProfile?: AuthorProfile`.
- Exportar `AuthorProfile`.

**Contexto**: `Project` actualmente tiene: `id`, `name`, `description`, `createdAt`, `updatedAt`, `tree`, `settings`. Los dos campos nuevos son opcionales en runtime (proyectos existentes no los tendrán) pero deben declararse sin `?` en `wordCountCache` porque siempre se inicializa al abrir o crear.

**Criterio de done**: El fichero compila sin errores. `AuthorProfile` está exportada. `Project.wordCountCache` es `Record<string, number>` (sin `?`). `Project.authorProfile` es `AuthorProfile | undefined` (con `?`).

---

### Tarea 2 — Ampliar document.model.ts

**Fichero(s)**: `src/app/core/models/document.model.ts` (modificar)

**Qué hacer**:
- Añadir `synopsis?: string` a `DocumentFile`.

**Contexto**: Campo simple, opcional. El resto de la interfaz no cambia.

**Criterio de done**: El fichero compila. `DocumentFile.synopsis` es `string | undefined`.

---

### Tarea 3 — Ampliar ProjectService

**Fichero(s)**: `src/app/core/services/project.service.ts` (modificar)

**Qué hacer**:
1. En `createProject()`: añadir `wordCountCache: {}` al objeto `Project` inicial antes de escribirlo a disco.
2. En `openProject()`: tras parsear el JSON, si `project.wordCountCache` es `undefined`, inicializarlo como `{}` antes de llamar a `this.project.set(project)`.
3. Añadir el computed `readonly totalWordCount = computed(() => { ... })` que suma todos los valores del `wordCountCache` del proyecto actual. Si `project()` es null, devuelve 0.
4. Añadir el método `async updateWordCountCache(documentId: string, wordCount: number): Promise<void>` que actualiza el signal con `project.update(...)` y luego llama a `this.saveProjectOnly()`.
5. Añadir el método `async updateAuthorProfile(profile: AuthorProfile): Promise<void>` que actualiza el signal con `project.update(...)` y luego llama a `this.saveProjectOnly()`. Importar `AuthorProfile` desde el modelo.
6. Añadir el método privado `private async saveProjectOnly(): Promise<void>` que lee `project()` y `basePath()`, guarda el JSON en `projectJsonPath(basePath)` (sin modificar `updatedAt`) y actualiza el signal.

**Contexto**: El método `save()` existente escribe `project.json` y actualiza `updatedAt`. `saveProjectOnly()` es similar pero sin tocar `updatedAt`, porque los documentos individuales tienen su propio `updatedAt`. No usar `save()` en `updateWordCountCache` ni `updateAuthorProfile` para no alterar innecesariamente el timestamp del proyecto.

**Riesgo**: `saveProjectOnly()` debe actualizar el signal después de escribir a disco (igual que `save()`), para que `project()` refleje los cambios. Si solo actualiza el signal sin persistir, el caché se pierde al reabrir.

**Criterio de done**: Compila. `totalWordCount` retorna la suma correcta. `updateWordCountCache` persiste en `project.json`. Los proyectos existentes sin `wordCountCache` se abren sin error.

---

### Tarea 4 — Crear SearchService

**Fichero(s)**: `src/app/core/services/search.service.ts` (crear)

**Qué hacer**:
- Declarar las interfaces en el mismo fichero: `SearchMatch { context: string; matchIndex: number }` y `SearchResult { documentId: string; documentTitle: string; matches: SearchMatch[] }`.
- Servicio `providedIn: 'root'`, inyecta `TauriBridgeService` y `ProjectService`.
- Campo privado `textCache = new Map<string, string>()`.
- Constantes privadas `CONTEXT_RADIUS = 60` y `MAX_MATCHES_PER_DOC = 5`.
- Método `invalidate(documentId: string): void` — borra la entrada del caché.
- Método `private getDocumentTitle(documentId: string): string` — busca en `projectService.project()?.tree` usando `findNode` (importar desde `project.service.ts`).
- Método `async search(query: string, wholeWord = true): Promise<SearchResult[]>` — pasos:
  1. Validar que `query.trim()` no esté vacío. Si está vacío, devolver `[]`.
  2. Obtener `basePath` de `projectService.basePath()`. Si null, devolver `[]`.
  3. Listar archivos con `bridge.listJsonFiles(documentsFolderPath(basePath))`.
  4. Para cada fichero (extraer el `id` del nombre sin extensión):
     a. Si hay entrada en `textCache`, usarla; si no, leer con `bridge.readJsonFile(documentPath(basePath, id))`, parsear el JSON como `DocumentFile`, llamar a `tiptapToText(doc.content)`, guardar en `textCache`.
     b. Construir el `RegExp` con `wholeWord ? new RegExp('\\b' + escapedQuery + '\\b', 'gi') : new RegExp(escapedQuery, 'gi')`. Usar una función `escapeRegExp` privada.
     c. Iterar matches hasta `MAX_MATCHES_PER_DOC`. Para cada match: extraer el contexto `[matchIndex - CONTEXT_RADIUS, matchIndex + query.length + CONTEXT_RADIUS]`.
     d. Si hay matches, añadir a resultados.
  5. Devolver `SearchResult[]` ordenado por número de matches descendente.
- Exportar `SearchResult` y `SearchMatch`.

**Contexto**: `findNode` ya está exportado desde `project.service.ts`. `tiptapToText` está en `src/app/shared/utils/tiptap-to-text.ts`. `documentsFolderPath` y `documentPath` están en `project-paths.ts`. `TauriBridgeService.listJsonFiles` devuelve `Promise<string[]>` (paths completos). El id del documento se extrae del basename del path sin la extensión `.json`.

**Riesgo**: La lista de ficheros devuelta por `listJsonFiles` son paths completos (p.ej. `/home/user/mi-novela/documents/abc-123.json`). El Implementer debe extraer el basename y quitar `.json` para obtener el `documentId`. Usar `path.split('/').pop()?.replace('.json', '') ?? ''` o equivalente.

**Criterio de done**: Compila. El servicio es inyectable sin error. Los métodos `search` e `invalidate` tienen las firmas correctas.

---

### Tarea 5 — Modificar DocumentService para actualizar caché

**Fichero(s)**: `src/app/core/services/document.service.ts` (modificar)

**Qué hacer**:
- Inyectar `SearchService` (además del `ProjectService` ya inyectado).
- Añadir método privado `countWords(doc: DocumentFile): number` que llama a `tiptapToText(doc.content)`, hace `.split(/\s+/)`, filtra strings vacíos y devuelve la longitud. Importar `tiptapToText`.
- En `saveDocument()`, después de hacer `writeJsonFile`, añadir dos llamadas no bloqueantes (no hay que hacer `await` de ellas en el flujo principal, pero sí lanzarlas):
  - `this.projectService.updateWordCountCache(updated.id, this.countWords(updated))`
  - `this.searchService.invalidate(updated.id)`
  - Ambas deben lanzarse con `.catch(() => {})` para no romper el flujo de guardado si falla.

**Contexto**: `DocumentService` ya inyecta `ProjectService`. `SearchService` inyecta `ProjectService` y `TauriBridgeService`. No hay dependencia circular: `DocumentService` → `SearchService` → `ProjectService` (sin ciclo). Las llamadas en `saveDocument` se lanzan como fire-and-forget para no bloquear el retorno.

**Riesgo**: Añadir `SearchService` como dependencia de `DocumentService` es seguro porque `SearchService` no depende de `DocumentService`. Verificar antes de implementar que el grafo de dependencias es `DocumentService → SearchService → ProjectService` y no al revés.

**Criterio de done**: Compila. Al guardar un documento, `projectService.updateWordCountCache` es llamado y el `totalWordCount` computed se actualiza reactivamente.

---

### Tarea 6 — Crear BinderFooterComponent

**Fichero(s)**: `src/app/features/editor/binder/binder-footer.component.ts` (crear)

**Qué hacer**:
- Componente standalone con selector `app-binder-footer`.
- Inyecta `ProjectService`.
- Input: `searchActive = input<boolean>(false)`.
- Output: `searchToggled = output<void>()`.
- Computed `wordCountLabel = computed(() => { ... })` con la lógica:
  - 0 palabras → `'Proyecto vacío'`
  - < 1000 → `'N palabras'`
  - >= 1000 → `'N,Nk palabras'` (con un decimal, p.ej. `'12,3k palabras'`)
- Template inline (no HTML externo): barra inferior con el label de palabras a la izquierda y un botón lupa a la derecha que emite `searchToggled`. El botón lupa usa el icono SVG inline o un carácter unicode (usar SVG inline si el resto de la app usa SVGs, o simplemente el carácter `🔍` no — usar SVG). Aplicar clase CSS `active` o `text-ink-accent` cuando `searchActive()` sea true.
- TailwindCSS para los estilos.

**Contexto**: El formato `'N,Nk'` usa coma como separador decimal (español). Calcular: `(count / 1000).toFixed(1).replace('.', ',') + 'k'`. El botón lupa debe ser un `<button>` con `(click)="searchToggled.emit()"`, no una arrow function.

**Riesgo**: No usar arrow functions en el template. Emitir desde un método del componente o directamente con `searchToggled.emit()` en el handler.

**Criterio de done**: Compila. El computed devuelve el label correcto para los tres rangos.

---

### Tarea 7 — Crear BinderSearchComponent

**Fichero(s)**: `src/app/features/editor/binder/binder-search.component.ts` (crear)

**Qué hacer**:
- Componente standalone con selector `app-binder-search`. Importar `FormsModule`.
- Inyecta `SearchService`.
- Outputs: `documentSelected = output<string>()`, `closed = output<void>()`.
- Signals: `query = signal('')`, `wholeWord = signal(true)`, `results = signal<SearchResult[]>([])`, `searching = signal(false)`.
- Computed: `totalMatches = computed(() => results().reduce((acc, r) => acc + r.matches.length, 0))`.
- Método `onQueryChange(value: string): void` — actualiza el signal `query` y lanza el debounce (usar `clearTimeout` + `setTimeout` con 400ms almacenando el handle en un campo privado `private debounceTimer: ReturnType<typeof setTimeout> | null = null`). Al dispararse, llama a `runSearch()`.
- Método privado `async runSearch(): Promise<void>` — si `query()` está vacío, limpiar resultados. Si no, `searching.set(true)`, llamar a `searchService.search(query(), wholeWord())`, guardar resultados, `searching.set(false)`.
- Método `highlight(context: string): string` — escapa el HTML del contexto y envuelve el término en `<mark>`. Retorna HTML string. Usar `[innerHTML]` en el template para el snippet.
- Método `onWholeWordToggle(): void` — actualiza `wholeWord` y relanza `runSearch()` si `query()` no está vacío.
- Template inline: campo de búsqueda con `(input)="onQueryChange($event.target.value)"` (no usar `[(ngModel)]` con debounce, o si se usa `ngModel`, manejar con `(ngModelChange)`), checkbox para "Palabra completa", lista de resultados agrupados por documento, botón cerrar que emite `closed`. Los títulos de documento son clicables y emiten `documentSelected`.

**Contexto**: El template debe usar `[innerHTML]="highlight(match.context)"` para los snippets con mark. Angular no permite arrow functions en templates. `SearchResult` y `SearchMatch` están exportados desde `search.service.ts`.

**Riesgo**: `[innerHTML]` con contenido generado requiere que el método `highlight()` sea seguro (solo inserta `<mark>` sin atributos peligrosos). El contenido del documento es texto plano extraído con `tiptapToText`, por lo que no hay XSS.

**Criterio de done**: Compila. Los resultados se muestran agrupados. El debounce funciona. El checkbox "Palabra completa" está activo por defecto.

---

### Tarea 8 — Modificar BinderComponent

**Fichero(s)**: `src/app/features/editor/binder/binder.component.ts` (modificar)

**Qué hacer**:
1. Añadir imports de `BinderFooterComponent` y `BinderSearchComponent` al array `imports`.
2. Añadir signal `showSearch = signal(false)`.
3. Añadir output `synopsisRequested = output<TreeNode>()`.
4. Añadir método `onSearchToggled(): void` — hace `showSearch.update(v => !v)`.
5. Añadir método `onSearchDocumentSelected(id: string): void` — cierra búsqueda (`showSearch.set(false)`), busca el nodo con `findNode(this.projectService.project()!.tree, id)`, si existe emite `documentOpened`.
6. Añadir método `onSynopsisRequested(node: TreeNode): void` — emite `synopsisRequested`.
7. En el template HTML (`binder.component.html`): añadir `@if (showSearch()) { <app-binder-search ... /> } @else { <árbol existente> }` y al final (siempre visible) `<app-binder-footer [searchActive]="showSearch()" (searchToggled)="onSearchToggled()" />`. También conectar el output `synopsisRequested` de `BinderNodeComponent` cuando se añada en la Tarea 9.

**Contexto**: `findNode` ya está importado desde `project.service.ts`. El template actual usa `<app-binder-node>` en un bucle. La estructura debe preservar los nodos existentes (árbol, context menu) cuando `showSearch()` es false.

**Riesgo**: El template HTML (`binder.component.html`) debe modificarse además del `.ts`. El Implementer debe localizar el fichero HTML y editarlo para añadir el `@if`/`@else` y el footer. No olvidar el fichero `.html`.

**Criterio de done**: Compila. El panel de búsqueda alterna con el árbol. El footer siempre visible muestra el recuento de palabras.

---

### Tarea 9 — Añadir synopsisRequested a BinderNodeComponent

**Fichero(s)**: `src/app/features/editor/binder/binder-node.component.ts` (modificar) y `binder-node.component.html` (modificar)

**Qué hacer**:
- Añadir `synopsisRequested = output<TreeNode>()` al componente.
- Añadir método `onSynopsisRequested(event: MouseEvent): void` — llama a `event.stopPropagation()` y emite `synopsisRequested.emit(this.node())`.
- En el template HTML: añadir un botón lápiz (SVG inline o icono unicode equivalente sin emoji — usar SVG) visible solo en hover y solo para nodos de tipo `document`. Bind: `(click)="onSynopsisRequested($event)"`. CSS: `opacity-0 group-hover:opacity-100` (requiere añadir `group` al contenedor padre si no está).

**Contexto**: El template actual tiene los controles de drag, rename y click. El botón lápiz debe estar dentro de la fila del nodo, alineado a la derecha, solo visible cuando `node().type === 'document'`.

**Riesgo**: Si el contenedor padre no tiene la clase `group` de Tailwind, el hover no funcionará. Verificar el HTML actual de `binder-node.component.html` antes de implementar.

**Criterio de done**: Compila. El botón lápiz aparece en hover solo para documentos. El output propaga correctamente.

---

### Tarea 10 — Crear AuthorProfileModalComponent

**Fichero(s)**: `src/app/shared/components/author-profile-modal.component.ts` (crear)

**Qué hacer**:
- Componente standalone, selector `app-author-profile-modal`. Importar `FormsModule`, `InkModalComponent`, `InkButtonComponent`.
- Inyecta `ProjectService`.
- Output: `closed = output<void>()`.
- Campos del formulario como señales o propiedades locales (dado que es un formulario simple, usar propiedades simples con `ngModel`): `legalName`, `penName`, `email`, `phone`, `address`, `agentName`, `agentContact`, `genre`, `language`, `copyrightYear`, `publisher`.
- En `ngOnInit()`: pre-rellenar desde `projectService.project()?.authorProfile`.
- Computed o método `canSave(): boolean` — `legalName.trim() && email.trim() && genre.trim()`.
- Método `save(): void` — llama a `projectService.updateAuthorProfile({ legalName, penName: penName || undefined, email, phone: phone || undefined, address: address || undefined, agentName: agentName || undefined, agentContact: agentContact || undefined, genre, language, copyrightYear, publisher: publisher || undefined })` y luego `closed.emit()`.
- Template inline: modal con `InkModalComponent`, grid de campos, select para `language` con opciones BCP47 comunes (`es`, `en`, `fr`, `de`, `it`, `pt`), campo `copyrightYear` tipo number. Botón "Guardar" deshabilitado si `!canSave()`.
- Inicializar `language` en `'es'` y `copyrightYear` en `new Date().getFullYear()` como defaults.

**Contexto**: `AuthorProfile` está en `project.model.ts`. El método `updateAuthorProfile` se añadió en la Tarea 3. `InkModalComponent` acepta `title` como input y emite `closed`.

**Criterio de done**: Compila. El modal pre-rellena desde el perfil existente. Los campos obligatorios bloquean el guardado.

---

### Tarea 11 — Integrar AuthorProfileModal en InkNavComponent

**Fichero(s)**: `src/app/shared/components/ink-nav.component.ts` (modificar) y `ink-nav.component.html` (modificar)

**Qué hacer**:
- Añadir import de `AuthorProfileModalComponent` al array `imports`.
- Añadir signal `showAuthorProfile = signal(false)`.
- En el template HTML: añadir un botón de autor (icono de persona/pluma) solo visible cuando `projectService.isLoaded()`. El botón llama a `showAuthorProfile.set(true)`. Al final del template, añadir `@if (showAuthorProfile()) { <app-author-profile-modal (closed)="showAuthorProfile.set(false)" /> }`.

**Contexto**: `InkNavComponent` ya tiene `showSettings = signal(false)` con el mismo patrón para el modal de ajustes. Replicar ese patrón.

**Riesgo**: No usar arrow functions en el template. Usar `showAuthorProfile.set(false)` directamente en el binding `(closed)` si Angular lo permite, o añadir método `closeAuthorProfile(): void { this.showAuthorProfile.set(false); }`.

**Criterio de done**: Compila. El botón de autor solo aparece cuando hay proyecto abierto. El modal se abre y cierra correctamente.

---

### Tarea 12 — Pre-rellenar StepMetadataComponent desde AuthorProfile

**Fichero(s)**: `src/app/features/export/export-modal.component.ts` (modificar)

**Qué hacer**:
- En `ngOnInit()` de `ExportModalComponent`, después de `await this.loadFlatDocuments()`, leer `this.projectService.project()?.authorProfile`.
- Si existe, construir un `ExportMetadata` parcial con los campos del perfil (los campos que coincidan: `legalName`, `penName`, `email`, `phone`, `address`, `agentName`, `agentContact`, `genre`, `language`, `copyrightYear`, `publisher`) y mezclarlos sobre `DEFAULT_EXPORT_METADATA` solo si los campos del metadata están vacíos (no sobreescribir si el usuario ya rellenó algo).
- El campo `language` de `AuthorProfile` mapea a `ExportMetadata.language`. El campo `publisher` a `ExportMetadata.publisher`.

**Contexto**: `ExportModalComponent` ya inyecta `ProjectService`. `DEFAULT_EXPORT_METADATA` tiene `legalName: ''`, `email: ''`, `genre: ''` — todos vacíos, así que en `ngOnInit` siempre se pre-rellenan. La lógica es: inicializar `metadata` con `{ ...DEFAULT_EXPORT_METADATA, ...perfilComoExportMetadata }` en lugar de solo `DEFAULT_EXPORT_METADATA`.

**Riesgo**: `AuthorProfile` tiene `agentContact` pero `ExportMetadata` también tiene `agentContact`. Mapear 1-a-1. `AuthorProfile` no tiene `isbn`, `synopsis` ni `pageSize`, que quedan con sus defaults.

**Criterio de done**: Compila. Al abrir el modal de exportación con un perfil de autor guardado, los campos del paso 3 aparecen pre-rellenados.

---

### Tarea 13 — Crear SynopsisModalComponent

**Fichero(s)**: `src/app/features/editor/synopsis/synopsis-modal.component.ts` (crear)

**Qué hacer**:
- Crear directorio `src/app/features/editor/synopsis/` si no existe.
- Componente standalone, selector `app-synopsis-modal`. Importar `FormsModule`, `InkModalComponent`, `InkButtonComponent`.
- Inyecta `DocumentService` y `AiService`.
- Input: `document = input.required<DocumentFile>()`.
- Outputs: `saved = output<DocumentFile>()`, `closed = output<void>()`.
- Signal local `synopsisText = signal('')` — inicializado en `ngOnInit()` con `document().synopsis ?? ''`.
- Signal `streaming = signal(false)`.
- Computed `charCount = computed(() => synopsisText().length)`.
- Computed `canGenerateAi = computed(() => aiService.hasApiKey() && tiptapToText(document().content).length > 50)`.
- Método `onTextChange(value: string): void` — actualiza `synopsisText` con `Math.min(value, 500)` en longitud (o usar `maxlength` en el textarea y no truncar aquí, solo actualizar el signal).
- Método `async generateWithAi(): Promise<void>` — llama a `ai.streamMessage()` con un prompt apropiado (p.ej. modo `'brainstorm'`, mensaje `'Genera una sinopsis de 2-3 párrafos para este documento.'`, contexto con el texto del documento). `streaming.set(true)`, acumula los chunks en `synopsisText`, `streaming.set(false)`. Limitar a 500 chars.
- Método `save(): void` — llama a `docService.saveDocument({ ...document(), synopsis: synopsisText().trim() || undefined })`, espera el resultado y emite `saved` con el documento actualizado. Manejar como async.
- Template inline: modal con título "Sinopsis", textarea con `maxlength="500"`, contador `{{ charCount() }}/500`, botón "Generar con IA" visible solo si `canGenerateAi()`, deshabilitado si `streaming()`. Botones: "Cancelar" emite `closed`, "Guardar" llama a `save()`.

**Contexto**: `AiService.streamMessage` acepta `(messages: AiMessage[], mode: AiMode, context: string)`. Para la generación de sinopsis: `messages = [{ role: 'user', content: 'Genera una sinopsis...' }]`, `mode = 'brainstorm'`, `context = tiptapToText(document().content)`. `tiptapToText` está en `src/app/shared/utils/tiptap-to-text.ts`.

**Riesgo**: `AiService.hasApiKey` es un método (no un signal), retorna `boolean`. Se llama como `aiService.hasApiKey()` en el computed. En el template, usar `canGenerateAi()` (el computed), no arrow functions.

**Criterio de done**: Compila. El modal muestra la sinopsis existente si la hay. El contador 0/500 funciona. El botón IA solo aparece si hay API key y contenido suficiente.

---

### Tarea 14 — Integrar SynopsisModal en EditorLayoutComponent

**Fichero(s)**: `src/app/features/editor/editor-layout.component.ts` (modificar) y `editor-layout.component.html` (modificar)

**Qué hacer**:
1. Añadir import de `SynopsisModalComponent` al array `imports`.
2. Añadir `@ViewChild(BinderComponent) binder?: BinderComponent` (ya hay `@ViewChild(TiptapEditorComponent)`, añadir otro).
3. Añadir signal `synopsisDocument = signal<DocumentFile | null>(null)`.
4. Añadir método `async onSynopsisRequested(node: TreeNode): Promise<void>` — carga el documento con `docService.loadDocument(node.id)` y actualiza `synopsisDocument.set(doc)`.
5. Añadir método `onSynopsisSaved(doc: DocumentFile): void` — si `activeDocument()?.id === doc.id`, actualiza `activeDocument.set(doc)`. Siempre: `synopsisDocument.set(null)`.
6. En `@HostListener onKeyDown`: añadir el bloque para `Ctrl+F` (sin `shiftKey`): `if (event.ctrlKey && !event.shiftKey && event.key === 'f') { event.preventDefault(); this.binder?.showSearch.update(v => !v); }`. Asegurarse de que el bloque `Ctrl+Shift+F` existente usa `event.shiftKey && event.key === 'F'` (con mayúscula) para no colisionar.
7. En el template HTML: conectar `(synopsisRequested)="onSynopsisRequested($event)"` en `<app-binder>`. Añadir `@if (synopsisDocument()) { <app-synopsis-modal [document]="synopsisDocument()!" (saved)="onSynopsisSaved($event)" (closed)="synopsisDocument.set(null)" /> }`.

**Contexto**: El `@HostListener` actual maneja `Ctrl+Shift+F` con `event.shiftKey && event.key === 'F'`. El nuevo `Ctrl+F` debe comprobar `!event.shiftKey && event.key === 'f'` (minúscula) para no interferir. `binder` es `BinderComponent | undefined` hasta que la vista inicializa, por lo que se usa `?.`.

**Riesgo**: El `@ViewChild(BinderComponent)` requiere que `BinderComponent` esté en el template. Ya lo está. El acceso a `binder?.showSearch` desde el `@HostListener` es seguro porque el listener solo se activa mientras la vista existe.

**Criterio de done**: Compila. `Ctrl+F` abre/cierra la búsqueda. El modal de sinopsis se abre al clicar el botón lápiz. Al guardar la sinopsis, si el documento está abierto en el editor, se actualiza.

---

### Tarea 15 — Exportar nuevos símbolos desde barrels (index.ts)

**Fichero(s)**: `src/app/core/models/index.ts` (modificar) y `src/app/core/services/index.ts` (modificar)

**Qué hacer**:
- En `src/app/core/models/index.ts`: añadir re-export de `AuthorProfile` desde `project.model.ts` si el barrel existe y re-exporta los modelos.
- En `src/app/core/services/index.ts`: añadir re-export de `SearchService`, `SearchResult`, `SearchMatch` si el barrel re-exporta servicios.

**Contexto**: Verificar el contenido actual de ambos `index.ts` para determinar si re-exportan todo con `export * from` o solo exports selectivos. Actualizar en consecuencia.

**Criterio de done**: Compila sin errores de importación en los componentes que usen los nuevos símbolos.

---

## Orden de implementación

1. **Tarea 1** — `project.model.ts`: base de datos de tipos. Sin dependencias.
2. **Tarea 2** — `document.model.ts`: independiente.
3. **Tarea 15** — barrels `index.ts`: actualizar exports para que las tareas siguientes puedan importar sin rutas largas.
4. **Tarea 3** — `ProjectService`: depende de Tarea 1 (necesita `AuthorProfile` y `wordCountCache` en el modelo).
5. **Tarea 4** — `SearchService`: depende de Tarea 1 y Tarea 3 (usa `ProjectService`, `findNode`, `documentsFolderPath`).
6. **Tarea 5** — `DocumentService`: depende de Tareas 1, 3 y 4 (inyecta `SearchService` y llama a `updateWordCountCache`).
7. **Tarea 6** — `BinderFooterComponent`: depende de Tarea 3 (`totalWordCount`). Componente hoja, sin dependencias de componentes nuevos.
8. **Tarea 7** — `BinderSearchComponent`: depende de Tarea 4 (`SearchService`).
9. **Tarea 9** — `BinderNodeComponent`: depende de Tarea 1 (`TreeNode`). Modificación mínima e independiente del footer y el search.
10. **Tarea 8** — `BinderComponent`: depende de Tareas 6, 7 y 9 (importa los tres componentes nuevos/modificados).
11. **Tarea 10** — `AuthorProfileModalComponent`: depende de Tareas 1 y 3.
12. **Tarea 11** — `InkNavComponent`: depende de Tarea 10.
13. **Tarea 12** — `ExportModalComponent`: depende de Tareas 1 y 3.
14. **Tarea 13** — `SynopsisModalComponent`: depende de Tareas 2, 5 y el `AiService` existente.
15. **Tarea 14** — `EditorLayoutComponent`: depende de Tareas 8 y 13. Última tarea porque integra todo.

---

## Puntos de atención para el Implementer

### Convenciones obligatorias del proyecto
- Zoneless: no usar `NgZone`. Los signals son la única forma de state reactivo.
- Sin arrow functions en templates Angular (el compilador las rechaza). Usar métodos del componente.
- `canSave()`, `canGenerateAi()`, `wordCountLabel()` deben ser métodos o computeds, nunca getters con lógica en el template.
- Todos los componentes son `standalone: true`. Sin NgModules.

### Riesgos específicos de esta spec
- **`saveProjectOnly()` en ProjectService**: debe actualizar el signal además de escribir a disco. Si solo persiste sin actualizar el signal, los computeds (`totalWordCount`) quedan desactualizados hasta la siguiente acción.
- **`DocumentService.saveDocument()` fire-and-forget**: las llamadas a `updateWordCountCache` y `invalidate` deben lanzarse sin `await` en el flujo principal (o con `await` pero sin bloquear el retorno al caller). Usar `.catch(() => {})` para que errores en el caché no rompan el guardado.
- **Extracción de documentId en SearchService**: `listJsonFiles` devuelve paths completos. El ID es el basename sin `.json`. Usar `filePath.split('/').pop()!.replace('.json', '')`.
- **Ctrl+F vs Ctrl+Shift+F**: el bloque existente detecta `event.shiftKey && event.key === 'F'` (mayúscula). El nuevo `Ctrl+F` debe ser `!event.shiftKey && event.key === 'f'` (minúscula). Ambos usan `event.ctrlKey`. No interfieren.
- **`binder?.showSearch`**: el `@ViewChild` puede ser `undefined` si el binder está oculto. El operador `?.` es suficiente; no lanzar excepciones.
- **`[innerHTML]` en BinderSearchComponent**: el contenido es texto plano de TipTap + `<mark>` de cosecha propia. No hay riesgo de XSS, pero no inyectar HTML externo no escapado. El método `highlight()` debe escapar el contexto antes de insertar `<mark>`.
- **`AuthorProfile` vs `ExportMetadata`**: los campos son casi idénticos pero los tipos difieren en `pageSize`, `isbn`, `synopsis` (solo en `ExportMetadata`). Al mapear en `ExportModalComponent`, no incluir esos tres campos del default.
- **Directorio `synopsis/`**: crearlo antes de escribir `synopsis-modal.component.ts`. El Implementer debe hacer `mkdir -p` o verificar que existe.
- **`AiService.hasApiKey`**: es un método normal `() => boolean`, no un signal ni computed. En el template, siempre llamarlo como `aiService.hasApiKey()` o a través del computed `canGenerateAi()`.
