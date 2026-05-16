# Plan de implementación — INK-13

## Resumen

Esta spec añade cuatro mejoras de calidad de vida al editor de Inkwell: objetivo de palabras por sesión (con popover y barra de progreso en el binder footer), modo máquina de escribir (centrado vertical del cursor), backup manual del proyecto como ZIP, y un modal de referencia de atajos de teclado. El trabajo se organiza en cuatro bloques independientes que pueden desarrollarse en paralelo conceptualmente, pero se ordenan para respetar las dependencias entre componentes.

---

## Decisión arquitectónica: Opción A para el session goal

El `BinderFooterComponent` vive dentro de `BinderComponent`, no en `EditorLayoutComponent`. La spec define que los signals de sesión (`sessionGoal`, `sessionWordsAdded`, etc.) viven en `EditorLayoutComponent`.

Se elige la **Opción A**: añadir inputs pass-through en `BinderComponent` que reenvíen los valores de sesión desde `EditorLayoutComponent` hacia `BinderFooterComponent`, y un output `goalChanged` que suba en sentido inverso.

**Motivo**: mover `BinderFooterComponent` fuera de `BinderComponent` (Opción B) rompería la cohesión del binder como unidad y requeriría reestructurar el layout HTML de `EditorLayoutComponent` de forma invasiva. La Opción A es aditiva y localizada.

**Flujo de datos:**
```
EditorLayoutComponent
  signals: sessionGoal, sessionWordsAdded, sessionProgress, sessionGoalReached
  ↓ inputs: [sessionGoal] [sessionWordsAdded] [sessionProgress] [sessionGoalReached] [totalWordCount]
BinderComponent
  inputs declarados → reenvíados hacia BinderFooterComponent
  ↑ output goalChanged → sube a EditorLayoutComponent
BinderFooterComponent
  renderiza barra + popover + stats
  output goalChanged → sube a BinderComponent → sube a EditorLayoutComponent
```

---

## Tareas

### Tarea 1: Signals de sesión en EditorLayoutComponent

- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**:
  - Añadir cuatro signals: `sessionGoal = signal<number>(0)`, `sessionWordsAdded = signal<number>(0)`, `sessionBaseCount = signal<number>(0)`, `typewriterMode = signal(false)`
  - Añadir dos computeds: `sessionProgress` y `sessionGoalReached` (fórmulas exactas en la spec)
  - Inyectar `ToastService` (ya debe existir en el proyecto como `toast`)
  - En `openDocument()`: si `sessionBaseCount() === 0`, llamar a `sessionBaseCount.set(this.projectService.totalWordCount())` justo después de que el documento quede cargado
  - En `saveCurrentDocument()`: capturar `wasReached = this.sessionGoalReached()` ANTES de actualizar palabras; luego calcular `newAdded = Math.max(0, newTotal - this.sessionBaseCount())` y llamar a `sessionWordsAdded.set(newAdded)`; si `!wasReached && this.sessionGoalReached()` mostrar toast de felicitación
  - `newTotal` se obtiene de `this.projectService.totalWordCount()` DESPUÉS de que `docService.saveDocument()` haya actualizado el word count cache
- **Depende de**: ninguna dependencia previa
- **Riesgo**: el orden de operaciones en `saveCurrentDocument()` es crítico. `totalWordCount()` debe leerse después de que `docService.saveDocument()` haya escrito el archivo y actualizado el cache en `ProjectService`. Verificar que `DocumentService.saveDocument()` actualiza el word count cache antes de resolver la promesa.

---

### Tarea 2: Modificar BinderFooterComponent (template inline + lógica)

