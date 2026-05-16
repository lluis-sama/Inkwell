# Plan de implementación — INK-15

## Resumen

Se crea una tercera vista `/narrative` que recorre el árbol del proyecto en orden de binder y muestra cada documento como una tarjeta con sinopsis, word count y personajes vinculados (extraídos de los tableros). La vista permite editar la sinopsis inline y navega al editor al hacer clic en la tarjeta. Se conecta al sistema de navegación existente mediante un nuevo enlace en la barra lateral, un atajo de teclado Alt+3 y soporte de query param `?doc=` en el editor para el retorno desde la vista narrativa.

---

## Tareas

### Tarea 1: Crear `NarrativeService`

- **Fichero**: `src/app/core/services/narrative.service.ts` (crear)
- **Qué hace**: Servicio `@Injectable({ providedIn: 'root' })` que recopila la información necesaria para la vista narrativa en una sola llamada asíncrona.
  - Importa `TauriBridgeService`, `ProjectService`, `BoardService` y los modelos `TreeNode`, `DocumentFile`, `BoardFile`, `Card`.
  - Importa `boardPath` y `documentPath` desde `project-paths.ts`.
  - Define la interfaz pública `NarrativeCard`:
    ```
    export interface NarrativeCard {
      id: string;
      title: string;
      synopsis: string;
      wordCount: number;
      characters: string[];   // nombres de personajes (Card.title donde Card.type === 'character' y appearsInChapters incluye el docId)
      isSection: boolean;     // true si el nodo es de tipo 'folder'
    }
    ```
  - Expone el método `async buildNarrativeCards(): Promise<NarrativeCard[]>`:
    1. Verifica que `projectService.isLoaded()` y `projectService.basePath()` no sean nulos; si no, devuelve `[]`.
    2. Carga todos los tableros: llama a `boardService.listBoardIds()` para obtener los IDs, luego para cada ID llama a `this.bridge.readJsonFile(boardPath(basePath, id))` y parsea como `BoardFile`. Acumula todas las tarjetas de tipo `'character'` en un array `characterCards: Card[]`.
    3. Recorre el árbol del proyecto (`projectService.project()!.tree`) en orden depth-first con una función auxiliar interna `flattenTree(nodes: TreeNode[]): TreeNode[]` que produce la lista plana respetando el orden del binder.
    4. Para cada nodo de la lista plana:
       - Si `type === 'folder'`: produce un `NarrativeCard` con `isSection: true`, `synopsis: ''`, `wordCount: 0`, `characters: []`.
       - Si `type === 'document'`: lee el documento con `this.bridge.readJsonFile(documentPath(basePath, node.id))`, parsea como `DocumentFile`. Extrae `synopsis` (o `''`), `wordCount` desde `projectService.project()!.wordCountCache[node.id] ?? 0`, y `characters` filtrando las `characterCards` donde `card.characterData?.appearsInChapters?.includes(node.id)` sea `true` y mapeando a `card.title`.
    5. Devuelve el array completo de `NarrativeCard[]` en el orden del binder.
  - Maneja errores de lectura de fichero individuales silenciosamente (try/catch por documento; si falla, usa synopsis vacía y wordCount del caché).
- **Depende de**: ninguna dependencia previa (usa servicios existentes).
- **Riesgo**: Los tableros se cargan con `boardService.listBoardIds()` que internamente usa `bridge.listJsonFiles(boardsFolderPath(...))`. Si no hay tableros, devuelve array vacío sin lanzar error — esto es el comportamiento correcto. No usar `boardService.loadBoard()` directamente en el servicio narrativo porque ese método impone `requireBasePath()` en cada llamada; es más eficiente leer con `bridge.readJsonFile` directamente (misma llamada, sin overhead de validación repetida).

---

### Tarea 2: Crear `NarrativeCardComponent`

- **Ficheros**:
  - `src/app/features/narrative/narrative-card.component.ts` (crear)
  - `src/app/features/narrative/narrative-card.component.html` (crear)
