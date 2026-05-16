# Plan de implementación — INK-14

## Resumen

Se amplía el modelo de tarjeta con un campo `type` (personaje, lugar, objeto, nota) y datos específicos de personaje (`CharacterData` con aliases y apariciones). A partir de ese modelo, se crea un `CharacterScanService` que lee los documentos del proyecto en disco para detectar apariciones del personaje, se renueva el `CardEditorModalComponent` con secciones de tipo, personaje y colores inteligentes, se actualiza `BoardCardComponent` con indicadores visuales, y se ajustan `BoardService`, `BoardCanvasComponent` y `BoardsLayoutComponent` para propagar el tipo en la creación y gestionar el flujo "nueva tarjeta con modal inmediato".

---

## Tareas

### Tarea 1: Ampliar el modelo de datos en `board.model.ts`

- **Fichero**: `src/app/core/models/board.model.ts` (modificar)
- **Qué hace**:
  - Añadir el tipo literal `CardType = 'character' | 'note' | 'research' | 'other'`.
  - Añadir la interfaz `CharacterData` con los campos: `aliases?: string[]`, `appearsInChapters: string[]` (IDs de documentos) y `lastScannedAt?: string` (ISO 8601).
  - Ampliar la interfaz `Card` con: `type: CardType` y `characterData?: CharacterData`.
  - Añadir la constante `CARD_TYPE_LABELS: Record<CardType, string>` con etiquetas en español.
  - Añadir la constante `CARD_TYPE_ICONS: Record<CardType, string>` con un emoji por tipo.
  - Añadir la constante `DEFAULT_COLORS_BY_TYPE: Record<CardType, string>` con un color hexadecimal distinto por tipo (usando los tonos Catppuccin Mocha existentes como referencia).
  - Mantener la constante `DEFAULT_CARD_COLORS` existente sin cambios para compatibilidad.
- **Depende de**: ninguna dependencia previa.

---

### Tarea 2: Crear `CharacterScanService`

- **Fichero**: `src/app/core/services/character-scan.service.ts` (crear)
- **Qué hace**:
  - Servicio `@Injectable({ providedIn: 'root' })` que inyecta `TauriBridgeService` y `ProjectService`.
  - Expone una interfaz `ChapterAppearance { documentId: string; documentTitle: string; matchCount: number }`.
  - Expone un método público `async scanCharacter(name: string, aliases: string[] = []): Promise<ChapterAppearance[]>` que:
    1. Usa `bridge.listJsonFiles(documentsFolderPath(basePath))` para obtener los IDs de todos los documentos.
    2. Para cada ID, construye la ruta con `documentPath(basePath, id)`.
    3. Lee el fichero con `bridge.readJsonFile()`, parsea el JSON como `DocumentFile`, convierte el contenido TipTap a texto con `tiptapToText()`.
    4. Construye un `RegExp` con todos los términos (nombre + aliases) con `\b...\b` y flags `gi`, escapa metacaracteres antes.
    5. Cuenta las coincidencias con `text.match(pattern)`.
    6. Si hay coincidencias, añade `{ documentId: id, documentTitle: doc.title, matchCount }` al resultado.
  - Si `basePath` es nulo o el nombre está vacío, devuelve `[]` sin lanzar error.
  - Si `basePath` es nulo o el proyecto no está cargado, devuelve `[]` sin lanzar error.
- **Depende de**: Tarea 1 (necesita `DocumentFile` de `document.model.ts`; aunque no modifica board.model, sí usa los tipos de la Tarea 1 indirectamente mediante el contexto del servicio).
- **Riesgo**: La regex debe escapar caracteres especiales del nombre del personaje antes de construir el patrón (`name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`). Omitir el escape provoca un error de runtime si el nombre contiene paréntesis u otros metacaracteres.

---

### Tarea 3: Actualizar `BoardService` — migración y `addCard`

