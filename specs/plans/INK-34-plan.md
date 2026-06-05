## Plan de implementación — INK-34

### Resumen

Tres mejoras independientes sobre la vista de tableros: (1) contraste adaptativo de texto calculado vía luminancia WCAG 2.1, (2) tarjeta con modo compacto/expandido activado por doble clic y chevron, y (3) conexiones direccionales entre tarjetas con curvas Bézier, animación de flujo y popover de edición. El plan resuelve primero el conflicto de doble clic (mover edición a botón lápiz), luego construye la infraestructura compartida (utils, click-outside, reduced-motion), después las Partes 1 y 2, y finalmente la Parte 3 (modelo → SVG estático → anclajes → drag → popover → animación).

---

### Tareas

#### Tarea 1: Utilidades de contraste y nuevo directorio `utils/`
- **Fichero**: `src/app/features/boards/utils/board-card.utils.ts` (crear)
- **Qué hace**: Crea el directorio `utils/` y el fichero con `relativeLuminance(hex)` y `contrastTextColor(bgHex)` exactamente como se describe en la spec (linearización de componentes, umbral 0.179, retorno `#0f0f0f` o `#f5f5f5`).
- **Depende de**: ninguna dependencia previa.
- **Riesgo**: Ninguno.

#### Tarea 2: Infraestructura compartida — click-outside y reduced-motion
- **Ficheros**:
  - `src/app/shared/utils/click-outside.directive.ts` (crear)
  - `src/app/shared/utils/reduced-motion.ts` (crear)
- **Qué hace**:
  - **click-outside**: Directiva standalone `ClickOutsideDirective` con `@HostListener('document:click', ['$event'])`. Emite un output `clickOutside` cuando el clic ocurre fuera del elemento host y no dentro de un selector de excepción opcional.
  - **reduced-motion**: Función `prefersReducedMotion()` que devuelve un `signal<boolean>` inicializado con `window.matchMedia('(prefers-reduced-motion: reduce)').matches` y que escucha cambios del media query vía `addEventListener('change')` para actualizar el signal.
- **Depende de**: ninguna dependencia previa.
- **Riesgo**: El media query listener debe limpiarse al destruirse. En zoneless, usar `effect` o `DestroyRef` para el cleanup.

#### Tarea 3: Parte 1 + Resolución del conflicto de doble clic en `BoardCardComponent`
- **Ficheros**:
  - `src/app/features/boards/canvas/board-card.component.ts` (modificar)
  - `src/app/features/boards/canvas/board-card.component.html` (modificar)
  - `src/app/features/boards/canvas/board-card.component.css` (modificar)
- **Qué hace**:
  - Importar `contrastTextColor` desde el utils creado en Tarea 1.
  - Añadir `protected readonly textColor = computed(() => this.card().imageData ? '#f5f5f5' : contrastTextColor(this.card().color));` (sobre imágenes forzamos texto claro porque el overlay oscuro garantiza legibilidad).
  - En el template, aplicar `[style.color]="textColor()"` al elemento raíz `.card-root`. Eliminar TODAS las clases hardcodeadas de color de texto (`text-white`, `text-ink-text`, `text-ink-subtle`) de los elementos internos; el color se hereda desde la raíz.
  - **Resolver conflicto doble clic**: eliminar `(dblclick)="editRequested.emit(card())"` del `.card-root`. Añadir un botón de lápiz/editar en la esquina superior izquierda (visibilidad `opacity-0` → `opacity-100` en hover, igual que `.card-delete`), que emita `editRequested.emit(card())` con `$event.stopPropagation()`.
  - En CSS, cambiar el hover de `.card-root` para usar `filter: brightness(0.85)` en lugar de cualquier modificación de `background-color`.
- **Depende de**: Tarea 1.
- **Riesgo**: Si se olvida quitar alguna clase `text-white` interna, el color hardcodeado prevalecerá sobre el `style.color` heredado.

