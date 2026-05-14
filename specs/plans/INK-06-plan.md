## Plan de implementación — INK-06

### Resumen

Añadir un sistema de toast global reutilizable (éxito/error, auto-dismiss, click-to-close)
y un panel lateral de historial de snapshots que se integra en el layout del editor.
El panel permite ver, previsualizar, renombrar, restaurar y eliminar snapshots del documento
activo. La franja "IA" del layout se convierte en lógica condicional: muestra el panel de
snapshots o la franja "IA" placeholder según el estado de la UI.

---

### Tareas

#### Tarea 1: ToastService
- **Fichero**: `src/app/shared/services/toast.service.ts` (crear)
- **Qué hace**: Servicio `providedIn: 'root'` con un signal `toasts = signal<Toast[]>([])`.
  Expone dos métodos públicos: `success(message: string): void` y
  `error(message: string): void`. Cada llamada añade un objeto `Toast` con
  `id` (crypto.randomUUID()), `message`, `type: 'success' | 'error'` y
  `duration` (3000 para success, 5000 para error). Tras añadir cada toast, programa
  su auto-eliminación con `setTimeout(() => this.dismiss(id), duration)`.
  Método `dismiss(id: string): void` filtra el toast del signal.
  No hay dependencias de Angular fuera de `inject` y `signal`.
- **Depende de**: ninguna dependencia previa

---

#### Tarea 2: InkToastComponent — clase TypeScript
- **Fichero**: `src/app/shared/components/ink-toast.component.ts` (crear)
- **Qué hace**: Componente standalone que inyecta `ToastService` y expone su signal
  `toasts()` para el template. Tiene un método `dismiss(id: string)` que delega al
  servicio. Usa `templateUrl: './ink-toast.component.html'`. No recibe inputs; opera
  exclusivamente sobre el signal del servicio.
- **Depende de**: Tarea 1

---

#### Tarea 3: InkToastComponent — template HTML
- **Fichero**: `src/app/shared/components/ink-toast.component.html` (crear)
- **Qué hace**: Contenedor fijo en la parte inferior central de la pantalla
  (`fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50`).
  Itera los toasts con `@for`. Cada toast es un `div` con click `(click)="dismiss(toast.id)"`,
  estilos condicionales según `toast.type` (`bg-ink-success text-ink-panel` para
  success, `bg-ink-danger text-ink-panel` para error), padding, rounded y sombra.
  Muestra `{{ toast.message }}` interpolado. No usa `@switch` ni lógica de flecha
  en el template.
- **Depende de**: Tarea 2
- **Riesgo**: Los colores `ink-success` e `ink-danger` deben existir en la config de
  Tailwind. Verificar en `tailwind.config.js` antes de usar. Si no existen como tokens
  directos, usar las clases que ya emplea el proyecto (p.ej. `text-ink-success` se
  usa en `editor-top-bar.component.html` — confirmar que también existe el `bg-`
  correspondiente o usar clases de Tailwind estándar equivalentes).

---

#### Tarea 4: Registrar InkToastComponent en AppComponent
- **Fichero**: `src/app/app.component.ts` (modificar)
- **Qué hace**: Añadir `InkToastComponent` al array `imports` del decorador.
- **Fichero**: `src/app/app.component.html` (modificar)
- **Qué hace**: Añadir `<app-ink-toast />` como último elemento del template (junto al
  `<router-outlet />`). El componente se posiciona con `fixed` por lo que su posición
  en el DOM no afecta al layout.
- **Depende de**: Tarea 2, Tarea 3

---