- **Fichero**: `src/app/core/services/board.service.ts` (modificar)
- **Qué hace**:
  - Importar `CardType`, `DEFAULT_COLORS_BY_TYPE` desde `board.model.ts`.
  - En `loadBoard()`: tras el `JSON.parse`, iterar `board.cards` y para cualquier tarjeta que no tenga `type` definido, asignar `type: 'note'` como valor de migración. Esto garantiza compatibilidad con tarjetas guardadas antes de INK-14.
  - En `addCard()`: añadir un tercer parámetro `type: CardType = 'note'`. Usar `DEFAULT_COLORS_BY_TYPE[type]` como color inicial en lugar del color rotatorio por índice. Incluir `type` en el objeto `Card` construido. Inicializar `characterData` a `undefined`.
- **Depende de**: Tarea 1.
- **Riesgo**: El cambio en la firma de `addCard` rompe las llamadas existentes en `BoardsLayoutComponent` (Tarea 7). El Implementer debe tener presente que `addCard` se llama en `onCardAdded()` del layout y que esa firma cambia en la Tarea 7.

---

### Tarea 4: Actualizar `BoardCanvasComponent` — menú contextual con 4 tipos

- **Ficheros**:
  - `src/app/features/boards/canvas/board-canvas.component.ts` (modificar)
  - `src/app/features/boards/canvas/board-canvas.component.html` (modificar)
- **Qué hace**:
  - En el `.ts`: cambiar el output `cardAdded` de tipo `{ x: number; y: number }` a `{ x: number; y: number; type: CardType }`. Importar `CardType`, `CARD_TYPE_LABELS`, `CARD_TYPE_ICONS` desde `board.model.ts`. Exponer las constantes como propiedades de clase para usarlas en el template. Reemplazar el método `onAddCard()` por `onAddCardWithType(type: CardType)` que emite el output incluyendo el tipo.
  - En el `.html`: reemplazar el único botón del menú contextual por 4 botones, uno por cada `CardType` (`character`, `place`, `object`, `note`). Cada botón muestra el icono y la etiqueta correspondientes de `CARD_TYPE_ICONS` y `CARD_TYPE_LABELS`, y llama a `onAddCardWithType(type)`.
- **Depende de**: Tarea 1.
- **Riesgo**: El cambio en el output `cardAdded` rompe el binding en `boards-layout.component.html` (Tarea 7). El Implementer debe coordinarlo.

---

### Tarea 5: Actualizar `BoardCardComponent` — indicadores visuales

- **Ficheros**:
  - `src/app/features/boards/canvas/board-card.component.ts` (modificar)
  - `src/app/features/boards/canvas/board-card.component.html` (modificar)
- **Qué hace**:
  - En el `.ts`: importar `CARD_TYPE_ICONS` desde `board.model.ts` y exponerlo como propiedad de clase para usarlo en el template. No se añaden inputs adicionales; el tipo se lee desde `card().type`.
  - En el `.html`:
    - Añadir en el header de la tarjeta un indicador de emoji de tipo: `CARD_TYPE_ICONS[card().type]` visible siempre junto al título.
    - Añadir un badge de apariciones visible solo cuando `card().type === 'character'` y `card().characterData?.appearsInChapters?.length > 0`. El badge muestra el número de capítulos con "N cap.".
- **Depende de**: Tarea 1.

---

### Tarea 6: Reemplazar `CardEditorModalComponent`

- **Ficheros**:
  - `src/app/features/boards/modals/card-editor-modal.component.ts` (modificar)
  - `src/app/features/boards/modals/card-editor-modal.component.html` (modificar)