#### Tarea 4: Parte 2 — Tarjeta expandida (lógica, template y estilos)
- **Ficheros**:
  - `src/app/features/boards/canvas/board-card.component.ts` (modificar)
  - `src/app/features/boards/canvas/board-card.component.html` (modificar)
  - `src/app/features/boards/canvas/board-card.component.css` (modificar)
- **Qué hace**:
  - **TS**: Añadir `protected readonly isExpanded = signal(false);` y método `toggleExpanded(event: MouseEvent)` con `event.stopPropagation(); this.isExpanded.update(v => !v);`. Inyectar `ProjectService` (private). Añadir `getDocumentTitle(docId: string): string` que use `findNode(this.projectService.project()?.tree ?? [], docId)?.title ?? docId`.
  - **TS — Drag handle**: Cambiar la configuración de `interact.js` en `ngOnInit` para restringir el inicio del drag a una zona específica. Añadir opción `allowFrom: '.card-drag-handle'` al draggable. Añadir la clase `card-drag-handle` al elemento que agrupa el indicador de tipo y el título en el template (la "cabecera" de la tarjeta). Esto evita que el cuerpo expandido inicie un drag accidental.
  - **HTML**: Añadir `(dblclick)="toggleExpanded($event)"` en `.card-root`. Añadir botón chevron (▾/▴) en la esquina inferior derecha, visible en hover, que llame a `toggleExpanded($event)`.
  - **HTML — Sección expandida**: Dentro del `.card-root`, después del content wrapper actual, añadir bloque `@if (isExpanded()) { ... }` con:
    - Párrafo del body completo (sin truncar).
    - Bloque "Aparece en:" con `@for (docId of card().characterData!.appearsInChapters; track docId)` mostrando `<span class="card-chapter-pill">{{ getDocumentTitle(docId) }}</span>`.
    - Bloque "También conocido como:" con aliases solo si `type === 'character'`.
  - **HTML — Modo compacto**: El body visible en modo compacto (cuando `!isExpanded()`) debe truncarse a máximo 2 líneas con ellipsis (usar `line-clamp-2` o equivalente vía CSS).
  - **CSS**: Definir alturas y transición:
    - `.card-root`: `height: 160px; transition: height 200ms ease-out; overflow: hidden;`.
    - Cuando `isExpanded()` es true, la clase `.expanded` se añade (vía `[class.expanded]="isExpanded()"`). No usar `max-height` para la animación.
    - Implementar la medición de altura real con `ResizeObserver`: en el `effect` o en `ngAfterViewInit`, observar el contenido interior de la tarjeta. Cuando `isExpanded()` cambia a true, leer la altura real del contenido (header + expanded body), aplicar `style.height = ${Math.min(measuredHeight, 480)}px` al `.card-root`. Si `measuredHeight > 480`, la sección expandida interna debe tener `overflow-y: auto`. Cuando `isExpanded()` es false, volver a `160px`.
    - Estilos del chevron: posición absoluta bottom-right, opacity 0 → 1 en hover.
    - Estilos de pills de capítulos y aliases con Tailwind.
- **Depende de**: Tarea 3 (doble clic liberado del edit).
- **Riesgo**: Alta. La animación de `height` sin `max-height` requiere coordinar el `ResizeObserver` con el cambio de signal. Si el timing es incorrecto, la transición no se ve. Asegurar que la clase `.expanded` se añade y el `style.height` se setea en el mismo ciclo o con `requestAnimationFrame`.

#### Tarea 5: Parte 3 — Modelo de datos y persistencia de conexiones
- **Ficheros**:
  - `src/app/core/models/board.model.ts` (modificar)
  - `src/app/core/services/board.service.ts` (modificar)
