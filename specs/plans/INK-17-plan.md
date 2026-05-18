# Plan de implementación — INK-17

### Resumen

Esta spec añade tres funcionalidades independientes al editor: (1) un servicio de estadísticas de escritura históricas que persiste en `stats.json` dentro del proyecto, con un modal de visualización que usa SVG puro para la gráfica de barras; (2) una barra de filtro de estado en el binder que oculta nodos sin modificar el árbol subyacente; y (3) un flujo de selección de plantilla en dos pasos en el modal de nuevo proyecto, que precrea carpetas y documentos vacíos tras crear el proyecto. La gráfica se implementa con `<rect>` SVG nativos, sin d3.

---

### Tareas

#### Tarea 1: Modelo de estadísticas
- **Fichero**: `src/app/core/models/stats.model.ts` (crear)
- **Qué hace**: Define las interfaces `WritingStats` y `StatsEntry` tal como describe la spec. Sin lógica adicional.
- **Depende de**: ninguna dependencia previa

#### Tarea 2: Modelos de plantilla
- **Fichero**: `src/app/core/models/project.model.ts` (modificar)
- **Qué hace**: Añadir al final del fichero las interfaces `ProjectTemplate` y `TemplateNode`. No tocar nada existente. Las interfaces importarán `DocumentStatus` que ya existe en el mismo fichero.
- **Depende de**: ninguna dependencia previa

#### Tarea 3: Ruta de stats en project-paths
- **Fichero**: `src/app/shared/utils/project-paths.ts` (modificar)
- **Qué hace**: Añadir la función `statsPath(basePath: string): string` al final del fichero, siguiendo el mismo patrón que las demás funciones del fichero. Sin modificar las existentes.
- **Depende de**: ninguna dependencia previa

#### Tarea 4: StatsService
- **Fichero**: `src/app/core/services/stats.service.ts` (crear)
- **Qué hace**: Implementa el servicio de estadísticas con `providedIn: 'root'`. Inyecta `TauriBridgeService` y `ProjectService`. Expone los métodos: `load()`, `trackSessionStart()`, `updateTodayWords()`, `getLastNDays(n)`, `totalWordsLastNDays(n)`, `currentStreak()` y `resetSession()`. Mantiene un caché en memoria (`cache: WritingStats | null`) para no releer el fichero en cada operación. El método `save()` trunca a los últimos 365 días antes de persistir.
- **Depende de**: Tarea 1, Tarea 3
- **Riesgo**: `projectService.basePath()` es un `signal<string | null>`. Si se llama a cualquier método antes de que el proyecto esté abierto, retornar temprano. El caché debe resetearse en `resetSession()` para que el siguiente proyecto empiece limpio.

#### Tarea 5: Integración de StatsService en EditorLayoutComponent
- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**: Tres cambios puntuales:
  1. Añadir `private statsService = inject(StatsService)` junto a las demás inyecciones (líneas 33-38).
  2. Al final de `openDocument()`, tras el bloque `try`, añadir la llamada `await this.statsService.trackSessionStart()`. El lugar exacto es justo antes del `this.isDirty = false` que ya existe.
  3. Al final del bloque `try` de `saveCurrentDocument()`, tras actualizar `sessionWordsAdded`, añadir `await this.statsService.updateTodayWords()`.
  4. En `ngOnDestroy()`, tras `this.stopAutosave()`, añadir `this.statsService.resetSession()`.
  5. Añadir `StatsModalComponent` al array `imports` del decorador.
  6. Añadir signal `showStats = signal(false)` junto a los demás signals.
- **Depende de**: Tarea 4, Tarea 9 (StatsModalComponent)
- **Riesgo**: `trackSessionStart()` es async. Como `openDocument()` ya es async, el `await` es seguro. No introduce bloqueo perceptible porque la operación es una escritura de fichero pequeño. El `saveCurrentDocument()` también es async, sin problema.

#### Tarea 6: StatsModalComponent — fichero TypeScript
- **Fichero**: `src/app/features/editor/stats/stats-modal.component.ts` (crear — directorio nuevo)
- **Qué hace**: Componente standalone con `selector: 'app-stats-modal'`. Inyecta `StatsService`. Expone `closed = output<void>()`. Signals: `entries`, `streak`, `totalWords30`, `avgWords30`. En `ngOnInit()` carga los tres valores con `Promise.all`. Expone también el método `renderChart(entries)` que construye la gráfica SVG pura (ver Tarea 7). Importa `InkModalComponent`.
- **Depende de**: Tarea 4
- **Riesgo**: El componente usa `templateUrl` y `styleUrl` (convención obligatoria del proyecto). No inline templates. El directorio `src/app/features/editor/stats/` debe crearse. La gráfica se renderiza con `setTimeout(..., 50)` tras el `ngOnInit` para asegurar que el SVG ya está en el DOM; usar `@ViewChild` sobre el elemento `<svg>` en lugar de `document.querySelector` que es frágil en zoneless.