- **Qué hace**: Componente standalone que muestra una tarjeta narrativa individual.
  - El `.ts` declara:
    - `selector: 'app-narrative-card'`
    - `standalone: true`
    - `templateUrl: './narrative-card.component.html'` — sin template inline bajo ningún concepto.
    - Imports: `FormsModule` (para edición inline de sinopsis).
    - Inputs: `card = input.required<NarrativeCard>()`.
    - Output: `synopsisChanged = output<string>()` — emitido al terminar de editar (blur del textarea).
    - Output: `openInEditor = output<void>()` — emitido al hacer clic en el título o en el botón "Abrir en editor".
    - Signal local: `editingSynopsis = signal(false)` para activar el modo edición.
    - Signal local: `draftSynopsis = signal('')` — copia editable inicializada al entrar en modo edición.
    - Método `startEditing()`: establece `draftSynopsis` al valor actual de `card().synopsis` y activa `editingSynopsis`.
    - Método `commitEdit()`: emite `synopsisChanged` con `draftSynopsis()` y desactiva `editingSynopsis`.
    - Método `formatWords(n: number): string`: devuelve `'Sin palabras'` si `n === 0`, `'1 palabra'` si `n === 1`, `'N palabras'` en plural.
  - El `.html` (template externo) renderiza:
    - Un `div` contenedor con clases Tailwind apropiadas para tarjeta.
    - Cabecera con el título del documento (`card().title`) como botón/enlace que emite `openInEditor`.
    - Línea de metadatos: word count (`formatWords(card().wordCount)`) y, si `card().characters.length > 0`, la lista de personajes separados por comas o como chips.
    - Sección de sinopsis: si `editingSynopsis()` es false, muestra el texto de sinopsis (o un placeholder "Sin sinopsis") con un botón de lápiz que llama a `startEditing()`; si es true, muestra un `<textarea>` con `[(ngModel)]="draftSynopsis"` y un botón "Guardar" que llama a `commitEdit()` y un botón "Cancelar" que desactiva `editingSynopsis` sin emitir.
- **Depende de**: Tarea 1 (necesita la interfaz `NarrativeCard`).
- **Riesgo**: `[(ngModel)]` requiere que `FormsModule` esté en `imports`. Sin él, Angular lanza un error de binding en runtime. El textarea debe tener un `(blur)` o botón explícito de confirmación — no auto-confirmar en cada keystroke para evitar emitir demasiados eventos al padre.

---

### Tarea 3: Crear `NarrativeLayoutComponent`

- **Ficheros**:
  - `src/app/features/narrative/narrative-layout.component.ts` (crear)
  - `src/app/features/narrative/narrative-layout.component.html` (crear)
- **Qué hace**: Componente de página para la ruta `/narrative`.
  - El `.ts` declara:
    - `selector: 'app-narrative-layout'`
    - `standalone: true`
    - `templateUrl: './narrative-layout.component.html'` — sin template inline.
    - Imports: `InkNavComponent`, `NarrativeCardComponent`.
    - Inyecta: `NarrativeService`, `ProjectService`, `DocumentService`, `Router`.
    - Implementa `OnInit`.
    - Signal: `cards = signal<NarrativeCard[]>([])`.
    - Signal: `loading = signal(true)`.
    - Signal: `error = signal<string | null>(null)`.
    - `ngOnInit()`:
      1. Si `!projectService.isLoaded()`, navega a `'/'` y retorna.
      2. Llama a `narrativeService.buildNarrativeCards()` en un bloque try/catch, asigna el resultado a `cards`, establece `loading(false)`.
      3. Si hay error, establece `error('No se pudo cargar la vista narrativa.')` y `loading(false)`.
    - Método `async onSynopsisChanged(card: NarrativeCard, synopsis: string)`:
      1. Carga el documento con `documentService.loadDocument(card.id)`.
      2. Guarda el documento con `documentService.saveDocument({ ...doc, synopsis: synopsis.trim() || undefined })`.
      3. Actualiza el signal `cards` con el nuevo valor de sinopsis para la tarjeta afectada: `cards.update(list => list.map(c => c.id === card.id ? { ...c, synopsis } : c))`.
    - Método `onOpenInEditor(card: NarrativeCard)`: navega a `['/editor']` con queryParams `{ doc: card.id }`.
  - El `.html` (template externo) renderiza:
    - Layout de dos columnas: `<ink-nav>` a la izquierda y área de contenido a la derecha.
    - Estado de carga: `@if (loading())` muestra un spinner o mensaje "Cargando...".
    - Estado de error: `@if (error())` muestra el mensaje de error.
    - Lista de tarjetas: `@if (!loading() && !error())` con un único `@for (card of cards(); track card.id)`:
      - `@if (card.isSection)`: renderiza una cabecera de sección (`<h2>` o `<div>` con el título de la carpeta, estilo diferenciado).
      - `@if (!card.isSection)`: renderiza `<app-narrative-card [card]="card" (synopsisChanged)="onSynopsisChanged(card, $event)" (openInEditor)="onOpenInEditor(card)" />`.
    - Si `cards()` está vacío y no hay carga ni error: mensaje "No hay documentos en este proyecto."
- **Depende de**: Tareas 1 y 2.
- **Riesgo**: El recorrido del árbol en `NarrativeService` puede producir nodos de tipo `folder` en la lista. El template debe discriminar `card.isSection` para no intentar renderizar una `NarrativeCard` de sección con el componente de tarjeta (que espera sinopsis y word count). No mezclar el `@for` de secciones con el de tarjetas dentro del mismo nivel de control de flujo — un único `@for` con `@if/else` interno es la aproximación correcta y la indicada en la spec.