#### Tarea 5: SnapshotsPanelComponent — clase TypeScript
- **Fichero**: `src/app/features/editor/snapshots/snapshots-panel.component.ts` (crear)
- **Qué hace**: Componente standalone con los siguientes inputs, outputs y signals
  internos:

  **Inputs** (signal inputs):
  - `document = input.required<DocumentFile>()`

  **Outputs**:
  - `closed = output<void>()`
  - `documentChanged = output<DocumentFile>()` — emite el documento actualizado tras
    restaurar o eliminar un snapshot

  **Signals internos**:
  - `expandedId = signal<string | null>(null)` — ID del snapshot con preview expandido
  - `editingId = signal<string | null>(null)` — ID del snapshot cuya etiqueta se está editando
  - `editingLabel = signal<string>('')` — valor actual del input de etiqueta en edición

  **Métodos**:
  - `snapshots(): Snapshot[]` — computed que devuelve `[...this.document().snapshots].reverse()`
  - `togglePreview(id: string): void` — alterna `expandedId` (si ya es ese id, lo pone a null)
  - `previewText(snapshot: Snapshot): string` — llama a `tiptapToText(snapshot.content)`
  - `startEdit(snapshot: Snapshot): void` — pone `editingId` al id del snapshot y
    `editingLabel` a su label actual (o cadena vacía si no tiene)
  - `confirmEdit(): void` — si `editingId()` no es null, actualiza el label del snapshot
    en el documento, llama a `docService.saveDocument(...)`, emite `documentChanged` con
    el resultado y resetea `editingId` y `editingLabel`
  - `cancelEdit(): void` — resetea `editingId` y `editingLabel`
  - `onLabelKeydown(event: KeyboardEvent): void` — si `event.key === 'Enter'`, llama
    a `confirmEdit()`; si `event.key === 'Escape'`, llama a `cancelEdit()`. Este método
    existe para evitar arrow functions en el template.
  - `restore(snapshotId: string): void` — async; llama a
    `docService.restoreSnapshot(doc, snapshotId)`, luego `docService.saveDocument(...)`,
    emite `documentChanged` con el resultado y llama a `toastService.success(...)` con
    un mensaje fijo en español/inglés (ver Puntos de atención)
  - `delete(snapshotId: string): void` — async; llama a
    `docService.deleteSnapshot(doc, snapshotId)`, luego `docService.saveDocument(...)`,
    emite `documentChanged` con el resultado

  **Inyecciones**: `DocumentService`, `ToastService`

  Usa `templateUrl: './snapshots-panel.component.html'`.
- **Depende de**: Tarea 1, Tarea 3 (tiptapToText)
- **Riesgo**: `confirmEdit` necesita reconstruir el array de snapshots con el label
  actualizado sin mutar el estado. Debe hacer `doc.snapshots.map(s => s.id === id ? {...s, label} : s)`.
  El `docService.saveDocument` es async — el método debe ser `async` y esperar el resultado
  antes de emitir.

---

#### Tarea 6: SnapshotsPanelComponent — template HTML
- **Fichero**: `src/app/features/editor/snapshots/snapshots-panel.component.html` (crear)
- **Qué hace**: Panel con estructura fija:

  **Header**: título "Historial" + botón × que emite `closed`.

  **Lista de snapshots** con `@for (snapshot of snapshots(); track snapshot.id)`:
  - Cada ítem muestra:
    - Fecha relativa del snapshot: interpolar `snapshot.createdAt` formateada.
      Dado que no hay pipe de fecha relativa disponible, el componente expone un
      método `formatDate(isoString: string): string` que devuelve una cadena legible
      (p.ej. `new Date(isoString).toLocaleString()`). No usar arrow functions en el
      template; llamar al método del componente.
    - Label del snapshot (si existe): `{{ snapshot.label }}`
    - Botón "Ver preview" / "Ocultar" que llama a `togglePreview(snapshot.id)`
    - Bloque `@if (expandedId() === snapshot.id)` con el texto de preview:
      `{{ previewText(snapshot) }}`
    - Sección de edición de label: `@if (editingId() === snapshot.id)` muestra
      un input `[value]="editingLabel()"` con `(input)` para actualizar `editingLabel`
      y `(keydown)="onLabelKeydown($event)"`. Un botón "Cancelar" llama a `cancelEdit()`.
      Si no está en modo edición, mostrar el label actual (o guión si no tiene) y un
      botón con icono lápiz que llama a `startEdit(snapshot)`.
    - Botones de acción: "Restaurar" que llama a `restore(snapshot.id)` y "Eliminar"
      que llama a `delete(snapshot.id)`.

  **Footer**: texto "N de M snapshots" donde N es `snapshots().length` y M es el
  `maxSnapshots` del proyecto (exponer como método o computed en el componente).

  No se usan arrow functions en el template. No se usa el operador `as` para casts.