- **Qué hace**:
  - En `board.model.ts`, añadir la interfaz `CardConnection` con campos `id`, `fromCardId`, `toCardId`, `label?`, `color`. Añadir campo `connections: CardConnection[]` a `BoardFile`.
  - En `board.service.ts`, en `loadBoard()`, asegurar retrocompatibilidad: `board.connections = board.connections ?? []`. Añadir métodos:
    - `addConnection(board, fromCardId, toCardId, label?, color?)`
    - `updateConnection(board, connection)`
    - `deleteConnection(board, connectionId)`
    - Todos devuelven un nuevo `BoardFile` (inmutabilidad).
- **Depende de**: ninguna dependencia previa (puede ejecutarse en paralelo con Tareas 1-4).
- **Riesgo**: Ninguno.

#### Tarea 6: Parte 3 — SVG overlay estático (sin animación)
- **Ficheros**:
  - `src/app/features/boards/canvas/connection-svg-overlay.component.ts` (crear)
  - `src/app/features/boards/canvas/connection-svg-overlay.component.html` (crear)
  - `src/app/features/boards/canvas/connection-svg-overlay.component.css` (crear)
- **Qué hace**:
  - Componente standalone con inputs: `connections: CardConnection[]` (required), `cards: Card[]` (required), `provisionalConnection: { fromX, fromY, toX, toY, color } | null` (optional input con default `null`).
  - Implementar función interna `getAnchorPoint(card, preferredSide, targetX, targetY)`:
    - Si `preferredSide === 'auto'`, calcular el lado (n/s/e/w) cuyo punto cardinal esté más cerca de `(targetX, targetY)`.
    - Devolver coordenadas `{ x, y }` en el borde de la tarjeta, considerando `card.x`, `card.y`, `card.width`, `card.height`.
  - Implementar `getPathD(conn)` que devuelva una curva cúbica de Bézier: `M from.x from.y C from.x+dx from.y, to.x-dx to.y, to.x to.y` donde `dx = abs(to.x - from.x) * 0.5`.
  - Implementar `getArrowPoints(conn)`: triángulo de flecha en el extremo B (to), apuntando en la dirección de la curva en el punto final. Ángulo derivado del vector tangente final de la Bézier o simplificado apuntando hacia el centro de B desde el punto de anclaje.
  - Implementar `getLabelTransform(conn)`: devolver `translate(x, y)` centrado en el punto medio de la curva (evaluar punto t=0.5 de la Bézier o aproximar con el punto medio de la cuerda recta).
  - Template SVG: `<svg>` posicionado absoluto, dimensiones `3000x2000` (igual que el canvas), `pointer-events: none` en el `<svg>` raíz.
    - Para cada conexión, renderizar `<g>` con:
      - `<path>` base (semi-transparente, `stroke-opacity="0.35"`).
      - `<path>` animada (sin animación aún, solo `stroke-dasharray="8 6"`; la animación CSS se añade en Tarea 12).
      - `<polygon>` flecha.
      - `<g>` etiqueta con `<rect>` fondo y `<text>` si `conn.label` existe.
      - `<path>` invisible de click (`stroke="transparent"`, `stroke-width="16"`, `pointer-events: stroke`) para seleccionar la conexión.
    - Si `provisionalConnection` existe, renderizar una línea punteada (`stroke-dasharray="4 4"`) desde el anclaje origen hasta la posición del cursor.
  - Output: `connectionSelected = output<CardConnection>()`.
- **Depende de**: Tarea 5.
- **Riesgo**: El cálculo de la flecha en una curva Bézier requiere evaluar la tangente final. Si se simplifica mal, la flecha puede quedar desalineada. Usar la derivada de la curva en `t=1`.

#### Tarea 7: Parte 3 — Puntos de anclaje en `BoardCardComponent`
- **Ficheros**:
  - `src/app/features/boards/canvas/board-card.component.ts` (modificar)
  - `src/app/features/boards/canvas/board-card.component.html` (modificar)
  - `src/app/features/boards/canvas/board-card.component.css` (modificar)