- **Qué hace**:
  - En el `.ts`:
    - Mantener los inputs y outputs existentes: `card = input.required<Card>()`, `saved = output<Card>()`, `cancelled = output<void>()`.
    - Añadir input `isNewCard = input<boolean>(false)` para que el modal muestre comportamiento especial al crear (título del modal diferente, botón "Cancelar" emite `cancelled` que en el layout eliminará la tarjeta).
    - Inyectar `CharacterScanService`.
    - Añadir propiedades de edición: `editType` (inicializado desde `card().type`), `aliasesInput` (string separado por comas, derivado de `card().characterData?.aliases ?? []`).
    - Añadir signals: `scanning = signal(false)`, `scanResults = signal<ChapterAppearance[]>([])`, `selectedChapterIds = signal<string[]>([])` (inicializado desde `card().characterData?.appearsInChapters ?? []`).
    - Exponer `CARD_TYPE_LABELS`, `CARD_TYPE_ICONS`, `cardTypes` (array de los 4 valores de `CardType`) como propiedades de clase para el template.
    - Método `onTypeChange(type: CardType)`: actualiza `editType`; si el tipo cambia a algo distinto de `'character'`, resetea las apariciones; aplica `DEFAULT_COLORS_BY_TYPE[type]` al `editColor`.
    - Método `async scanChapters()`: activa `scanning`, llama a `characterScanService.scanCharacter(editTitle, parsedAliases)`, actualiza `scanResults`, hace merge de IDs encontrados con `selectedChapterIds` existentes, desactiva `scanning`.
    - Método `save()`: construye el objeto `Card` completo incluyendo `type: editType` y, si es personaje, `characterData: { aliases: parsedAliases, appearsInChapters: selectedChapterIds(), lastScannedAt: scanResults().length > 0 ? new Date().toISOString() : card().characterData?.lastScannedAt }`.
    - Importar `FormsModule`, `CharacterScanService`, `InkModalComponent`, `InkButtonComponent`, `TranslocoPipe`, `CARD_TYPE_LABELS`, `CARD_TYPE_ICONS`, `DEFAULT_COLORS_BY_TYPE`, `CardType`.
  - En el `.html` (el fichero completo se reescribe; no hay template inline en el `.ts`):
    - Sección selector de tipo: botones o tabs para los 4 tipos, con icono y etiqueta.
    - Sección título (igual que hoy).
    - Sección cuerpo/notas (igual que hoy).
    - Sección personaje (visible solo cuando `editType === 'character'`): campo de aliases (input separado por comas) y botón "Buscar apariciones" que llama a `scanChapters()`. Lista de todos los documentos del proyecto con checkboxes (los encontrados por el escaneo quedan marcados; el usuario puede ajustar manualmente). Junto a cada documento marcado por el escaneo se muestra el matchCount como "Nx". Indicador de carga (spinner) mientras `scanning()` es `true`.
    - Sección selector de color: igual que hoy pero mostrando los colores de `DEFAULT_COLORS_BY_TYPE` según el tipo seleccionado, más los colores base existentes.
    - Acciones: botón Cancelar (emite `cancelled`) y botón Guardar (llama a `save()`).
- **Depende de**: Tareas 1, 2.
- **Riesgo**: Este es el componente más complejo. El `.ts` no debe tener `template` ni `templateUrl` duplicados; solo `templateUrl: './card-editor-modal.component.html'`. La sección de personaje con el escaneo es asíncrona; el botón de escanear debe deshabilitarse mientras `scanning()` sea `true` para evitar llamadas paralelas.

---

### Tarea 7: Actualizar `BoardsLayoutComponent`

- **Ficheros**:
  - `src/app/features/boards/boards-layout.component.ts` (modificar)
  - `src/app/features/boards/boards-layout.component.html` (modificar)
- **Qué hace**:
  - En el `.ts`:
    - Importar `CardType` desde `board.model.ts`.
    - Añadir signal `isNewCard = signal(false)`.
    - Cambiar `onCardAdded()` para recibir `{ x: number; y: number; type: CardType }`:
      1. Llama a `boardService.addCard(board, position, type)` con el nuevo tercer parámetro.
      2. Persiste el tablero.
      3. Recupera la tarjeta recién creada (última del array `activeBoard().cards` tras persistir).
      4. Llama a `editingCard.set(nuevaTarjeta)` para abrir el modal inmediatamente.
      5. Llama a `isNewCard.set(true)`.
    - Añadir método `onCardEditCancelled()`:
      1. Si `isNewCard()` es `true`, elimina la tarjeta cuyo id es `editingCard()?.id` llamando a `onDeleteCard()`.
      2. Llama a `editingCard.set(null)` e `isNewCard.set(false)`.
    - Actualizar `onCardSaved()` para llamar `isNewCard.set(false)` antes de `editingCard.set(null)`.
  - En el `.html`:
    - En el binding de `(cardAdded)` de `<app-board-canvas>`: el evento ya emite `{ x, y, type }`, el binding se mantiene igual `(cardAdded)="onCardAdded($event)"`.
    - En `<app-card-editor-modal>`: añadir `[isNewCard]="isNewCard()"` y cambiar `(cancelled)="editingCard.set(null)"` por `(cancelled)="onCardEditCancelled()"`.
