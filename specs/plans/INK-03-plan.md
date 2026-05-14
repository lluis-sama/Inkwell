# Plan de implementación — INK-03

### Resumen

Crear los tres modelos de datos TypeScript, las utilidades de rutas de disco y los tres servicios core (`ProjectService`, `DocumentService`, `BoardService`) con toda la lógica de negocio basada en signals. No hay UI ni templates en esta spec: el resultado es un conjunto de ficheros `.ts` que compilan sin errores y cumplen los criterios de aceptación de la spec.

---

### Tareas

#### Tarea 1: Modelo de proyecto
- **Fichero**: `src/app/core/models/project.model.ts` (crear)
- **Qué hace**: Declara `Project`, `TreeNode`, `ProjectSettings` y la constante `DEFAULT_PROJECT_SETTINGS`. Tipos y constantes exactamente como los define la spec; no añadir ni quitar campos.
- **Depende de**: ninguna dependencia previa

#### Tarea 2: Modelo de documento
- **Fichero**: `src/app/core/models/document.model.ts` (crear)
- **Qué hace**: Declara `DocumentFile`, `Snapshot` y la constante `EMPTY_TIPTAP_CONTENT`. El campo `content` tipado como `object`, no como `any`.
- **Depende de**: ninguna dependencia previa

#### Tarea 3: Modelo de tablero
- **Fichero**: `src/app/core/models/board.model.ts` (crear)
- **Qué hace**: Declara `BoardFile`, `Card` y la constante `DEFAULT_CARD_COLORS` con los seis colores Catppuccin Mocha de la spec.
- **Depende de**: ninguna dependencia previa

#### Tarea 4: Barrel de modelos
- **Fichero**: `src/app/core/models/index.ts` (crear)
- **Qué hace**: Re-exporta todos los símbolos de `project.model.ts`, `document.model.ts` y `board.model.ts` con `export * from`.
- **Depende de**: Tareas 1, 2, 3

#### Tarea 5: Utilidades de rutas de disco
- **Fichero**: `src/app/shared/utils/project-paths.ts` (crear)
- **Qué hace**: Exporta las cinco funciones puras de construcción de rutas: `projectJsonPath`, `documentPath`, `documentsFolderPath`, `boardPath`, `boardsFolderPath`. Lógica de interpolación de strings; sin imports externos.
- **Depende de**: ninguna dependencia previa

#### Tarea 6: ProjectService
- **Fichero**: `src/app/core/services/project.service.ts` (crear)
- **Qué hace**: Servicio `@Injectable({ providedIn: 'root' })` con:
  - Signals: `project`, `basePath`, `isLoaded` (computed)
  - Métodos públicos: `openProject`, `createProject`, `save`, `updateTree`, `addNode`, `removeNode`, `renameNode`, `updateSettings`, `closeProject`, `getRecentProjects`, `addRecentProject`, `removeRecentProject`
  - Helpers privados (no exportados): `insertNode`, `deleteNode`, `renameNodeInTree`
  - `addNode` valida que el `parentId`, si se pasa, pertenece a un nodo de tipo `'folder'`; si apunta a un documento, lanzar error
  - `getRecentProjects` / `addRecentProject` / `removeRecentProject` usan `localStorage` con la clave `'inkwell-recent-projects'` y almacenan un array de strings (paths)
  - `createProject` llama a `TauriBridgeService.createProjectStructure(basePath)` y luego escribe `project.json` via `TauriBridgeService.writeJsonFile`
  - `openProject` lee `project.json` via `TauriBridgeService.readJsonFile`, parsea con `JSON.parse`, actualiza signals
  - `save` llama a `TauriBridgeService.writeJsonFile` con el proyecto serializado y `updatedAt = new Date().toISOString()`
  - IDs generados con `crypto.randomUUID()`
- **Depende de**: Tareas 1, 4, 5
- **Riesgo**: Los helpers recursivos de árbol (`insertNode`, `deleteNode`, `renameNodeInTree`) son la parte más propensa a errores. Prestar atención al caso base (raíz, array vacío) y a que `addNode` sin `parentId` inserta en el nivel raíz del árbol.

#### Tarea 7: DocumentService
- **Fichero**: `src/app/core/services/document.service.ts` (crear)
- **Qué hace**: Servicio `@Injectable({ providedIn: 'root' })` con:
  - `loadDocument(id)` — construye la ruta con `documentPath(basePath, id)` y llama a `TauriBridgeService.readJsonFile`; parsea JSON y devuelve `DocumentFile`
  - `saveDocument(doc)` — actualiza `updatedAt` y llama a `TauriBridgeService.writeJsonFile`
  - `createDocument(title, parentId?)` — crea un `DocumentFile` con `EMPTY_TIPTAP_CONTENT`, llama a `ProjectService.addNode('document', title, parentId)` y luego `saveDocument`
  - `deleteDocument(id)` — llama a `TauriBridgeService.deleteJsonFile` y luego a `ProjectService.removeNode(id)`
  - `createSnapshot(doc, label?)` — crea snapshot con `structuredClone(doc.content)`, lo prepend al array, aplica FIFO respetando `project().settings.maxSnapshots`, guarda
  - `restoreSnapshot(doc, snapshotId)` — guarda snapshot del estado actual antes de restaurar; reemplaza `content` con el snapshot elegido; guarda
  - `deleteSnapshot(doc, snapshotId)` — filtra el snapshot y guarda
  - Helper privado `requireBasePath()` — lanza error si `ProjectService.basePath()` es null
