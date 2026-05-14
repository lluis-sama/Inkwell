# Plan de implementación — INK-07

## Resumen

El Implementer va a crear la vista de tableros de corcho completa: una barra de navegación global compartida entre editor y boards, un selector lateral de tableros, un canvas con drag & drop de tarjetas via interact.js, y los modales de creación de tableros y edición de tarjetas. Para ello reemplazará el placeholder actual de `BoardsLayoutComponent` e integrará `InkNavComponent` también en `EditorLayoutComponent`. La tarea previa obligatoria es instalar `interactjs` antes de escribir código.

---

## Tareas

### Tarea 1: Instalar interactjs
- **Fichero**: `package.json` / `pnpm-lock.yaml` (modificar via pnpm)
- **Qué hace**: Ejecutar `pnpm add interactjs` en la raíz del proyecto. Verifica que `@types/interactjs` se instala también (viene incluido en el paquete principal de interactjs >= 1.10). Confirmar que el import `import interact from 'interactjs'` resuelve sin errores de tipos.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Si los tipos no vienen incluidos, añadir `/// <reference types="interactjs" />` en el fichero `.ts` que lo usa. Verificar antes de avanzar a la Tarea 6.

---

### Tarea 2: InkNavComponent — TypeScript
- **Fichero**: `src/app/shared/components/ink-nav.component.ts` (crear)
- **Qué hace**: Componente standalone con `selector: 'ink-nav'`. Inyecta `ThemeService` y `Router`. Expone el método `isRoute(path: string): boolean` que delega en `this.router.url.startsWith(path)`. Importa `RouterLink`. Usa `templateUrl: './ink-nav.component.html'` (NO template inline aunque la spec muestra inline — el proyecto usa templateUrl). Incluye estilos con `styleUrl` o `styles` inline solo para las clases `.nav-icon` y `.nav-icon.active` que no son expresables en Tailwind puro.
- **Depende de**: Tarea 1 (ninguna dependencia de código, pero es la primera tarea de código)
- **Riesgo**: La spec muestra `template` inline. El proyecto usa `templateUrl` como convención obligatoria. El Implementer debe crear el `.html` separado. Si usa `styles` inline para `.nav-icon`, es aceptable porque esas clases no pueden definirse solo con Tailwind.

---

### Tarea 3: InkNavComponent — Template HTML
- **Fichero**: `src/app/shared/components/ink-nav.component.html` (crear)
- **Qué hace**: Template de la barra de navegación vertical izquierda. Contiene: logo SVG, enlace `routerLink="/editor"` con `[class.active]="isRoute('/editor')"`, enlace `routerLink="/boards"` con `[class.active]="isRoute('/boards')"`, spacer flexible, y botón toggle de tema con `@if (theme.theme() === 'dark')` para alternar entre icono sol y luna. Estructura outer: `<nav class="flex flex-col items-center w-12 h-full ...">`. Los atributos `title` de los iconos de navegación deben usar `transloco`. Importar `TranslocoPipe` en el componente `.ts`.
- **Depende de**: Tarea 2
- **Riesgo**: Ninguno especial.

---

### Tarea 4: Modificar EditorLayoutComponent — integrar InkNavComponent
- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**: Añadir `InkNavComponent` al array `imports` del decorador `@Component`. No hay otros cambios en el `.ts`.
- **Depende de**: Tarea 2

---

### Tarea 5: Modificar EditorLayoutComponent — template HTML
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**: Reestructurar el layout exterior. Actualmente el template tiene un `<div class="flex flex-col h-screen ...">` como raíz. Debe cambiarse a `<div class="flex h-screen bg-ink-bg overflow-hidden">` (flex horizontal). Dentro, como primer hijo, añadir `@if (!focusMode()) { <ink-nav /> }`. Como segundo hijo, envolver todo el contenido actual (top-bar + área principal) en un `<div class="flex flex-col flex-1 overflow-hidden">`. El interior de ese wrapper es exactamente el contenido actual del template sin el `<div>` raíz exterior.
- **Depende de**: Tarea 4
- **Riesgo**: Cambio estructural delicado. El template actual tiene `flex flex-col` en la raíz. El nuevo layout requiere `flex` (horizontal) en la raíz y mover el `flex-col` al contenedor interior. Comprobar que el binder, editor y paneles siguen con el mismo tamaño después del cambio. El toggle de tema que estaba en la top bar del editor debe eliminarse si existe (la nav ya lo incluye). Revisar el template actual antes de editar para no romper el panel de snapshots ni la franja IA.