- **Qué hace**:
  - En `board-card.component.ts`, añadir output:
    ```ts
    connectionStarted = output<{ cardId: string; side: 'n'|'s'|'e'|'w'; x: number; y: number }>();
    ```
  - Añadir método `startConnection(side: 'n'|'s'|'e'|'w', event: MouseEvent)`:
    - `event.stopPropagation(); event.preventDefault();`
    - Calcular `anchorX` y `anchorY` sumando el offset del lado correspondiente a `card().x` y `card().y` (considerando width/height). Emitir `connectionStarted`.
  - En el template, añadir dentro de `.card-root` (al final, para z-index):
    ```html
    <div class="anchor anchor-n" (mousedown)="startConnection('n', $event)"></div>
    ... (s, e, w)
    ```
  - En CSS, añadir estilos de `.anchor` exactamente como en la spec (10px, redondeo, `--ctp-blue`, borde `--ctp-base`, `cursor: crosshair`, `opacity: 0`, `transition: opacity 150ms`). Mostrar con `.card-root:hover .anchor { opacity: 1; }`. Posicionar N/S/E/W con `transform: translateX/Y(-50%)`.
- **Depende de**: Tarea 4 (la tarjeta ya tiene su estructura final).
- **Riesgo**: El `stopPropagation` en `mousedown` del anchor es crítico. Si falla, `interact.js` iniciará el drag de la tarjeta al intentar arrastrar una conexión.

#### Tarea 8: Parte 3 — Integración de drag de conexión en `BoardCanvasComponent`
- **Ficheros**:
  - `src/app/features/boards/canvas/board-canvas.component.ts` (modificar)
  - `src/app/features/boards/canvas/board-canvas.component.html` (modificar)
- **Qué hace**:
  - Importar `ConnectionSvgOverlayComponent`.
  - Añadir signals:
    - `provisionalConnection = signal<{ fromCardId: string; fromSide: 'n'|'s'|'e'|'w'; fromX: number; fromY: number; toX: number; toY: number } | null>(null);`
    - `selectedConnection = signal<CardConnection | null>(null);`
  - Añadir outputs nuevos:
    - `connectionAdded = output<CardConnection>()` (o un output genérico `boardChanged` — ver Tarea 11).
    - Por ahora, manejar internamente la creación y emitir un evento específico para que `BoardsLayout` persista.
  - Manejar `connectionStarted` de cada `<app-board-card>`:
    - Setear `provisionalConnection` con los datos recibidos.
    - Añadir `@HostListener('document:mousemove')` o `(mousemove)` en el `#canvasEl` para actualizar `toX/toY` de la provisional. Las coordenadas deben ser relativas al canvas (restar `getBoundingClientRect()` del `#canvasEl`).
    - Añadir `@HostListener('document:mouseup')` o `(mouseup)` en `#canvasEl` para finalizar.
  - Lógica de `mouseup`:
    - Si hay `provisionalConnection`, usar `document.elementsFromPoint(event.clientX, event.clientY)` para detectar si el cursor está sobre otra tarjeta. Buscar el atributo `data-card-id` (que debe añadirse en el template de cada `<app-board-card>` en esta misma tarea).
    - Si se suelta sobre otra tarjeta distinta al origen:
      - Verificar si ya existe una conexión `fromCardId → toCardId`. Si existe, setear `selectedConnection` a esa conexión existente (abrir popover de edición en Tarea 10). No crear duplicado.
      - Si no existe, emitir `connectionAdded` con una nueva `CardConnection` (color por defecto `'#a78bfa'`, label vacío). También setear `selectedConnection` a la nueva conexión para que el popover se abra inmediatamente.
    - Si se suelta fuera de una tarjeta, simplemente limpiar `provisionalConnection`.
  - En el template:
    - Añadir `data-card-id` a cada `<app-board-card>`.
    - Insertar `<app-connection-svg-overlay>` dentro de `#canvasEl`, posicionado absoluto `inset-0`, `z-index: 0` (debajo de tarjetas). Pasar `connections`, `cards`, `provisionalConnection`.
    - Escuchar `(connectionSelected)` del overlay para setear `selectedConnection`.
  - **Nota**: la detección de drop mediante `elementsFromPoint` puede verse afectada por el SVG overlay. Como el SVG tiene `pointer-events: none` en el root pero `pointer-events: stroke` en los paths interactivos, los eventos de mouse pasan a través salvo sobre las conexiones existentes. Esto es aceptable; si se suelta sobre una conexión, no se creará una nueva (la conexión existente capturaría el clic en otro flujo). Para el drop, si `elementsFromPoint` no encuentra tarjeta, la conexión se cancela.