- **Depende de**: Tareas 2, 4, 5, 6
- **Riesgo**: `createSnapshot` debe usar `structuredClone()` (API nativa) para clonar el contenido TipTap — nunca spread ni `JSON.parse(JSON.stringify(...))`. La lógica FIFO elimina el último elemento (el más antiguo, índice `length - 1`) cuando se supera `maxSnapshots`.

#### Tarea 8: BoardService
- **Fichero**: `src/app/core/services/board.service.ts` (crear)
- **Qué hace**: Servicio `@Injectable({ providedIn: 'root' })` con:
  - `loadBoard(id)` — lee y parsea JSON del disco
  - `saveBoard(board)` — actualiza `updatedAt` y escribe a disco
  - `createBoard(title)` — crea `BoardFile` con `cards: []` y guarda
  - `deleteBoard(id)` — borra el archivo del disco
  - `listBoardIds()` — llama a `TauriBridgeService.listJsonFiles(boardsFolderPath(basePath))` y extrae los IDs del nombre de fichero (sin extensión `.json`)
  - `addCard(board, position, title?)` — crea `Card` con `crypto.randomUUID()`, color rotativo de `DEFAULT_CARD_COLORS` según `board.cards.length % DEFAULT_CARD_COLORS.length`, dimensiones por defecto (200×150), y `title` default `'Nueva tarjeta'` si no se pasa
  - `updateCard(board, updatedCard)` — reemplaza la tarjeta con el mismo `id` en el array `cards`
  - `deleteCard(board, cardId)` — filtra el array `cards` y guarda
  - Helper privado `requireBasePath()`
- **Depende de**: Tareas 3, 4, 5, 6

#### Tarea 9: Barrel de servicios
- **Fichero**: `src/app/core/services/index.ts` (crear)
- **Qué hace**: Re-exporta con `export * from` los cinco servicios: `tauri-bridge.service`, `theme.service`, `project.service`, `document.service`, `board.service`.
- **Depende de**: Tareas 6, 7, 8

---

### Orden de ejecución

1. Tarea 1 — `project.model.ts`
2. Tarea 2 — `document.model.ts`
3. Tarea 3 — `board.model.ts`
4. Tarea 4 — `models/index.ts`
5. Tarea 5 — `project-paths.ts`
6. Tarea 6 — `project.service.ts`
7. Tarea 7 — `document.service.ts`
8. Tarea 8 — `board.service.ts`
9. Tarea 9 — `services/index.ts`

---

### Puntos de atención para el Implementer

**Convenciones obligatorias del proyecto**

- Signals: `signal()`, `computed()`. Sin `BehaviorSubject`, sin `Observable`, sin `Subject`.
- Zoneless confirmado: `provideZonelessChangeDetection()` ya está en `app.config.ts`.
- Todos los servicios son `@Injectable({ providedIn: 'root' })` — sin NgModules.
- `TauriBridgeService` es el único lugar con `invoke()`. Los servicios lo inyectan via constructor; no lo importan directamente.
- IDs: `crypto.randomUUID()`. Sin `uuid` ni nanoid.
- Strict mode activo: sin `any`. El contenido TipTap es `object`.

**Invocación a Tauri — args en camelCase**

`TauriBridgeService.listJsonFiles` ya espera `folderPath` (camelCase). Es importante que el Implementer use los nombres de parámetro exactos que expone el servicio, no los nombres Rust.

**Helpers recursivos del árbol (`ProjectService`)**

Los tres helpers privados (`insertNode`, `deleteNode`, `renameNodeInTree`) operan sobre `TreeNode[]`. Punto de mayor riesgo lógico de toda la spec. Cubrir mentalmente los casos: nodo en raíz, nodo anidado N niveles, id inexistente (no lanzar error, retornar el árbol sin cambios).

**`addNode` con `parentId` apuntando a documento**

Si `parentId` existe en el árbol pero es de tipo `'document'`, el método debe lanzar un `Error` explícito (p.ej. `'Cannot add children to a document node'`). No insertar silenciosamente.

**`createSnapshot` — FIFO estricto**

El snapshot nuevo se prepend al array (índice 0 = más reciente). Cuando `snapshots.length > maxSnapshots`, se elimina el último elemento (el más antiguo). `structuredClone()` es obligatorio para el clonado del contenido.

**`restoreSnapshot` — guardar antes de restaurar**

Antes de aplicar el contenido del snapshot elegido, `restoreSnapshot` debe llamar a `createSnapshot(doc)` sin label para preservar el estado previo. Solo después reemplazar `content`.

**`boardService.addCard` — `position` vs dimensiones por defecto**

`position` lleva `x` e `y`. `width` y `height` se fijan a valores por defecto (200×150 px). El color se rota por índice sobre `DEFAULT_CARD_COLORS`.

**Sin commits de git**

El Implementer no hace `git commit` al finalizar ninguna tarea ni al terminar la spec. El usuario hace el commit manualmente tras el testing.