---

### Tarea 6: NewBoardModalComponent — TypeScript
- **Fichero**: `src/app/features/boards/modals/new-board-modal.component.ts` (crear)
- **Qué hace**: Componente standalone. Inputs: ninguno. Outputs: `created = output<BoardFile>()`, `cancelled = output<void>()`. Signals: `creating = signal(false)`, `error = signal<string | null>(null)`. Propiedad local `title = ''`. Inyecta `BoardService`. Método async `create()`: guarda flag `creating`, llama a `boardService.createBoard(title.trim())`, emite `created` con el resultado, maneja error con `error.set(...)`. Usa `templateUrl: './new-board-modal.component.html'`. Importa `InkModalComponent`, `InkButtonComponent`, `FormsModule`, `TranslocoPipe`.
- **Depende de**: Tarea 1

---

### Tarea 7: NewBoardModalComponent — Template HTML
- **Fichero**: `src/app/features/boards/modals/new-board-modal.component.html` (crear)
- **Qué hace**: Envuelve en `<ink-modal [title]="'BOARDS.NEW_BOARD_MODAL.TITLE' | transloco" (closed)="cancelled.emit()">`. Interior: label + input con `[(ngModel)]="title"`, `(keydown.enter)="create()"`, `maxlength="80"`. Mensaje de error condicional con `@if (error())`. Slot de acciones con botón Cancelar (variant ghost) y botón "Crear tablero" (variant primary) con `[disabled]="!title.trim()"` y `[loading]="creating()"`. Todos los textos visibles (labels, placeholders, botones) deben usar el pipe `transloco`. Importar `TranslocoPipe` en el array `imports` del componente `.ts`.
- **Depende de**: Tarea 6

---

### Tarea 8: BoardSelectorComponent — TypeScript
- **Fichero**: `src/app/features/boards/board-selector/board-selector.component.ts` (crear)
- **Qué hace**: Componente standalone puramente presentacional. Inputs: `boards = input<BoardFile[]>([])`, `activeBoard = input<BoardFile | null>(null)`. Outputs: `boardSelected = output<BoardFile>()`, `createRequested = output<void>()`, `deleteRequested = output<string>()`. Sin inyecciones ni lógica. Usa `templateUrl: './board-selector.component.html'`. Importa `TranslocoPipe`.
- **Depende de**: Tarea 1

---

### Tarea 9: BoardSelectorComponent — Template HTML
- **Fichero**: `src/app/features/boards/board-selector/board-selector.component.html` (crear)
- **Qué hace**: `<aside>` con width fijo `w-56`. Header con label y botón + que emite `createRequested`. Lista con `@for (board of boards(); track board.id)`. Cada item: div clickable que emite `boardSelected.emit(board)`, con clase activa condicional basada en `activeBoard()?.id === board.id`. Icono SVG de cuadrícula, texto truncado, y botón × que emite `deleteRequested.emit(board.id)` con `$event.stopPropagation()`. Estado vacío con `@if (boards().length === 0)`. Todos los textos visibles deben usar el pipe `transloco` con claves bajo el namespace `BOARDS.SELECTOR.*`.
- **Depende de**: Tarea 8

---

### Tarea 10: CardEditorModalComponent — TypeScript
- **Fichero**: `src/app/features/boards/modals/card-editor-modal.component.ts` (crear)
- **Qué hace**: Componente standalone. Input requerido: `card = input.required<Card>()`. Outputs: `saved = output<Card>()`, `cancelled = output<void>()`. Propiedades locales (no signals): `editTitle`, `editBody`, `editColor` inicializadas en `ngOnInit()` desde `this.card()`. Propiedad `colors = DEFAULT_CARD_COLORS`. Implementa `OnInit`. Método `save()` emite `saved` con el card actualizado. Usa `templateUrl: './card-editor-modal.component.html'`. Importa `InkModalComponent`, `InkButtonComponent`, `FormsModule`, `TranslocoPipe`.
- **Depende de**: Tarea 1

---