- **Depende de**: Tarea 6 y Tarea 7.
- **Riesgo**: Alta. La coordinación entre mousedown en el anchor (tarjeta), mousemove/mouseup en el canvas, y el estado `provisionalConnection` debe ser robusta. Asegurar que `preventDefault()` en el mousedown del anchor evite el text-selection drag nativo del navegador.

#### Tarea 9: Parte 3 — `ConnectionEditorPopover`
- **Ficheros**:
  - `src/app/features/boards/canvas/connection-editor-popover.component.ts` (crear)
  - `src/app/features/boards/canvas/connection-editor-popover.component.html` (crear)
  - `src/app/features/boards/canvas/connection-editor-popover.component.css` (crear)
- **Qué hace**:
  - Componente standalone. Inputs: `connection: CardConnection` (required), `left: number` (required), `top: number` (required). Outputs: `labelChanged = output<string>()`, `colorChanged = output<string>()`, `deleteRequested = output<void>()`, `closed = output<void>()`.
  - Template: contenedor posicionado absoluto con `[style.left.px]="left()"` y `[style.top.px]="top()"`.
    - Campo `<input type="text">` para label, bound al valor, emite `labelChanged` en `input` (tiempo real).
    - Paleta de 4 botones de color circular usando valores Catppuccin (`#cba6f7` mauve, `#89b4fa` blue, `#a6e3a1` green, `#f38ba8` red — o sus equivalentes hex exactos del tema). Más un botón `[+]` que dispare un `<input type="color">` nativo oculto.
    - Botón "Eliminar" que emita `deleteRequested`.
  - Usar la directiva `clickOutside` (Tarea 2) para cerrar al hacer clic fuera.
  - Usar `@HostListener('document:keydown.escape')` para cerrar con Escape.
  - El popover debe evitar overflow del canvas; si `left + width` excede el canvas, ajustar `left` (esto puede hacerse en el padre al pasar `left`/`top`, o internamente con un `clamp`).
- **Depende de**: Tarea 2 (click-outside).
- **Riesgo**: El posicionamiento debe calcularse en coordenadas del canvas, no de la ventana. Asegurar que el padre le pasa coordenadas relativas al `#canvasEl`.

#### Tarea 10: Parte 3 — Integrar popover en `BoardCanvasComponent` y selección de conexiones
- **Ficheros**:
  - `src/app/features/boards/canvas/board-canvas.component.ts` (modificar)
  - `src/app/features/boards/canvas/board-canvas.component.html` (modificar)
- **Qué hace**:
  - Importar `ConnectionEditorPopoverComponent`.
  - En el template, añadir condicionalmente el popover cuando `selectedConnection()` no sea null:
    ```html
    @if (selectedConnection()) {
      <app-connection-editor-popover
        [connection]="selectedConnection()!"
        [left]="selectedConnectionLeft()"
        [top]="selectedConnectionTop()"
        (labelChanged)="onConnectionLabelChanged($event)"
        (colorChanged)="onConnectionColorChanged($event)"
        (deleteRequested)="onConnectionDeleteRequested()"
        (closed)="selectedConnection.set(null)"
      />
    }
    ```
  - Añadir computeds `selectedConnectionLeft` y `selectedConnectionTop` que calculen el punto medio de la conexión seleccionada (usando la misma lógica de Bézier del overlay) para anclar el popover.
  - Métodos:
    - `onConnectionLabelChanged(label)`: actualizar la conexión seleccionada localmente y emitir `connectionUpdated`.
    - `onConnectionColorChanged(color)`: idem.
    - `onConnectionDeleteRequested()`: emitir `connectionDeleted` y cerrar popover.
  - Añadir outputs al `BoardCanvasComponent`:
    - `connectionAdded = output<CardConnection>()`
    - `connectionUpdated = output<CardConnection>()`
    - `connectionDeleted = output<string>()`