- **Depende de**: Tarea 5
- **Riesgo**: El input de edición de label requiere que `editingLabel` se actualice
  con `(input)` y no con `(change)` para que el signal refleje el valor en tiempo real
  antes de que el usuario pulse Enter. El evento `(input)` debe llamar a un método del
  componente (no a una arrow function), p.ej. `onLabelInput($event)`.

---

#### Tarea 7: EditorTopBarComponent — añadir input y output para snapshots
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.ts` (modificar)
- **Qué hace**: Añadir dos nuevos miembros al componente:
  - `showSnapshots = input<boolean>(false)` — input signal
  - `snapshotsPanelToggled = output<void>()` — output
  El resto del componente permanece sin cambios.
- **Depende de**: ninguna dependencia previa (puede hacerse en paralelo con Tareas 1-6,
  pero se listan aquí para claridad de orden)

---

#### Tarea 8: EditorTopBarComponent — añadir botón de historial al template
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.html` (modificar)
- **Qué hace**: Insertar un botón de reloj (icono SVG de reloj) justo antes del
  separador que precede al botón de snapshot. El botón:
  - `(click)="snapshotsPanelToggled.emit()"`
  - `[disabled]="!documentTitle()"` — deshabilitado cuando no hay documento
  - `title="Historial de versiones"` (o similar)
  - Clases iguales a los demás botones de la barra
  - Cuando `showSnapshots()` es true, aplicar una clase adicional que lo marque como
    activo (p.ej. `text-ink-accent` en lugar de `text-ink-subtle`)
  El cambio de color activo/inactivo debe gestionarse con una expresión de clases
  condicional `[class.text-ink-accent]="showSnapshots()"` o similar, sin arrow
  functions.
- **Depende de**: Tarea 7

---

#### Tarea 9: EditorLayoutComponent — clase TypeScript
- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**: Cuatro cambios sobre el fichero actual:
  1. Cambiar `private projectService` a `protected projectService` para que el
     template pueda acceder a `projectService.project()?.settings.maxSnapshots`.
  2. Añadir signal: `showSnapshotsPanel = signal<boolean>(false)`.
  3. Añadir método `toggleSnapshotsPanel(): void` que hace
     `this.showSnapshotsPanel.update(v => !v)`.
  4. Añadir método `onDocumentRestoredFromPanel(doc: DocumentFile): void` que
     llama a `this.activeDocument.set(doc)` y `this.isDirty = false` y
     `this.saveStatus.set('saved')`.
  5. Añadir `SnapshotsPanelComponent` al array `imports`.
  El resto del componente permanece sin cambios.
- **Depende de**: Tarea 5, Tarea 6, Tarea 7

---

#### Tarea 10: EditorLayoutComponent — template HTML
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**: Dos cambios en el template existente:

  **Cambio 1 — Top bar**: añadir los dos nuevos bindings en `<app-editor-top-bar>`:
  - `[showSnapshots]="showSnapshotsPanel()"`
  - `(snapshotsPanelToggled)="toggleSnapshotsPanel()"`

  **Cambio 2 — Franja lateral**: reemplazar el bloque del placeholder "IA" por lógica
  condicional. El bloque actual es:
  ```
  @if (!focusMode()) {
    <div class="w-8 shrink-0 border-l border-ink-border bg-ink-panel ...">
      <span ... >IA</span>
    </div>
  }
  ```
  Debe convertirse en:
  - `@if (showSnapshotsPanel() && !focusMode())` → mostrar
    `<app-snapshots-panel [document]="activeDocument()!" (closed)="toggleSnapshotsPanel()" (documentChanged)="onDocumentRestoredFromPanel($event)" />`
    dentro de un `div` con ancho fijo adecuado (p.ej. `w-72 shrink-0 border-l border-ink-border bg-ink-panel overflow-y-auto`)
  - `@else if (!focusMode())` → mostrar la franja "IA" original (sin cambios)

  El panel de snapshots solo debe mostrarse si `activeDocument()` no es null para
  evitar pasar null al input requerido. Usar
  `@if (showSnapshotsPanel() && !focusMode() && activeDocument())` para el panel,
  y `@else if (!focusMode())` para la franja IA.