### Tarea 11: CardEditorModalComponent — Template HTML
- **Fichero**: `src/app/features/boards/modals/card-editor-modal.component.html` (crear)
- **Qué hace**: Envuelve en `<ink-modal [title]="'BOARDS.CARD_EDITOR_MODAL.TITLE' | transloco" (closed)="cancelled.emit()">`. Interior: campo input para título con `[(ngModel)]="editTitle"`, textarea para cuerpo con `[(ngModel)]="editBody"` y `rows="6"`, selector de colores con `@for (color of colors; track color)` donde cada color es un botón circular con `[style.background]="color"` y clase de borde activo condicional. Slot de acciones: Cancelar y Guardar. Todos los textos visibles (labels, placeholders, botones) deben usar el pipe `transloco` con claves bajo el namespace `BOARDS.CARD_EDITOR_MODAL.*`.
- **Depende de**: Tarea 10

---

### Tarea 12: BoardCardComponent — TypeScript
- **Fichero**: `src/app/features/boards/canvas/board-card.component.ts` (crear)
- **Qué hace**: Componente standalone. Input requerido: `card = input.required<Card>()`. Outputs: `positionChanged = output<{ id: string; x: number; y: number }>()`, `editRequested = output<Card>()`, `deleteRequested = output<string>()`. `@ViewChild('cardEl', { static: true })` para el elemento nativo. Implementa `OnInit` y `OnDestroy`. En `ngOnInit()` (NO en `AfterViewInit` — `static: true` lo permite), inicializa `interact(this.cardEl.nativeElement).draggable(...)`. El listener `move` actualiza `el.style.left` y `el.style.top` acumulando `event.dx`/`event.dy`. El listener `end` emite `positionChanged`. Usa `interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })`. En `ngOnDestroy()` llama a `this.interactable?.unset()`. Usa `templateUrl: './board-card.component.html'`. Importa solo `CommonModule` si es necesario (no necesita otros componentes).
- **Depende de**: Tarea 1
- **Riesgo**: Este es el punto más propenso a errores de toda la spec. Puntos críticos: (1) el import de interactjs debe ser `import interact from 'interactjs'` — si TypeScript se queja añadir `"esModuleInterop": true` en tsconfig o usar `import * as interact from 'interactjs'`. (2) `static: true` en `@ViewChild` es lo que permite usar el elemento en `ngOnInit` sin esperar `AfterViewInit`. (3) La variable privada `interactable` debe tiparse como `ReturnType<typeof interact> | null`. (4) El listener `move` lee `el.style.left` y añade `event.dx` — si la tarjeta no tiene `left`/`top` iniciales como inline styles, el `parseFloat` devolverá `NaN`; el template debe garantizar que `[style.left.px]="card().x"` y `[style.top.px]="card().y"` están presentes.

---

### Tarea 13: BoardCardComponent — Template HTML
- **Fichero**: `src/app/features/boards/canvas/board-card.component.ts` — la sección de estilos y el template HTML (crear)
- **Fichero**: `src/app/features/boards/canvas/board-card.component.html` (crear)
- **Qué hace**: El elemento raíz es `<div #cardEl class="absolute rounded-lg ...">` con bindings `[style.left.px]="card().x"`, `[style.top.px]="card().y"`, `[style.width.px]="card().width"`, `[style.min-height.px]="card().height"`, `[style.background]="card().color"`, y `(dblclick)="editRequested.emit(card())"`. Interior: header con título (`card().title`), bloque de cuerpo condicional con `@if (card().body)` mostrando `card().body`, y botón eliminar absoluto en esquina superior derecha que emite `deleteRequested.emit(card().id)` con `$event.stopPropagation()`. El componente necesita `styles` para `:host { display: contents; }` y para la visibilidad del botón eliminar en hover (no expresable con Tailwind puro).
- **Depende de**: Tarea 12

---