- **Fichero**: `src/app/features/editor/binder/binder-footer.component.ts` (modificar — reescribir clase y migrar a template inline)
- **Fichero**: `src/app/features/editor/binder/binder-footer.component.html` (modificar — quedará vacío o se eliminará el contenido; la spec usa template inline)
- **Qué hace**:
  - Cambiar la clase al modelo de la spec: añadir inputs `sessionGoal`, `sessionWordsAdded`, `sessionProgress`, `sessionGoalReached`, `totalWordCount`; mantener `searchActive`
  - Añadir output `goalChanged = output<number>()`; mantener `searchToggled`
  - Añadir signal local `showGoalPopover = signal(false)`
  - Añadir métodos `applyGoal(value: string)`, `clearGoal()`, `onDocumentClick(event: MouseEvent)`, `formatCount(n: number)`
  - Añadir listener de host `(document:click)` para cerrar el popover al hacer click fuera
  - Migrar template al diseño de la spec: barra de progreso fina condicional arriba, fila principal con stats a la izquierda y botones (objetivo + búsqueda) a la derecha, popover del objetivo
  - La spec usa template inline (`template: \`...\``). Migrar a inline y dejar el HTML externo vacío (o eliminar su referencia en el decorador)
  - Eliminar los computeds `wordCount` y `wordCountK` del componente actual (reemplazados por el input `totalWordCount` + método `formatCount`)
  - Eliminar el import de `TranslocoPipe` si ya no se usa en el template nuevo (los textos del footer nuevo no usan transloco)
- **Depende de**: ninguna dependencia previa (es autocontenido con inputs)
- **Riesgo**: el componente actual usa `templateUrl` externo (`binder-footer.component.html`). Al migrar a template inline, el decorador debe cambiar de `templateUrl` a `template`. El fichero HTML externo puede quedar vacío o borrarse; si se borra, Angular no lo reclamará. Mantenerlo vacío es más seguro. El `host: { '(document:click)': 'onDocumentClick($event)' }` puede entrar en conflicto con el listener de host ya existente en `BinderComponent` (`(document:click): closeContextMenu()`); son listeners independientes y no hay conflicto real, pero el Implementer debe verificarlo.

---

### Tarea 3: Añadir inputs/outputs pass-through en BinderComponent

- **Fichero**: `src/app/features/editor/binder/binder.component.ts` (modificar)
- **Fichero**: `src/app/features/editor/binder/binder.component.html` (modificar)
- **Qué hace**:
  - En `binder.component.ts`: declarar cinco inputs nuevos: `sessionGoal = input<number>(0)`, `sessionWordsAdded = input<number>(0)`, `sessionProgress = input<number>(0)`, `sessionGoalReached = input<boolean>(false)`, `totalWordCount = input<number>(0)`; declarar un output nuevo `goalChanged = output<number>()`
  - En `binder.component.html` línea 95-97: ampliar el uso de `<app-binder-footer>` para pasar los cinco inputs nuevos y escuchar el output `(goalChanged)="goalChanged.emit($event)"`
- **Depende de**: Tarea 2 (para que los inputs/outputs de BinderFooterComponent estén definidos)

---

### Tarea 4: Conectar BinderComponent con EditorLayoutComponent (session goal)

- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**:
  - En el HTML: ampliar `<app-binder>` para pasar los inputs de sesión y escuchar `(goalChanged)="sessionGoal.set($event)"`. Añadir también `[totalWordCount]="projectService.totalWordCount()"`
  - En el TS: añadir `protected toast = inject(ToastService)` si no estaba ya inyectado (viene de la Tarea 1)
  - Verificar que el import de `ToastService` está en los imports del módulo/providers (es `providedIn: 'root'`, no hace falta declaración extra)
- **Depende de**: Tarea 1, Tarea 3

---

### Tarea 5: Modo máquina de escribir — TiptapEditorComponent

- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
- **Qué hace**:
  - Añadir input `typewriterMode = input<boolean>(false)`
  - En `ngAfterViewInit()`, en la configuración del Editor de TipTap, añadir dos callbacks: `onSelectionUpdate` y dentro del callback de `update`. En ambos: si `this.typewriterMode()` es true, llamar a `this.centerActiveLine()`
  - El callback `onSelectionUpdate` es un nuevo hook del Editor; el de `update` ya existe: hay que añadir la llamada a `centerActiveLine()` dentro del existente
  - Añadir método privado `centerActiveLine()` usando `window.getSelection()`, `getRangeAt(0).getBoundingClientRect()`, `this.editorEl.nativeElement` y `container.scrollBy({ top: delta, behavior: 'smooth' })`
  - El `@ViewChild('editorEl')` ya existe como `editorEl!: ElementRef<HTMLDivElement>`