#### Tarea 7: StatsModalComponent — template HTML
- **Fichero**: `src/app/features/editor/stats/stats-modal.component.html` (crear)
- **Qué hace**: Template del modal de estadísticas. Usa `<ink-modal>` con `[hasActions]="false"` y `(closed)="closed.emit()"`. Contiene: (a) grid de 3 tarjetas (racha, total palabras 30 días, media diaria) usando tokens `--ink-*`; (b) un `<svg #chartSvg width="100%" height="120">` referenciado por `@ViewChild('chartSvg')` en el componente TypeScript. Los textos de las tarjetas son hardcoded en español (no hay keys i18n para estos según la spec, son literales simples). El `| number` pipe se importa via `CommonModule` o directamente; verificar si ya está disponible en el proyecto — si no, importar `DecimalPipe` de `@angular/common` en el componente.
- **Depende de**: Tarea 6

#### Tarea 8: StatsModalComponent — estilos CSS
- **Fichero**: `src/app/features/editor/stats/stats-modal.component.css` (crear)
- **Qué hace**: Fichero de estilos vacío o con estilos mínimos específicos del componente. Necesario por la convención `styleUrl` del proyecto. Los estilos principales van en TailwindCSS en el template.
- **Depende de**: Tarea 6

#### Tarea 9: Implementar renderChart() con SVG puro
- **Fichero**: `src/app/features/editor/stats/stats-modal.component.ts` (completar el método)
- **Qué hace**: El método `renderChart(entries: StatsEntry[])` obtiene el elemento SVG vía `@ViewChild('chartSvg') chartSvg?: ElementRef<SVGSVGElement>`. Calcula manualmente:
  - `maxVal = Math.max(...entries.map(e => e.wordsAdded), 1)`
  - `innerW = svgWidth - marginLeft - marginRight` y `innerH = svgHeight - marginTop - marginBottom`
  - `barWidth = innerW / entries.length * (1 - paddingRatio)` — padding del 15% entre barras
  - `scaleY(v) = innerH - (v / maxVal) * innerH`
  - Para cada entry, un `<rect>` con `x`, `y`, `width`, `height`, `rx="2"`, `fill` según `wordsAdded > 0`
  - Etiquetas del eje X cada 7 posiciones: `<text>` con `dd/MM`
  - Etiquetas del eje Y: 3 marcas calculadas en 0%, 50% y 100% del máximo
  - Todos los elementos se crean con `document.createElementNS('http://www.w3.org/2000/svg', 'rect')` o bien construyendo el innerHTML SVG como string y asignando al elemento. La segunda opción es más legible; la primera es más correcta para zoneless.
  - El SVG debe limpiar su contenido (`innerHTML = ''`) antes de redibujar.
- **Depende de**: Tarea 6, Tarea 7
- **Riesgo**: En zoneless, manipular el DOM directamente desde TypeScript es aceptable en este caso porque ocurre en un callback de setTimeout post-render. Usar `ElementRef` inyectado o `@ViewChild` — no `document.querySelector`. El `@ViewChild` solo estará disponible después de que la vista se inicialice (`AfterViewInit`), pero como la carga es async en `ngOnInit` y el render ocurre 50ms después, en la práctica el `@ViewChild` ya estará disponible. Cambiar `OnInit` a `AfterViewInit` para el renderizado del chart si se detecta que el `@ViewChild` es `undefined` al renderizar.

#### Tarea 10: Botón y modal de stats en InkNavComponent — TypeScript
- **Fichero**: `src/app/shared/components/ink-nav.component.ts` (modificar)
- **Qué hace**: Dos cambios:
  1. Añadir `showStats = signal(false)` junto a `showSettings`, `showAuthorProfile`, `showShortcuts`.
  2. Añadir `StatsModalComponent` al array `imports` del decorador.
- **Depende de**: Tarea 6