### Tarea 14: BoardCanvasComponent — TypeScript
- **Fichero**: `src/app/features/boards/canvas/board-canvas.component.ts` (crear)
- **Qué hace**: Componente standalone. Input requerido: `board = input.required<BoardFile>()`. Outputs: `positionChanged`, `cardAdded`, `editRequested`, `deleteRequested`. Signal local: `contextMenu = signal<{ screenX, screenY, canvasX, canvasY } | null>(null)`. `@ViewChild('canvasEl')` para el div interior del canvas. Método `onCanvasRightClick(event: MouseEvent)`: previene default, calcula posición relativa al canvas via `getBoundingClientRect()`, y hace `contextMenu.set(...)`. Método `onAddCard()`: coge la posición del contextMenu, lo cierra, y emite `cardAdded`. Método `onPositionChanged(pos)`: reemite hacia arriba. Decorador `host` con `(document:click)` para cerrar el menú y `(document:keydown.escape)` para lo mismo. Importa `BoardCardComponent`. Usa `templateUrl: './board-canvas.component.html'`. Importa `signal` de `@angular/core`.
- **Depende de**: Tarea 12
- **Riesgo**: El `import { signal } from '@angular/core'` debe estar en el bloque de imports principal del fichero, no al final. La spec original tiene ese import al final del fichero accidentalmente — el Implementer debe colocarlo en el import correcto al principio.

---

### Tarea 15: BoardCanvasComponent — Template HTML
- **Fichero**: `src/app/features/boards/canvas/board-canvas.component.html` (crear)
- **Qué hace**: Contenedor exterior `<div class="relative w-full h-full overflow-auto bg-ink-bg">` con `background-image` punteado y `(contextmenu)="onCanvasRightClick($event)"`. Dentro, `<div #canvasEl class="relative" style="min-width: 3000px; min-height: 2000px;">` con `@for (card of board().cards; track card.id)` renderizando `<app-board-card>` con los cuatro bindings de output. Fuera del canvas interior pero dentro del contenedor: menú contextual condicional con `@if (contextMenu())` posicionado con `[style.left.px]` y `[style.top.px]`, con botón que llama a `onAddCard()`. El texto del botón del menú contextual debe usar `transloco`. Importar `TranslocoPipe` en el componente `.ts`.
- **Depende de**: Tarea 14

---

### Tarea 16: BoardsLayoutComponent — reemplazar TypeScript (orquestador)
- **Fichero**: `src/app/features/boards/boards-layout.component.ts` (modificar — reemplazo completo)
- **Qué hace**: Reemplaza el contenido actual (14 líneas placeholder con `TranslocoPipe`) por la implementación completa del orquestador. Signals: `boards = signal<BoardFile[]>([])`, `activeBoard = signal<BoardFile | null>(null)`, `showNewBoardModal = signal(false)`, `editingCard = signal<Card | null>(null)`. Implementa `OnInit` con redirección a `/` si no hay proyecto cargado, y carga de tableros via `boardService.listBoardIds()` + `Promise.all`. Métodos: `selectBoard`, `onBoardCreated`, `deleteBoard`, `onCardAdded`, `onCardSaved`, `onDeleteCard`, `onPositionChanged`, `persistBoard` (privado). Importa los cinco componentes hijos. Usa `templateUrl: './boards-layout.component.html'`. Mantener `TranslocoPipe` en el array `imports`.
- **Depende de**: Tareas 2, 8, 14, 6, 10
- **Riesgo**: Eliminar el inject de `ThemeService` que ya no se necesita (la nav lo gestiona). La señal `boards` es un array de `BoardFile` completos (cargados), no IDs — asegurarse de que `listBoardIds` devuelve IDs y luego se resuelven con `loadBoard`.

---

### Tarea 17: BoardsLayoutComponent — reemplazar template HTML
- **Fichero**: `src/app/features/boards/boards-layout.component.html` (modificar — reemplazo completo)
- **Qué hace**: Reemplaza el contenido actual (placeholder COMING_SOON con TranslocoPipe) por el template completo. Layout: `<div class="flex h-screen bg-ink-bg overflow-hidden">` con `<ink-nav />`, `<app-board-selector>` con sus cuatro bindings, y div flex-col para el área principal. El área principal contiene: header con nombre del tablero activo y contador de tarjetas (o mensaje vacío), y condicionalmente `<app-board-canvas>` con sus cuatro outputs o el estado vacío con SVG. Fuera del div principal: modal `@if (showNewBoardModal())` y modal `@if (editingCard())`. Todos los textos visibles deben usar el pipe `transloco` con claves bajo el namespace `BOARDS.*`.
- **Depende de**: Tarea 16

---