---

### Tarea 4: Registrar la ruta `/narrative`

- **Fichero**: `src/app/app.routes.ts` (modificar)
- **Qué hace**: Añadir una ruta lazy-loaded para `/narrative` que carga `NarrativeLayoutComponent`.
  - La ruta se añade después de la ruta `/boards`, siguiendo el mismo patrón de `loadComponent` con importación dinámica.
  - Path: `'narrative'`
  - Import: `./features/narrative/narrative-layout.component` → `NarrativeLayoutComponent`.
- **Depende de**: Tarea 3.
- **Riesgo**: ninguno relevante; es un cambio aditivo y mínimo.

---

### Tarea 5: Añadir atajo de teclado Alt+3 en `AppComponent`

- **Fichero**: `src/app/app.component.ts` (modificar)
- **Qué hace**: Extender el handler `@HostListener('document:keydown')` con un nuevo bloque `else if` para `event.altKey && event.key === '3'` que llama a `this.router.navigate(['/narrative'])`.
  - El bloque se inserta después del bloque existente de Alt+2 (`/boards`) y antes del bloque de `'?'` (shortcuts modal).
  - Se añade `event.preventDefault()` igual que en los atajos Alt+1 y Alt+2 existentes.
- **Depende de**: Tarea 4 (la ruta debe existir para que la navegación funcione).
- **Riesgo**: ninguno; es un cambio aditivo de tres líneas en un bloque `else if`.

---

### Tarea 6: Añadir icono de navegación en `InkNavComponent`

- **Fichero**: `src/app/shared/components/ink-nav.component.html` (modificar)
- **Qué hace**: Añadir un tercer enlace de navegación al archivo HTML del componente, después del enlace de `/boards` y antes del botón de "Author profile".
  - El enlace sigue exactamente el mismo patrón que los de `/editor` y `/boards`:
    - `routerLink="/narrative"`
    - `[class.active]="isRoute('/narrative')"`
    - Un título en español (p. ej. `title="Vista narrativa"` — sin llave de i18n si no existe la clave Transloco todavía; o se crea la clave si el patrón del proyecto lo exige).
    - Un SVG representativo de "lista de libros" o "scroll" de 18×18 px, con `stroke="currentColor"` y `stroke-width="2"`, coherente con el estilo de los iconos existentes.
  - SVG sugerido (scroll/lista narrativa): `viewBox="0 0 24 24"` con líneas horizontales representando párrafos (estilo "align-left" de Feather icons):
    - `<line x1="17" y1="10" x2="3" y2="10"/>`, `<line x1="21" y1="6" x2="3" y2="6"/>`, `<line x1="21" y1="14" x2="3" y2="14"/>`, `<line x1="17" y1="18" x2="3" y2="18"/>`.
- **Depende de**: Tarea 4.
- **Riesgo**: Verificar que `isRoute('/narrative')` no colisione con ninguna ruta existente que comience con `/narrative`. No hay ninguna, por lo que el `startsWith` es seguro. Si el proyecto usa claves Transloco para los titles de los iconos (`'BOARDS.NAV.BOARDS_TITLE' | transloco`), añadir la clave `'BOARDS.NAV.NARRATIVE_TITLE'` en los ficheros de traducción; de lo contrario, usar un `title` literal en español es aceptable.

---

### Tarea 7: Soporte de query param `?doc=` en `EditorLayoutComponent`

- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**: Leer el query param `doc` al inicializar la vista y abrir automáticamente el documento indicado.
  - Importar `ActivatedRoute` desde `@angular/router` y añadirlo a los servicios inyectados.
  - En `ngOnInit()`, después de las comprobaciones existentes (`!isLoaded()` → navegar) y antes de `startAutosave()`:
    1. Leer `const docId = inject(ActivatedRoute).snapshot.queryParams['doc'] as string | undefined`.
       - Nota: la inyección de `ActivatedRoute` debe hacerse en el cuerpo de la clase (campo privado), no dentro de `ngOnInit`. Añadir `private route = inject(ActivatedRoute)` como campo de clase.
    2. Si `docId` tiene valor, buscar el nodo en el árbol del proyecto con `findNode(this.projectService.project()!.tree, docId)`.
       - `findNode` ya existe y está exportada desde `project.service.ts`; importarla.
    3. Si el nodo se encuentra y su `type === 'document'`, llamar a `this.openDocument(node)`.
  - No romper el flujo existente: si `docId` es undefined o el nodo no se encuentra, continuar sin abrir ningún documento (comportamiento actual).