- **Depende de**: Tarea 8 y Tarea 9.
- **Riesgo**: El popover debe cerrarse si el usuario hace clic en otra conexión. Asegurar que `selectedConnection.set(null)` se limpia antes de abrir la nueva.

#### Tarea 11: Parte 3 — Persistencia de conexiones en `BoardsLayoutComponent`
- **Ficheros**:
  - `src/app/features/boards/boards-layout.component.ts` (modificar)
  - `src/app/features/boards/boards-layout.component.html` (modificar)
- **Qué hace**:
  - En `boards-layout.component.html`, pasar los nuevos outputs de `app-board-canvas`:
    ```html
    (connectionAdded)="onConnectionAdded($event)"
    (connectionUpdated)="onConnectionUpdated($event)"
    (connectionDeleted)="onConnectionDeleted($event)"
    ```
  - En `boards-layout.component.ts`, implementar:
    - `onConnectionAdded(conn)`: crear board actualizado con `BoardService.addConnection(activeBoard(), conn)` y llamar `persistBoard(updated)`.
    - `onConnectionUpdated(conn)`: `BoardService.updateConnection(...) + persistBoard`.
    - `onConnectionDeleted(connId)`: `BoardService.deleteConnection(...) + persistBoard`.
  - Verificar que `persistBoard` actualiza `activeBoard` y `boards` signals correctamente.
- **Depende de**: Tarea 10.
- **Riesgo**: Ninguno.

#### Tarea 12: Parte 3 — Animación de flujo y reduced-motion
- **Ficheros**:
  - `src/app/features/boards/canvas/connection-svg-overlay.component.css` (modificar)
  - `src/app/features/boards/canvas/connection-svg-overlay.component.ts` (modificar)
- **Qué hace**:
  - En el CSS del overlay, definir `@keyframes connectionFlow` y clase `.connection-flow` con `animation: connectionFlow 1.2s linear infinite;`. El `stroke-dashoffset` va de `0` a `-28`.
  - En el componente TS, importar `prefersReducedMotion` de la utilidad (Tarea 2). Pasar el valor al template mediante una clase host o input interno.
  - En el template SVG, añadir `[class.reduced-motion]="prefersReducedMotion()"` al `<svg>` o al `<g>` de las conexiones. Cuando esa clase esté presente, anular la animación (`animation: none`) y mostrar solo la línea base estática (o hacer la línea animada `display: none`).
- **Depende de**: Tarea 2 y Tarea 6.
- **Riesgo**: Ninguno.

#### Tarea 13: Traducciones
- **Ficheros**:
  - `src/assets/i18n/es.json` (modificar)
  - `src/assets/i18n/en.json` (modificar)
- **Qué hace**: Añadir las siguientes claves (y sus equivalentes en inglés):
  - `"BOARDS.CARD.EDIT"` → "Editar tarjeta" / "Edit card"
  - `"BOARDS.CARD.EXPANDED_APPEARS_IN"` → "Aparece en:" / "Appears in:"
  - `"BOARDS.CARD.EXPANDED_ALIASES"` → "También conocido como:" / "Also known as:"
  - `"BOARDS.CONNECTION.LABEL_PLACEHOLDER"` → "Describe la relación..." / "Describe the relationship..."
  - `"BOARDS.CONNECTION.DELETE"` → "Eliminar" / "Delete"
  - (Opcional) `"BOARDS.CONNECTION.COLOR_LABEL"` si se usa texto visible para la paleta.
- **Depende de**: ninguna (puede hacerse en paralelo, pero debe estar lista antes de que el Implementer considere la feature completa).
- **Riesgo**: Ninguno.