### Tarea 18: Añadir HostListeners Alt+1 / Alt+2 en AppComponent
- **Fichero**: `src/app/app.component.ts` (modificar)
- **Qué hace**: Añadir `HostListener` al import de `@angular/core`. Añadir método decorado con `@HostListener('document:keydown', ['$event'])` (o dos métodos separados) que detecte `event.altKey && event.key === '1'` para navegar a `/editor` y `event.altKey && event.key === '2'` para navegar a `/boards`. Inyectar `Router` de `@angular/router`. Llamar a `event.preventDefault()` antes de navegar.
- **Depende de**: ninguna dependencia previa de las otras tareas (puede implementarse en cualquier orden)

---

### Tarea 19: Actualizar ficheros i18n (en.json y es.json)
- **Fichero**: `src/assets/i18n/es.json` y `src/assets/i18n/en.json` (modificar)
- **Qué hace**: Añadir todas las claves de traducción nuevas de INK-07 bajo el namespace `BOARDS`. Claves mínimas requeridas:
  - `BOARDS.NAV.EDITOR_TITLE` — "Editor" / "Editor"
  - `BOARDS.NAV.BOARDS_TITLE` — "Tableros" / "Boards"
  - `BOARDS.NAV.TOGGLE_THEME` — "Cambiar tema" / "Toggle theme"
  - `BOARDS.SELECTOR.HEADER` — "Tableros" / "Boards"
  - `BOARDS.SELECTOR.NEW_BOARD` — "Nuevo tablero" / "New board"
  - `BOARDS.SELECTOR.EMPTY` — "Sin tableros todavía.\nCrea uno con el botón +" / "No boards yet.\nCreate one with the + button"
  - `BOARDS.SELECTOR.DELETE` — "Eliminar tablero" / "Delete board"
  - `BOARDS.NEW_BOARD_MODAL.TITLE` — "Nuevo tablero" / "New board"
  - `BOARDS.NEW_BOARD_MODAL.NAME_LABEL` — "Nombre del tablero *" / "Board name *"
  - `BOARDS.NEW_BOARD_MODAL.NAME_PLACEHOLDER` — "Ideas generales" / "General ideas"
  - `BOARDS.NEW_BOARD_MODAL.CANCEL` — "Cancelar" / "Cancel"
  - `BOARDS.NEW_BOARD_MODAL.CREATE` — "Crear tablero" / "Create board"
  - `BOARDS.CARD_EDITOR_MODAL.TITLE` — "Editar tarjeta" / "Edit card"
  - `BOARDS.CARD_EDITOR_MODAL.TITLE_LABEL` — "Título" / "Title"
  - `BOARDS.CARD_EDITOR_MODAL.TITLE_PLACEHOLDER` — "Título de la tarjeta" / "Card title"
  - `BOARDS.CARD_EDITOR_MODAL.BODY_LABEL` — "Contenido" / "Content"
  - `BOARDS.CARD_EDITOR_MODAL.BODY_PLACEHOLDER` — "Escribe aquí tus notas, ideas..." / "Write your notes, ideas..."
  - `BOARDS.CARD_EDITOR_MODAL.COLOR_LABEL` — "Color" / "Color"
  - `BOARDS.CARD_EDITOR_MODAL.CANCEL` — "Cancelar" / "Cancel"
  - `BOARDS.CARD_EDITOR_MODAL.SAVE` — "Guardar" / "Save"
  - `BOARDS.CANVAS.ADD_CARD` — "Nueva tarjeta aquí" / "New card here"
  - `BOARDS.LAYOUT.NO_BOARD_SELECTED` — "Selecciona o crea un tablero" / "Select or create a board"
  - `BOARDS.LAYOUT.HEADER_EMPTY` — "Selecciona o crea un tablero" / "Select or create a board"
  - `BOARDS.LAYOUT.CARDS_COUNT` — "{{count}} tarjetas" / "{{count}} cards"
- **Depende de**: Tareas 3, 7, 9, 11, 15, 17

---

### Tarea 20: Verificar build sin errores
- **Fichero**: ninguno (tarea de verificación)
- **Qué hace**: Ejecutar `pnpm run build` (o `ng build`) en la raíz del proyecto. Si hay errores de TypeScript, corregirlos antes de dar la tarea por completada. Los errores más probables son: import de `signal` olvidado en `board-canvas.component.ts`, tipos de interactjs no resueltos, o referencias circulares entre componentes.
- **Depende de**: Todas las tareas anteriores