- **Depende de**: Tarea 9
- **Riesgo**: El input `document` de `SnapshotsPanelComponent` es `input.required`,
  así que si se pasa null Angular lanzará un error en tiempo de compilación o runtime.
  El `@if` que verifica `activeDocument()` debe estar en la condición del bloque, no
  dentro del template del componente.

---

### Orden de ejecución

1. Tarea 1 — ToastService
2. Tarea 2 — InkToastComponent (clase .ts)
3. Tarea 3 — InkToastComponent (template .html)
4. Tarea 4 — Registrar InkToastComponent en AppComponent
5. Tarea 5 — SnapshotsPanelComponent (clase .ts)
6. Tarea 6 — SnapshotsPanelComponent (template .html)
7. Tarea 7 — EditorTopBarComponent (añadir input/output)
8. Tarea 8 — EditorTopBarComponent (añadir botón historial al template)
9. Tarea 9 — EditorLayoutComponent (modificar clase .ts)
10. Tarea 10 — EditorLayoutComponent (modificar template .html)

---

### Puntos de atención para el Implementer

**Convenciones obligatorias (recordatorio):**

- `templateUrl` externo en todos los componentes. Nunca `template:` inline.
- Standalone: true en todos los componentes.
- Signals everywhere. Sin BehaviorSubject.
- Zoneless: sin NgZone ni ChangeDetectorRef.
- No arrow functions en templates Angular (el compilador interpreta `>` como
  mayor-que). Extraer toda lógica a métodos del componente.
- No TypeScript casts en templates (`as HTMLInputElement` no es válido). Usar métodos.
- Tokens CSS `--ink-*`. Nunca `--ctp-*`.

**Colores del toast:**

Los tokens `bg-ink-success` y `bg-ink-danger` pueden no existir como clases de
Tailwind directas aunque `text-ink-success` y `text-ink-danger` sí existen (se ven
en el top-bar). Verificar en `tailwind.config.js`. Si solo están definidos como custom
properties CSS pero no como colores de Tailwind, usar la sintaxis
`style="background-color: var(--ink-success)"` o similar en el template del toast,
o añadir las clases `bg-*` al safelist. No inventar tokens que no existen.

**Mensaje del toast de restauración:**

`toastService.success(...)` recibe un string literal. Dado que la spec indica que no
hay claves i18n nuevas, usar un string literal en el idioma por defecto del proyecto
(español en la UI actual). Valor sugerido: `'Snapshot restaurado'`. Si el proyecto
usa TranslocoService en otros componentes para mensajes similares, inyectarlo también
en SnapshotsPanelComponent y buscar si hay una clave existente reutilizable. Si no la
hay, usar el literal.

**Método `formatDate` en SnapshotsPanelComponent:**

La spec menciona "fecha relativa formateada". Implementar con `toLocaleString()` nativo
(sin librería externa). El Implementer puede enriquecer con lógica "hace X minutos /
hoy / ayer" si lo desea, pero no es obligatorio. Lo que sí es obligatorio: no usar
arrow functions en el template para formatear la fecha.

**`confirmEdit` es async:**

`docService.saveDocument` devuelve una Promise. `confirmEdit` debe ser `async` y
esperar el resultado con `await` antes de emitir `documentChanged`. De lo contrario
el documento emitido no tiene el `updatedAt` actualizado.

**`restore` y `delete` son async:**

Ambos métodos llaman a `docService.saveDocument`. Deben ser `async` y esperar el
resultado. El toast de éxito en `restore` debe llamarse solo tras el `await` exitoso.

**Restricciones (Lo que NO hacer):**

- No implementar el panel de IA (INK-08).
- No añadir confirmación de "¿Seguro que quieres restaurar?".
- No implementar diff visual entre snapshots.
- No añadir claves nuevas a los ficheros i18n (la spec lo indica explícitamente).

**Verificación entre tareas:**

- Tras la Tarea 4: confirmar que el toast aparece en la pantalla (aunque sea con un
  mensaje de prueba mental — no ejecutar código de test, solo verificar que compila).
- Tras la Tarea 6: ejecutar `pnpm run build` para verificar que SnapshotsPanelComponent
  compila sin errores antes de integrarlo en el layout.
- Tras la Tarea 10: verificar que el template no contiene ninguna arrow function (`=>`).