- **Depende de**: ninguna dependencia previa
- **Riesgo**: `onSelectionUpdate` no existe como opción directa en la API de TipTap `new Editor({...})`. La forma correcta en TipTap 2.x es llamar `this.editor.on('selectionUpdate', () => { ... })` después de crear el editor, igual que se hace con `this.editor.on('update', ...)`. El Implementer debe usar `.on()` y no la opción del constructor. Adicionalmente, `window.getSelection()` puede devolver null en Tauri/WebView; el método debe salir silenciosamente si selection es null o rangeCount es 0.

---

### Tarea 6: Modo máquina de escribir — EditorTopBarComponent y EditorLayoutComponent

- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.ts` (modificar)
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.html` (modificar)
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**:
  - En `editor-top-bar.component.ts`: añadir input `typewriterMode = input<boolean>(false)` y output `typewriterToggled = output<void>()`
  - En `editor-top-bar.component.html`: añadir el botón de máquina de escribir junto al botón de modo focus (al final del header). Usar el mismo patrón de clases condicionales que los otros botones de modo
  - En `editor-layout.component.html`: pasar `[typewriterMode]="typewriterMode()"` y `(typewriterToggled)="typewriterMode.update(v => !v)"` a `<app-editor-top-bar>`; pasar `[typewriterMode]="typewriterMode()"` a `<app-tiptap-editor>`
- **Depende de**: Tarea 1 (para el signal `typewriterMode`), Tarea 5 (para que TiptapEditorComponent acepte el input)

---

### Tarea 7: BackupService

- **Fichero**: `src/app/core/services/backup.service.ts` (crear)
- **Qué hace**:
  - Servicio `@Injectable({ providedIn: 'root' })` que inyecta `TauriBridgeService`, `ProjectService`, `ToastService`
  - Método `async createBackup(): Promise<void>` que: obtiene proyecto y basePath, genera nombre de fichero con timestamp en formato `nombre-proyecto-backup-YYYY-MM-DDTHH-MM-SS.zip` (la spec usa el patrón de `toISOString().replace(/[:.]/g, '-').slice(0, 19)`), llama a `bridge.saveFileDialog(defaultName, 'zip')`, si null retorna, crea el ZIP con JSZip incluyendo `project.json`, todos los documentos (`documents/{id}.json`) y todos los tableros (`boards/{id}.json`), genera el buffer y llama a `bridge.writeBinaryFile(savePath, buffer)`, muestra toast de éxito o error
  - Importar JSZip directamente: `import JSZip from 'jszip'` (ya disponible como transitiva de epub-gen-memory en la versión 3.10.1; NO instalar con pnpm)
  - Usar las funciones de `project-paths.ts` para construir las rutas
  - `listJsonFiles()` devuelve un array de IDs (sin extensión `.json`); verificar con el Explorer si es así antes de construir las rutas. Según `project-paths.ts`, `documentPath(basePath, id)` ya añade `.json`
- **Depende de**: ninguna dependencia previa
- **Riesgo**: `listJsonFiles()` en `TauriBridgeService` mapea al comando Rust `list_json_files` que devuelve IDs sin extensión. Confirmar que al usar `documentPath(basePath, id)` el resultado es correcto. Si Rust devolviera nombres con `.json`, la ruta resultante sería `documents/abc.json.json`. El Implementer debe verificar el comportamiento real del comando Rust o buscar cómo se usa `listJsonFiles` en otras partes del código antes de escribir el loop.

---

### Tarea 8: Botón de backup en InkSettingsModalComponent

- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (modificar)
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**:
  - En el TS: inyectar `BackupService`; añadir método `backup()` que emite `this.closed.emit()` y luego, en un `setTimeout(() => this.backupService.createBackup(), 100)`, dispara el backup
  - En el HTML: dentro del bloque `@if (activeSection() === 'editor' && projectService.isLoaded())`, añadir un bloque con separador (`border-t`), texto descriptivo y el botón `<ink-button variant="secondary" [fullWidth]="true" (clicked)="backup()">` después del botón "Guardar cambios" existente
  - Verificar que `InkButtonComponent` acepta el input `[fullWidth]` (revisar su API antes de usarlo)