- **Depende de**: Tareas 1, 3, 4, 6.
- **Riesgo**: La lógica de "recuperar la tarjeta recién creada" depende de que `saveBoard` devuelva el tablero actualizado con el nuevo array de `cards`. `BoardService.saveBoard()` ya devuelve `BoardFile` actualizado, y `persistBoard()` llama a `activeBoard.set(saved)`, por lo que la tarjeta estará disponible en `activeBoard().cards` tras el `await persistBoard()`. El Implementer debe asegurarse de leer la tarjeta del estado actualizado, no del local.

---

## Orden de ejecución

1. Tarea 1 — `board.model.ts` (modelo base; todas las demás dependen de él)
2. Tarea 2 — `CharacterScanService` (servicio puro, sin dependencias UI)
3. Tarea 3 — `BoardService` (migración y firma de `addCard`)
4. Tarea 4 — `BoardCanvasComponent` (output con tipo)
5. Tarea 5 — `BoardCardComponent` (indicadores visuales)
6. Tarea 6 — `CardEditorModalComponent` (modal ampliado; usa servicio de Tarea 2)
7. Tarea 7 — `BoardsLayoutComponent` (integración final; usa todo lo anterior)

---

## Puntos de atención para el Implementer

### Restricción absoluta: sin templates inline

Todos los templates van en ficheros `.html` externos. El `card-editor-modal.component.ts` ya usa `templateUrl`; al reescribirse, debe conservar `templateUrl: './card-editor-modal.component.html'` y el `.html` debe reescribirse en su totalidad. No añadir `template: \`...\`` bajo ningún concepto.

### Migración de tarjetas antiguas

Las tarjetas existentes en disco no tienen el campo `type`. El `loadBoard()` de la Tarea 3 debe aplicar la migración en memoria (no reescribir el fichero) asignando `type: 'note'` a las tarjetas sin tipo. La migración persistirá la próxima vez que el usuario guarde el tablero (tras mover o editar una tarjeta).

### Escape de metacaracteres en regex

En `CharacterScanService`, el nombre del personaje y cada alias deben escaparse antes de construir el patrón `\b...\b`. Usar `str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` antes de `new RegExp(...)`.

### Firma de `addCard` con valor por defecto

El tercer parámetro `type: CardType = 'note'` tiene valor por defecto para no romper ningún otro sitio que pudiera llamar a `addCard` sin tipo (compatibilidad defensiva).

### Flujo "nueva tarjeta con modal inmediato"

El orden en `onCardAdded()` es crítico: primero persistir (para tener el ID real en disco), luego recuperar la tarjeta del `activeBoard()` actualizado, luego abrir el modal. Si el modal se abre antes de persistir, la tarjeta no existe en disco y un fallo posterior deja un estado inconsistente.

### `isNewCard` y cancelación

Cuando el usuario cancela un modal de tarjeta nueva, la tarjeta debe eliminarse del tablero. `onCardEditCancelled()` debe llamar a `onDeleteCard(editingCard()!.id)` antes de limpiar los signals. Esto garantiza que no queden tarjetas "fantasma" sin título ni tipo en el tablero.

### Colores por tipo vs. paleta libre

El `DEFAULT_COLORS_BY_TYPE` define el color inicial al crear una tarjeta de ese tipo. El editor debe seguir permitiendo cambiar el color libremente (la paleta completa sigue disponible en el modal). El color inteligente solo aplica en la creación, no sobreescribe ediciones posteriores.

### Apariciones como metadata no persistida automáticamente

El resultado del escaneo (`appearances`) no se persiste al abrir el modal, solo cuando el usuario hace click en "Escanear" y luego "Guardar". Si el usuario abre el modal de una tarjeta personaje existente, las apariciones se cargan desde `card().characterData?.appearances` (inicializan el signal), no se re-escanean automáticamente.
