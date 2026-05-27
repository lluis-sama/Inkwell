## Plan de implementación — INK-31

### Resumen
Spec de correcciones puntuales y mejoras de UX sobre la interfaz existente. Se intercambian iconos invertidos, se limita el ancho del modal de Settings, se añade selección de texto al autofocus del rename del binder, se equipara el binder del cajón al principal añadiendo soporte de carpetas, y se convierte la barra de filtros de estado en un desplegable dentro del toolbar. Ningún cambio afecta la arquitectura subyacente.

### Tareas

#### Tarea 1: FIX-1 — Intercambiar iconos de importar y exportar
- **Fichero**: `src/app/features/editor/binder/binder.component.html` (modificar)
- **Qué hace**: Localiza el botón "Importar documentos" (líneas 47-54 del informe). El icono SVG actual contiene una flecha hacia ARRIBA (`polyline points="17,8 12,3 7,8"`). Reemplázalo por el SVG completo del botón Exportar, que tiene la flecha hacia ABAJO (`polyline points="7,10 12,15 17,10"`).
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Ninguno; solo se intercambian los bloques `<svg>`.

#### Tarea 2: FIX-1 — Intercambiar iconos de importar y exportar (parte 2)
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.html` (modificar)
- **Qué hace**: Localiza el botón "Exportar" (líneas 138-143 del informe). El icono SVG actual contiene una flecha hacia ABAJO. Reemplázalo por el SVG completo del botón Importar, que tiene la flecha hacia ARRIBA.
- **Depende de**: Tarea 1
- **Riesgo**: Ninguno; solo se intercambian los bloques `<svg>`.

#### Tarea 3: FIX-2 — Limitar ancho máximo del contenido de Settings
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**: En el wrapper interior del contenido (línea 22 del informe), cambiar:
  ```html
  <div class="flex-1 px-6 py-4 min-h-72">
  ```
  por:
  ```html
  <div class="flex-1 px-6 py-4 min-h-72 w-full max-w-[720px] mx-auto">
  ```
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Ninguno.

#### Tarea 4: FIX-3 — Añadir select() al autofocus de rename
- **Fichero**: `src/app/features/editor/binder/binder-node.component.ts` (modificar)
- **Qué hace**: En el `constructor()`, dentro del `effect()` que ya existe (líneas 59-66 del informe), modificar el cuerpo del `setTimeout` para que, después de `focus()`, también llame a `select()`:
  ```typescript
  setTimeout(() => {
    this.renameInputEl?.nativeElement.focus();
    this.renameInputEl?.nativeElement.select();
  }, 0);
  ```
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Ninguno; la estructura del effect ya está probada.

#### Tarea 5: FIX-4 — Preparar modelo y servicio para árbol de desk notes
- **Fichero**: `src/app/core/services/project.service.ts` (modificar)
- **Qué hace**: Revisar `loadDeskNotesTree()` (líneas 186-200 del informe). Actualmente devuelve una lista plana de documentos. Modificarla para que devuelva `TreeNode[]` (igual que el árbol principal). Si `Project` o la estructura en disco no tienen un campo de árbol para desk notes (por ejemplo, `deskNotesTree: TreeNode[]`), añadirlo al modelo y asegurar que `loadDeskNotesTree()` lo lee y `saveDeskNotesTree()` (o equivalente) lo persiste.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Media. Puede requerir tocar `project.model.ts` si falta el campo de árbol en `Project`. Verificar que no se rompa la carga de proyectos antiguos (sin el campo). Si falta, asignar un array vacío por defecto.

#### Tarea 6: FIX-4 — Reescribir desk-binder para usar BinderNodeComponent y toolbar completo
- **Ficheros**:
  - `src/app/features/editor/desk/desk-binder.component.ts` (modificar)
  - `src/app/features/editor/desk/desk-binder.component.html` (modificar)
- **Qué hace**:
  1. En el `.ts`: eliminar la lógica plana actual. Importar `BinderNodeComponent`. Exponer un signal `treeNodes = signal<TreeNode[]>([])` que se cargue vía `ProjectService.loadDeskNotesTree()`. Añadir métodos `addDeskDocument()` y `addDeskFolder()` que creen un nodo nuevo (documento o carpeta) y lo inserten en el árbol usando las utilidades de `ProjectService` (por ejemplo, al final del array raíz). Inyectar `ProjectService` si no está ya.
  2. En el `.html`: eliminar el template plano actual. Reemplazarlo por una instancia de `<app-binder-node>` (o el selector correspondiente) iterando sobre `treeNodes()`, de forma idéntica al binder principal. Añadir en el toolbar un botón "Nueva carpeta" junto al botón de nuevo documento, ambos usando los handlers del punto anterior.
  3. Asegurar que el componente pasa el contexto correcto a `BinderNodeComponent` para que el drag & drop, rename, context menu y colapso funcionen igual que en el binder principal.
- **Depende de**: Tarea 4 (modelo/servicio) y Tarea 3 (autofocus en rename de carpetas)
- **Riesgo**: Alta. Es el cambio más grande de la spec. `BinderNodeComponent` es recursivo y auto-importado; verificar que los inputs/outputs y el manejo de eventos (borrado de carpeta → mover documentos a raíz) funcionen sin duplicar lógica. Si `BinderNodeComponent` tiene dependencias de estado global del binder principal (por ejemplo, signals de `BinderComponent`), puede ser necesario inyectar `ProjectService` en `DeskBinderComponent` y pasar los callbacks correctos.

#### Tarea 7: FIX-5 — Migrar signal de filtro y reemplazar barra plana por dropdown
- **Fichero**: `src/app/features/editor/binder/binder.component.ts` (modificar)
- **Qué hace**:
  1. Buscar `statusFilter = signal<DocumentStatus | 'all'>('all')` y reemplazarlo por `activeFilter = signal<DocumentStatus | null>(null)`.
  2. Ajustar todas las referencias a `statusFilter` en el componente (métodos de filtrado, computeds, etc.) para que usen `activeFilter` y comparen contra `null` en lugar de `'all'`.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Baja. Revisar que no haya otros componentes importando `statusFilter` desde fuera.

#### Tarea 8: FIX-5 — Implementar dropdown inline de filtros en el template del binder
- **Fichero**: `src/app/features/editor/binder/binder.component.html` (modificar)
- **Qué hace**:
  1. Eliminar la barra horizontal de botones de estado actual (líneas 66-87 del informe, el bloque `@for (entry of statusEntries)`).
  2. En el toolbar del binder (donde están los botones de crear documento y carpeta), añadir un botón "Filtros".
     - Sin filtro activo: texto `Filtros ▾`.
     - Con filtro activo: muestra el círculo de color del estado, el nombre del estado y `▾` (por ejemplo, `● En progreso ▾`). El estado activo se lee de `activeFilter()`.
  3. Al hacer clic en el botón, mostrar un dropdown inline (puede implementarse con `@if` y un div posicionado absolutamente, o con un `ink-dropdown` si existiera; el informe dice que no existe componente reutilizable, así que usar un bloque inline). El dropdown listará:
     - "Sin filtro" → llama a `activeFilter.set(null)` y cierra el dropdown.
     - Cada estado disponible → llama a `activeFilter.set(status)` y cierra el dropdown.
  4. Usar un signal local `filterDropdownOpen = signal(false)` para controlar la visibilidad. Cerrar al hacer clic fuera (opcional pero recomendado; si es complejo, un `@HostListener('document:click')` o un overlay simple es suficiente).
- **Depende de**: Tarea 7 (migración del signal)
- **Riesgo**: Media. Asegurar que el dropdown no desplace el layout ni interfiera con los botones de toolbar. No crear un componente nuevo a menos que sea estrictamente necesario; inline es suficiente.

### Orden de ejecución
1. Tarea 1 (FIX-1, parte 1)
2. Tarea 2 (FIX-1, parte 2)
3. Tarea 3 (FIX-2)
4. Tarea 4 (FIX-3)
5. Tarea 5 (FIX-4, preparar modelo/servicio)
6. Tarea 6 (FIX-4, reescribir desk-binder)
7. Tarea 7 (FIX-5, migrar signal)
8. Tarea 8 (FIX-5, dropdown inline)

### Puntos de atención para el Implementer

- **FIX-1**: Solo intercambiar los bloques `<svg>...</svg>` completos. No modificar handlers, clases CSS, textos de tooltip ni atributos `aria-label`.
- **FIX-2**: Aplicar `max-w-[720px] mx-auto` únicamente sobre el wrapper interior del contenido del modal, no sobre el fondo overlay ni sobre la ventana completa. El fondo debe seguir cubriendo toda la pantalla.
- **FIX-3**: No crear una directiva `AutoFocus`. La solución es añadir `.select()` dentro del `effect()` existente en `binder-node.component.ts`. El `setTimeout(0)` ya está presente; asegurar que `select()` se llame después de `focus()` dentro del mismo callback.
- **FIX-4 — Reutilización**: `BinderNodeComponent` es recursivo y standalone. Verificar que sus `@Input()` y `@Output()` permitan usarlo desde `DeskBinderComponent` sin acoplarlo al binder principal. Si `BinderNodeComponent` espera un signal o un contexto que solo existe en `BinderComponent`, puede ser necesario refactorizar mínimamente `BinderNodeComponent` para que acepte callbacks o un servicio común.
- **FIX-4 — Persistencia**: `loadDeskNotesTree()` actualmente devuelve documentos planos. Antes de modificar `desk-binder.component.ts`, asegurar que `ProjectService` puede leer y escribir un `TreeNode[]` para desk notes. Si `Project` no tiene campo de árbol para desk notes, añadirlo (por ejemplo, `deskNotesTree?: TreeNode[]`) con un default a `[]` para backward compatibility.
- **FIX-4 — Borrado de carpetas**: La spec dice que al borrar una carpeta del desk binder, sus documentos deben moverse al nivel raíz (no borrado en cascada). Verificar que `BinderNodeComponent` reutilizado desde el desk binder ejecute la misma lógica de `ProjectService` que en el binder principal (probablemente ya esté implementada en `deleteNode` o similar del servicio).
- **FIX-5 — Signal**: Migrar de `statusFilter = signal<DocumentStatus | 'all'>('all')` a `activeFilter = signal<DocumentStatus | null>(null)`. Revisar todos los usos en el `.ts` y en el `.html` del binder. No persistir el valor del filtro en disco; es estado de sesión.
- **FIX-5 — Dropdown**: No crear un componente compartido nuevo para el dropdown. Implementarlo inline en `binder.component.html` con un signal de visibilidad. Si se detecta que ya existe un componente de popover/dropdown compartido (que el Explorer no encontró), entonces usarlo; de lo contrario, inline.
- **General**: Seguir convenciones del proyecto: standalone components, signals, zoneless, sin `NgZone`, `TauriBridgeService` como único punto de contacto con Tauri, IDs vía `crypto.randomUUID()`, estilos con TailwindCSS.