#### Tarea 11: Botón y modal de stats en InkNavComponent — HTML
- **Fichero**: `src/app/shared/components/ink-nav.component.html` (modificar)
- **Qué hace**: Insertar el botón de estadísticas y el bloque condicional del modal. El botón va junto al de perfil de autor (línea 70-77), dentro del bloque `@if (projectService.isLoaded())`. Puede ir justo después del botón de autor, antes del `<!-- Spacer -->`. El modal `<app-stats-modal>` se añade al final del fichero, junto a los otros modales condicionales (líneas 113-125).
- **Depende de**: Tarea 10

#### Tarea 12: Filtro de estado en BinderComponent — TypeScript
- **Fichero**: `src/app/features/editor/binder/binder.component.ts` (modificar)
- **Qué hace**: Añadir en la clase:
  ```
  statusFilter = signal<DocumentStatus | 'all'>('all');
  readonly statusEntries = Object.entries(DOCUMENT_STATUS_CONFIG).map(...)
  ```
  `DOCUMENT_STATUS_CONFIG` y `DocumentStatus` ya se importan en este fichero (línea 2). No se necesita nuevo import.
- **Depende de**: ninguna dependencia previa (sobre código existente)

#### Tarea 13: Filtro de estado en BinderComponent — HTML
- **Fichero**: `src/app/features/editor/binder/binder.component.html` (modificar)
- **Qué hace**: Insertar la barra de filtro entre el header del binder (líneas 6-60) y el bloque `<div class="flex-1 overflow-hidden">` (línea 63). La barra se envuelve en `@if (!showSearch())` para ocultarla cuando la búsqueda está activa. Contiene: botón "Todos" y un `@for` sobre `statusEntries`. Pasar `[statusFilter]="statusFilter()"` al componente `<app-binder-node>` en la línea donde ya aparece (línea 76-87).
- **Depende de**: Tarea 12, Tarea 14

#### Tarea 14: Filtro de estado en BinderNodeComponent — TypeScript
- **Fichero**: `src/app/features/editor/binder/binder-node.component.ts` (modificar)
- **Qué hace**: Añadir:
  1. Nuevo input: `statusFilter = input<DocumentStatus | 'all'>('all')`
  2. Computed signal `isVisible` que devuelve `true` si `statusFilter() === 'all'`, o si el nodo es un documento con el estado seleccionado, o si el nodo es una carpeta con al menos un descendiente que coincide.
  3. Método privado `hasMatchingDescendant(node: TreeNode, status: DocumentStatus): boolean` que recorre recursivamente.
  4. `DocumentStatus` ya está importado en este fichero (línea 6); solo añadir el tipo al input.
- **Depende de**: ninguna dependencia previa

#### Tarea 15: Filtro de estado en BinderNodeComponent — HTML
- **Fichero**: `src/app/features/editor/binder/binder-node.component.html` (modificar)
- **Qué hace**: Envolver todo el contenido actual del template en un bloque `@if (isVisible())`. El template actual tiene el nodo raíz como un `<div>` o bloque condicional; todo ese contenido queda anidado. Asegurarse de que la llamada recursiva a `<app-binder-node>` también pasa `[statusFilter]="statusFilter()"` como input.
- **Depende de**: Tarea 14
- **Riesgo**: La recursión en el template ya existe para renderizar hijos. Al añadir `statusFilter` al componente como input, la llamada recursiva en el template debe pasar el valor — de lo contrario el filtro no se propaga en profundidad. Verificar todas las apariciones de `<app-binder-node>` en el template (la llamada recursiva para los hijos).

#### Tarea 16: Datos de plantillas predefinidas
- **Fichero**: `src/app/core/data/project-templates.ts` (crear — directorio nuevo)
- **Qué hace**: Exporta la constante `PROJECT_TEMPLATES: ProjectTemplate[]` con las 6 plantillas definidas en la spec: blank, novel-3act, novel-parts, short-story, essay, custom. Importa `ProjectTemplate` y `TemplateNode` desde `../models/project.model`. Los emojis de los iconos se mantienen exactamente como en la spec.
- **Depende de**: Tarea 2