---

## Orden de ejecución

1. Tarea 1 — Instalar interactjs (prerequisito de todo lo demás)
2. Tarea 2 — InkNavComponent TypeScript
3. Tarea 3 — InkNavComponent HTML
4. Tarea 4 — EditorLayoutComponent: añadir import de InkNav al .ts
5. Tarea 5 — EditorLayoutComponent: reestructurar template HTML
6. Tarea 6 — NewBoardModalComponent TypeScript
7. Tarea 7 — NewBoardModalComponent HTML
8. Tarea 8 — BoardSelectorComponent TypeScript
9. Tarea 9 — BoardSelectorComponent HTML
10. Tarea 10 — CardEditorModalComponent TypeScript
11. Tarea 11 — CardEditorModalComponent HTML
12. Tarea 12 — BoardCardComponent TypeScript (interact.js aquí)
13. Tarea 13 — BoardCardComponent HTML + estilos
14. Tarea 14 — BoardCanvasComponent TypeScript
15. Tarea 15 — BoardCanvasComponent HTML
16. Tarea 16 — BoardsLayoutComponent TypeScript (reemplazo)
17. Tarea 17 — BoardsLayoutComponent HTML (reemplazo)
18. Tarea 18 — AppComponent: Alt+1 / Alt+2
19. Tarea 19 — Actualizar ficheros i18n (en.json y es.json)
20. Tarea 20 — Verificar build

---

## Puntos de atención para el Implementer

### Convención de templates externos (OBLIGATORIA)
Todos los componentes de este proyecto usan `templateUrl` y `styleUrl` / `styles`, nunca `template` inline. La spec muestra código con `template` inline en algunos componentes — ignorar esa parte y siempre crear el fichero `.html` separado. Esta regla aplica a todos los componentes nuevos de esta spec.

### interact.js y OnInit vs AfterViewInit
Cuando `@ViewChild` usa `{ static: true }`, el elemento está disponible en `ngOnInit`. Para `BoardCardComponent`, inicializar interact.js en `ngOnInit` es correcto y seguro. Si por algún motivo el elemento no es accesible, cambiar a `AfterViewInit` — pero con `static: true` no debería ser necesario.

### Import de interact.js
El import correcto es `import interact from 'interactjs'`. Si TypeScript reporta error con esta forma (`esModuleInterop` no activado), usar `import * as interact from 'interactjs'`. Verificar cuál funciona con la configuración de tsconfig existente antes de seguir.

### Signal import en BoardCanvasComponent
La spec original coloca `import { signal } from '@angular/core'` al final del fichero (error tipográfico). El Implementer debe colocarlo en el bloque de imports de `@angular/core` al principio del fichero, junto con `Component`, `ElementRef`, `ViewChild`, `input`, `output`.

### i18n obligatorio en todos los componentes
Todos los textos visibles deben usar el pipe `transloco`, como en el resto de la app. `TranslocoPipe` debe estar en el array `imports` de cada componente que muestre texto. Las claves de traducción siguen el namespace `BOARDS.*`. Los ficheros `en.json` y `es.json` deben actualizarse en la Tarea 19 con todas las claves nuevas.

### Cambio estructural del EditorLayout (Tarea 5)
El template actual del editor tiene `flex flex-col` en la raíz. Al añadir `ink-nav`, la raíz pasa a `flex` (horizontal) y el contenido existente se envuelve en un div con `flex flex-col flex-1`. Es un cambio de una línea en la raíz más un wrapper — pero si se hace mal, el layout del editor queda roto. Leer el template completo antes de editarlo.

### Lo que NO hacer (restricciones de la spec)
- No implementar resize de tarjetas
- No implementar búsqueda o filtrado de tarjetas
- No añadir atajos de teclado en el canvas más allá de los especificados (Escape para cerrar menú contextual)
- No implementar drag & drop para reordenar la lista de tableros
- No añadir base de datos ni lógica de negocio en Rust
- No usar BehaviorSubject ni NgZone
- No usar NgModules
- No importar Tauri directamente en componentes (ya lo hace TauriBridgeService via BoardService)