- **Depende de**: Tarea 7

---

### Tarea 9: ShortcutsModalComponent

- **Fichero**: `src/app/shared/components/shortcuts-modal.component.ts` (crear)
- **Qué hace**:
  - Componente standalone que importa `InkModalComponent`
  - Define la constante `SHORTCUTS` con los cinco grupos (Navegación, Editor, Snapshots, Modos de escritura, General) exactamente como en la spec
  - Output `closed = output<void>()`
  - Template inline con scroll interno, grupos renderizados con `@for`, teclas con `<kbd>` con estilo border/font-mono, separador `+` entre teclas cuando no es `—`
  - No hay estado interno ni inyecciones de servicios
- **Depende de**: ninguna dependencia previa

---

### Tarea 10: Integrar ShortcutsModal en AppComponent

- **Fichero**: `src/app/app.component.ts` (modificar)
- **Fichero**: `src/app/app.component.html` (modificar)
- **Qué hace**:
  - En el TS: añadir `showShortcuts = signal(false)`; en el `@HostListener` existente (`onKeydown`), añadir la rama para `event.key === '?'` verificando que el target no es `INPUT` ni `TEXTAREA`; importar `ShortcutsModalComponent` en el array `imports` del decorador
  - En el HTML: añadir el bloque `@if (showShortcuts()) { <app-shortcuts-modal (closed)="showShortcuts.set(false)"/> }` al final del template
- **Depende de**: Tarea 9

---

### Tarea 11: Botón de atajos en InkNavComponent

- **Fichero**: `src/app/shared/components/ink-nav.component.ts` (modificar)
- **Fichero**: `src/app/shared/components/ink-nav.component.html` (modificar)
- **Qué hace**:
  - En el TS: añadir `shortcutsRequested = output<void>()`
  - En el HTML: añadir botón con el icono de interrogación (círculo con `?` interior) antes del spacer o junto al botón de settings; el botón emite `shortcutsRequested.emit()`
  - `InkNavComponent` gestiona sus propios modals internamente (settings y author profile). Para el modal de atajos, la spec indica que el `AppComponent` escucha el output y togglea `showShortcuts`. Por tanto, el componente `ink-nav` debe tener la posibilidad de emitir este output hacia arriba. Sin embargo, `ink-nav` se usa en `EditorLayoutComponent` (`<ink-nav />`), no en `AppComponent`. El `AppComponent` solo tiene `<router-outlet/>` y `<app-ink-toast/>`.
  - **Problema detectado**: la spec pide que `AppComponent` escuche el output de `InkNavComponent`, pero `InkNavComponent` está renderizado dentro de `EditorLayoutComponent`, no directamente en `AppComponent`. No hay línea directa de comunicación.
  - **Resolución propuesta para el Implementer**: dado que `showShortcuts` ya vive en `AppComponent` y el atajo `?` también está en `AppComponent`, el botón en `InkNavComponent` puede gestionar el modal de atajos internamente igual que gestiona el modal de settings (con un signal local `showShortcuts` propio en `InkNavComponent`), en lugar de intentar comunicarse con `AppComponent`. El modal de atajos se renderizaría desde `InkNavComponent`, paralelo a `ink-settings-modal`.
  - Alternativa: el output `shortcutsRequested` en `InkNavComponent` se escucha en `EditorLayoutComponent` y `EditorLayoutComponent` tiene su propia instancia de `showShortcuts`; pero entonces habría dos signals desconectados (uno en `AppComponent` para el atajo `?` y otro en `EditorLayoutComponent` para el botón nav).
  - **Decisión recomendada**: gestionar el modal de atajos completamente dentro de `InkNavComponent` (mismo patrón que settings y author profile). El signal `showShortcuts` de `AppComponent` solo responde al atajo `?`. Son dos vías de entrada independientes que abren el mismo modal desde instancias distintas. Esto es correcto porque el modal no tiene estado mutable.