#### Tarea 17: NewProjectModalComponent — TypeScript (paso de plantilla)
- **Fichero**: `src/app/features/project-manager/new-project-modal.component.ts` (modificar)
- **Qué hace**: Cinco cambios en la clase:
  1. Inyectar `DocumentService` como `private docService = inject(DocumentService)`.
  2. Añadir nuevos signals y propiedades: `step = signal<1 | 2>(1)`, `selectedTemplate = signal<ProjectTemplate>(PROJECT_TEMPLATES[0])`, `customParts = 3` (property plana, no signal), `customChapters = 5`.
  3. Añadir import de `PROJECT_TEMPLATES`, `ProjectTemplate`, `TemplateNode` desde sus rutas.
  4. Añadir `FormsModule` ya está importado; verificar que también está disponible para los `[(ngModel)]` de los inputs numéricos de la plantilla custom.
  5. Modificar el método `create()`: tras el `await this.projectService.createProject(...)`, añadir la lógica de `applyTemplate`. La estructura a usar es `template.id === 'custom' ? buildCustomStructure(...) : template.structure`. Llamar `applyTemplate` solo si `structure.length > 0`.
  6. Añadir los métodos privados `buildCustomStructure(parts, chaptersPerPart): TemplateNode[]` y `applyTemplate(nodes, parentId)` tal como describe la spec.
- **Depende de**: Tarea 2, Tarea 16
- **Riesgo**: `applyTemplate` es recursivo y async. Cada llamada a `projectService.addNode()` hace un `save()` del proyecto. Para estructuras grandes (novel-3act tiene ~17 nodos) esto significa ~17 escrituras secuenciales de disco. Es aceptable para una operación de creación única; no optimizar con batch en esta spec. El método `applyTemplate` recibe `parentId: string | null = null` — verificar que `projectService.addNode()` acepta `null` (sí lo acepta, ver firma en ProjectService línea 70-73).

#### Tarea 18: NewProjectModalComponent — HTML (dos pasos)
- **Fichero**: `src/app/features/project-manager/new-project-modal.component.html` (modificar)
- **Qué hace**: Reescribir el contenido del modal para soportar dos pasos:
  - **Paso 1** (`@if (step() === 1)`): grid de plantillas 2 columnas con scroll, botón de selección activa resaltado con `border-ink-accent`, bloque condicional para opciones de plantilla custom (campos `customParts` y `customChapters` con `[(ngModel)]`).
  - **Paso 2** (`@if (step() === 2)`): el formulario existente (nombre, descripción, carpeta) sin cambios.
  - Slot `actions`: en paso 1 → botón "Cancelar" + "Siguiente"; en paso 2 → botón "Anterior" (que hace `step.set(1)`) + botón "Crear proyecto" existente.
  - La referencia a `templates` en el template apunta a la propiedad `readonly templates = PROJECT_TEMPLATES` que debe añadirse en el TypeScript.
- **Depende de**: Tarea 17

#### Tarea 19: Keys i18n — es.json y en.json
- **Fichero**: `src/assets/i18n/es.json` (modificar) y `src/assets/i18n/en.json` (modificar)
- **Qué hace**: Añadir las nuevas keys necesarias para los textos nuevos que usen el pipe `transloco`. Analizar los templates de las Tareas 11, 13 y 18 para identificar qué textos van con pipe y cuáles son hardcoded. Según la spec, los textos del modal de stats están hardcoded en español. Para la barra de filtro y el modal de plantillas, seguir el patrón existente (hardcoded en el template si no hay key de i18n en la spec). Añadir al menos:
  - `"INK_NAV.STATS"` para el título del botón de estadísticas (ambos idiomas).
  - `"MODAL.STEP1_SUBTITLE"`, `"MODAL.NEXT"`, `"MODAL.BACK"` para la navegación de pasos del modal.
  - Si el Implementer detecta más textos interpolados con transloco en los templates nuevos, añadirlos aquí.
- **Depende de**: Tareas 11, 13, 18

---

### Orden de ejecución

1. Tarea 1 — `stats.model.ts` (modelo de datos, sin dependencias)
2. Tarea 2 — `project.model.ts` (añadir interfaces de plantilla)
3. Tarea 3 — `project-paths.ts` (añadir `statsPath`)
4. Tarea 4 — `stats.service.ts` (servicio, depende de 1 y 3)
5. Tarea 16 — `project-templates.ts` (datos de plantillas, depende de 2)
6. Tarea 6 — `stats-modal.component.ts` (shell del componente, depende de 4)
7. Tarea 7 — `stats-modal.component.html` (template del modal)
8. Tarea 8 — `stats-modal.component.css` (fichero de estilos vacío)
9. Tarea 9 — `renderChart()` en el componente (completar método SVG, depende de 6 y 7)
10. Tarea 10 — `ink-nav.component.ts` (añadir signal y import, depende de 6)
11. Tarea 11 — `ink-nav.component.html` (botón y modal, depende de 10)
12. Tarea 14 — `binder-node.component.ts` (input filtro + computed isVisible)
13. Tarea 15 — `binder-node.component.html` (envolver en `@if (isVisible())`, propagar input)
14. Tarea 12 — `binder.component.ts` (signal statusFilter + statusEntries)
15. Tarea 13 — `binder.component.html` (barra de filtro + pasar input a binder-node)
16. Tarea 17 — `new-project-modal.component.ts` (lógica de dos pasos, depende de 2 y 16)
17. Tarea 18 — `new-project-modal.component.html` (template dos pasos, depende de 17)
18. Tarea 5 — `editor-layout.component.ts` (integrar StatsService, depende de 4 y 6)
19. Tarea 19 — `es.json` y `en.json` (keys i18n, depende de todos los templates)