- **Depende de**: ninguna dependencia sobre las tareas anteriores (es una modificación independiente en el editor).
- **Riesgo**: `openDocument` es `async`; en `ngOnInit` hay que llamarla con `void this.openDocument(node)` o con `.catch(console.error)` para no ignorar el error silenciosamente. No usar `await` directamente en `ngOnInit` sin convertirlo en `async ngOnInit()` — o bien declarar `ngOnInit` como `async` (que es compatible con Angular) y usar `await`. Verificar que `findNode` esté importada correctamente desde `../../core/services/project.service`.

---

## Orden de ejecución

1. Tarea 1 — `NarrativeService` (servicio de datos; todo lo demás depende de la interfaz `NarrativeCard`)
2. Tarea 2 — `NarrativeCardComponent` (componente de presentación; usa `NarrativeCard`)
3. Tarea 3 — `NarrativeLayoutComponent` (página que orquesta servicio y componente de tarjeta)
4. Tarea 4 — Ruta `/narrative` en `app.routes.ts` (registrar la página)
5. Tarea 5 — Atajo Alt+3 en `AppComponent` (requiere la ruta del paso anterior)
6. Tarea 6 — Icono en `InkNavComponent` (requiere la ruta del paso 4)
7. Tarea 7 — Query param `?doc=` en `EditorLayoutComponent` (independiente; puede implementarse en cualquier momento tras la Tarea 1, pero se deja al final para no interrumpir el flujo principal)

---

## Puntos de atención para el Implementer

### Restricción absoluta: sin templates inline

Todos los componentes nuevos (`NarrativeCardComponent`, `NarrativeLayoutComponent`) deben usar `templateUrl` apuntando a un fichero `.html` externo. Cero bloques `template: \`...\`` en el `.ts`. Si los estilos propios superan 2 líneas, también a fichero `.scss` externo. Esta restricción proviene de la spec y no tiene excepciones.

### `FormsModule` en `NarrativeCardComponent`

El `[(ngModel)]` del textarea de edición de sinopsis requiere `FormsModule` en el array `imports` del componente. Sin él, Angular lanza un error de compilación/runtime indicando que `ngModel` no es una directiva conocida. Verificar que `FormsModule` viene de `@angular/forms`.

### Carga de tableros en `NarrativeService`

Usar `boardService.listBoardIds()` (que internamente ya usa `bridge.listJsonFiles`) para obtener los IDs. Luego leer cada tablero con `this.bridge.readJsonFile(boardPath(basePath, id))` directamente, sin pasar por `boardService.loadBoard()`. El motivo: evitar llamadas redundantes a `requireBasePath()` por cada tablero. Si no hay tableros, `listBoardIds()` devuelve `[]` y el servicio narrativo continúa sin personajes (no error).

### `flattenTree` debe ser depth-first en preorden

El recorrido del árbol en `NarrativeService` debe visitar un nodo antes que sus hijos (preorden): primero la carpeta/sección, luego todos sus hijos recursivamente, luego el siguiente hermano. Esto refleja el orden visual del binder tal como lo ve el usuario.

### `NarrativeCard` con `isSection: true` no es editable

El `NarrativeLayoutComponent` debe renderizar las tarjetas de tipo sección (`isSection: true`) como cabeceras no interactivas, sin pasar por `<app-narrative-card>`. El componente `NarrativeCardComponent` solo recibe tarjetas de documentos reales. No añadir lógica de discriminación dentro del componente de tarjeta; la discriminación ocurre en el template del layout.

### `onSynopsisChanged` — actualización optimista del signal

Tras guardar la sinopsis, actualizar el signal `cards` en memoria para que la UI refleje el cambio sin recargar toda la vista desde disco. Usar `cards.update(list => list.map(...))`.

### `findNode` ya está exportada

`findNode` está exportada en `src/app/core/services/project.service.ts` (no es un método de instancia del servicio, sino una función libre exportada). El Implementer debe importarla como función, no como método del servicio inyectado.

### Atajo Alt+3 — coherencia con el modal de shortcuts

Si el proyecto tiene un modal de shortcuts que lista los atajos disponibles (el `ShortcutsModalComponent`), añadir la entrada de Alt+3 a ese listado para mantener la documentación inline consistente. Verificar el fichero del modal de shortcuts tras implementar las Tareas 4-6.

### Query param en el editor — no bloquear `ngOnInit`

Si `ngOnInit` del editor no es `async`, convertirlo a `async ngOnInit(): Promise<void>` y usar `await this.openDocument(node)`. Angular no tiene problema con `async ngOnInit` en zoneless. Alternativamente, llamar a `this.openDocument(node).catch(console.error)` sin convertir `ngOnInit` a async. La primera opción es más limpia y preferible.