- **Depende de**: Tarea 9
- **Riesgo**: este punto es la mayor ambigüedad arquitectónica de la spec. La spec dice "El AppComponent escucha este output" pero la cadena de componentes hace eso imposible sin routing de eventos manual. La resolución propuesta (gestión local en InkNavComponent) es la más simple y no viola ninguna convención.

---

## Orden de ejecución

1. Tarea 9 — ShortcutsModalComponent (sin dependencias, base para tareas 10 y 11)
2. Tarea 7 — BackupService (sin dependencias)
3. Tarea 5 — TiptapEditorComponent typewriterMode (sin dependencias)
4. Tarea 1 — Signals de sesión en EditorLayoutComponent (sin dependencias externas)
5. Tarea 2 — BinderFooterComponent ampliado (sin dependencias)
6. Tarea 3 — Pass-through en BinderComponent (depende de Tarea 2)
7. Tarea 4 — Conectar binder con EditorLayoutComponent (depende de Tareas 1 y 3)
8. Tarea 6 — Typewriter en top bar y layout (depende de Tareas 1 y 5)
9. Tarea 8 — Botón backup en settings modal (depende de Tarea 7)
10. Tarea 10 — ShortcutsModal en AppComponent (depende de Tarea 9)
11. Tarea 11 — Botón atajos en InkNavComponent (depende de Tarea 9)

---

## Puntos de atención para el Implementer

### Restricciones explícitas de la spec ("Lo que NO hacer")
- No persistir el objetivo de sesión en disco ni en localStorage
- No implementar estadísticas históricas (palabras por día, racha)
- No añadir typewriter mode en los tableros
- No implementar restore de backup desde la app
- No calcular el diferencial de palabras a nivel de carácter — solo en el momento del guardado

### Gotchas identificados

**BinderFooterComponent — migración a template inline:**
El componente actual usa `templateUrl: './binder-footer.component.html'`. Al cambiar a `template: \`...\``, eliminar `templateUrl` del decorador. No borrar el fichero `.html` (puede quedar vacío para evitar errores de git).

**TipTap — onSelectionUpdate:**
No usar `onSelectionUpdate` como opción del constructor de `Editor`. Usar `this.editor.on('selectionUpdate', () => { ... })` después de `new Editor({...})`. Es el mismo patrón que el `on('update', ...)` existente.

**Orden en saveCurrentDocument():**
```
1. Leer wasReached ANTES de actualizar palabras
2. Llamar await docService.saveDocument()
3. Leer totalWordCount() DESPUÉS del guardado
4. Actualizar sessionWordsAdded
5. Comparar wasReached vs sessionGoalReached()
```

**jszip — import:**
No ejecutar `pnpm add jszip`. Importar directamente: `import JSZip from 'jszip'`. La versión 3.10.1 está disponible en `node_modules` como transitiva de `epub-gen-memory`.

**listJsonFiles — formato de retorno:**
Antes de implementar el loop en BackupService, verificar en el código existente cómo se usa `listJsonFiles`. Buscar en `ImportService` o `DocumentService` si retorna IDs puros o nombres con extensión.

**Popover del objetivo — click fuera:**
El selector `target.closest('app-binder-footer')` funciona solo si el elemento host tiene ese selector como tag. En Angular standalone con selector `app-binder-footer`, el host element tiene ese tag name, por lo que el closest sí funciona.

**AppComponent — atajo `?`:**
El método actual se llama `onKeydown` (minúscula d). El Implementer debe añadir la nueva rama dentro del método existente, no crear un segundo `@HostListener`.

**InkNavComponent — modal de atajos:**
Gestionar `showShortcuts` localmente en `InkNavComponent` (igual que `showSettings` y `showAuthorProfile`). Añadir `ShortcutsModalComponent` al array `imports` del componente. No intentar emitir un output hacia `AppComponent` a través de `EditorLayoutComponent`.

**ToastService en EditorLayoutComponent:**
Verificar si ya está inyectado antes de añadirlo. Si no está, añadir `private toast = inject(ToastService)` e importar `ToastService` en el fichero.

**InkButtonComponent — input fullWidth:**
Verificar que `InkButtonComponent` acepta `[fullWidth]` como input antes de usarlo en el HTML de settings. Si no existe ese input, usar clases Tailwind directamente en el botón nativo.