---

### Orden de ejecución

1. **Tarea 1** — `board-card.utils.ts`
2. **Tarea 2** — click-outside + reduced-motion
3. **Tarea 3** — Contraste adaptativo + botón lápiz (resuelve conflicto doble clic)
4. **Tarea 4** — Tarjeta expandida
5. **Tarea 5** — Modelo de datos `CardConnection` y métodos en `BoardService`
6. **Tarea 6** — SVG overlay estático (`ConnectionSvgOverlayComponent`)
7. **Tarea 7** — Puntos de anclaje en `BoardCardComponent`
8. **Tarea 8** — Integración de drag de conexión en `BoardCanvasComponent`
9. **Tarea 9** — `ConnectionEditorPopoverComponent`
10. **Tarea 10** — Integrar popover y selección en `BoardCanvasComponent`
11. **Tarea 11** — Persistencia en `BoardsLayoutComponent`
12. **Tarea 12** — Animación de flujo y reduced-motion
13. **Tarea 13** — Traducciones

---

### Puntos de atención para el Implementer

- **Zoneless + signals**: Todo cambio de estado debe pasar por signals (`set`, `update`, `computed`). No usar `NgZone`, `ChangeDetectorRef`, ni `BehaviorSubject`.
- **interact.js y stopPropagation**: Los puntos de anclaje usan `(mousedown)` con `event.stopPropagation()` para evitar que `interact.js` inicie el drag de la tarjeta. Si el drag de la tarjeta se dispara igualmente, revisar que `interact.js` no está capturando en fase de captura.
- **Drag handle**: Después de la expansión, el drag de la tarjeta debe iniciarse únicamente desde la cabecera (`.card-drag-header` o similar). Configurar `allowFrom` en el `interact(...).draggable(...)` de `BoardCardComponent`.
- **Altura animada sin max-height**: La spec prohíbe `max-height` para la transición de expansión. Usar `ResizeObserver` en el contenido para medir la altura real, aplicarla inline a `.card-root`, y dejar que la regla CSS `transition: height 200ms ease-out` haga la interpolación. No usar `max-height: 9999px` ni similares.
- **Imágenes vs. contraste**: Cuando la tarjeta tiene `imageData`, el color de fondo es transparente y hay un overlay oscuro. El cálculo de `contrastTextColor` sobre `transparent` o `''` fallaría. Forzar `#f5f5f5` cuando `hasImage()` sea true.
- **Drop de conexión y SVG**: Al soltar el drag de conexión, usar `document.elementsFromPoint(event.clientX, event.clientY)` para encontrar la tarjeta destino. Asegurar que el SVG overlay no bloquee la detección (el root SVG es `pointer-events: none`).
- **Conexiones duplicadas**: Si el usuario suelta una conexión A→B y ya existe una, no crear duplicado. Abrir el popover de la conexión existente.
- **prefers-reduced-motion**: El media query `matchMedia` debe escucharse y el estado debe limpiarse al destruir el componente (`DestroyRef`). En el SVG, la clase `reduced-motion` desactiva la animación CSS (`animation: none`).
- **Standalone components**: Todos los nuevos componentes deben ser `standalone: true`. No crear ni modificar NgModules.
- **TauriBridge exclusivo**: Ningún componente nuevo debe importar `@tauri-apps/api`. Todo acceso a disco pasa por `BoardService` → `TauriBridgeService`.
- **Click-outside reutilizable**: La directiva `ClickOutsideDirective` debe ser standalone y exportada para poder usarse en `ConnectionEditorPopover` y en cualquier futuro componente.
- **Estilos**: Usar tokens `--ink-*` para colores de UI generales. Los colores específicos de las conexiones (Catppuccin) pueden referenciarse directamente como hex o usando variables `--ctp-*` si están disponibles globalmente.
- **Ficheros de traducción**: Mantener sincronizados `es.json` y `en.json`. No dejar claves en un idioma solamente.