---

### Puntos de atención para el Implementer

**Convenciones obligatorias del proyecto**
- Todos los componentes nuevos deben usar `templateUrl` y `styleUrl` — nunca templates ni estilos inline en el decorador.
- El directorio `src/app/features/editor/stats/` y el directorio `src/app/core/data/` deben crearse antes de escribir los ficheros.
- Ningún componente importa directamente `@tauri-apps/api`. Solo `TauriBridgeService`.
- Sin `any` en TypeScript salvo el contenido TipTap (tipado como `object`).

**Gráfica SVG pura (sin d3)**
- La spec original usa d3; el Explorer confirma que d3 NO está instalado. La Tarea 9 debe implementarse con SVG nativo.
- Usar `document.createElementNS('http://www.w3.org/2000/svg', 'rect')` para cada barra, o bien construir el SVG como string HTML y asignarlo vía `innerHTML`. La segunda opción es más concisa.
- El `@ViewChild('chartSvg')` solo es fiable tras `AfterViewInit`. Si el componente implementa `OnInit` async y el render del chart ocurre en `setTimeout`, verificar que el `@ViewChild` no es `undefined` al ejecutarse. Si lo es, cambiar el ciclo de vida a `AfterViewInit`.
- El `clientWidth` de un SVG con `width="100%"` puede ser 0 si el layout no ha pintado aún. Usar un valor de fallback (p.ej. 400px) si `clientWidth === 0`.

**StatsService — caché y reset**
- El campo `cache` es `null` por defecto y se rellena en la primera llamada a `load()`. Si el usuario cierra el proyecto y abre otro, `resetSession()` pone el caché a `null` y reinicia `sessionTracked`. Es crítico llamar a `resetSession()` en `ngOnDestroy()` de `EditorLayoutComponent`.
- `trackSessionStart()` es idempotente — el flag `sessionTracked` evita doble conteo en la misma sesión.

**Filtro de estado — Opción B (pasar statusFilter a binder-node)**
- Se elige la Opción B (pasar el filtro como input a `BinderNodeComponent`) porque el árbol ya se renderiza de forma recursiva en el template y no hay un array plano filtrable sin perder la estructura. La Opción A (computed del árbol filtrado) requeriría clonar y mutar el árbol en profundidad, lo cual es más invasivo y rompe la inmutabilidad del signal de ProjectService.
- La propagación del input en la llamada recursiva del template de `BinderNodeComponent` es el punto más propenso a olvido. Verificar que `<app-binder-node>` dentro del template de `BinderNodeComponent` (la llamada para los hijos) incluye `[statusFilter]="statusFilter()"`.

**Modal de nuevo proyecto — dos pasos**
- `applyTemplate()` es recursivo y secuencial. No paralelizar con `Promise.all` porque cada `addNode()` hace un `save()` que muta el signal del proyecto; paralelizar causaría condiciones de carrera en la escritura de `project.json`.
- La propiedad `customParts` y `customChapters` son propiedades planas de la clase (no signals), porque se usan con `[(ngModel)]` sin necesidad de reactividad más allá del binding de formulario.
- Añadir `readonly templates = PROJECT_TEMPLATES` como propiedad de la clase para que el template pueda iterar sobre ellas con `@for`.
- El slot `actions` del `InkModalComponent` es diferente en cada paso — usar `@if (step() === 1)` y `@if (step() === 2)` dentro de `<ng-container slot="actions">`.

**Lo que NO hacer en esta spec**
- No implementar estadísticas de velocidad (palabras por minuto).
- No añadir exportación de estadísticas a CSV.
- No permitir al usuario crear y guardar sus propias plantillas personalizadas (la plantilla "Personalizado" solo genera la estructura en el momento de creación).
- No filtrar por múltiples estados simultáneamente (selección única).
- No instalar d3 ni ninguna librería de gráficas.
