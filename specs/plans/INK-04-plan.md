# Plan de implementación — INK-04

## Resumen

Esta spec implementa la pantalla de inicio de Inkwell: dos componentes de UI compartidos
(`InkButtonComponent` e `InkModalComponent`), el modal de creación de proyecto
(`NewProjectModalComponent`) y el componente principal `ProjectManagerComponent` que reemplaza
completamente al actual stub de tests. Todos los servicios necesarios (ProjectService,
TauriBridgeService, ThemeService) ya están implementados y listos para usar.

---

## Tareas

### Tarea 1: InkButtonComponent
- **Fichero**: `src/app/shared/components/ink-button.component.ts` (crear)
- **Qué hace**: Botón reutilizable con cuatro variantes (`primary`, `secondary`, `ghost`,
  `danger`), estados `disabled` y `loading` (spinner inline), input `fullWidth` y output
  `clicked`. La lógica de clases está encapsulada en el método `buttonClasses()`.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: El input `disabled` tiene el mismo nombre que el atributo HTML nativo. La spec
  lo declara como `input<boolean>` de Angular signals, lo cual es correcto y no colisiona,
  pero el Implementer debe asegurarse de que el binding en el template use `[disabled]="disabled() || loading()"` y no la variante sin paréntesis.

### Tarea 2: InkModalComponent
- **Fichero**: `src/app/shared/components/ink-modal.component.ts` (crear)
- **Qué hace**: Modal genérico con overlay semitransparente, cabecera con título y botón de
  cierre, slot de contenido y slot condicional de acciones (`[slot=actions]`). Cierra al
  hacer clic en el overlay si `closeOnOverlay()` es `true`.
- **Depende de**: Tarea 1 (no hay dependencia directa de código, pero conceptualmente forma
  parte del mismo bloque de shared UI que debe existir antes de los consumidores)
- **Riesgo**: El slot de acciones usa `<ng-content select="[slot=actions]">`. Angular 19+
  acepta esta sintaxis, pero el Implementer debe respetar que el footer solo se renderiza
  si `hasActions()` es `true`. Si se omite el `@if`, el footer aparece vacío y rompe el
  layout del modal.

### Tarea 3: NewProjectModalComponent
- **Fichero**: `src/app/features/project-manager/new-project-modal.component.ts` (crear)
- **Qué hace**: Formulario dentro de `InkModalComponent` con campos nombre (requerido),
  descripción (opcional) y selector de carpeta vía `TauriBridgeService.selectNewProjectFolder()`.
  El botón "Crear proyecto" permanece deshabilitado hasta que `name.trim()` y `folderPath()`
  sean válidos. Al confirmar llama a `ProjectService.createProject()` y después a
  `addRecentProject()`, emitiendo `created` al finalizar con éxito.
- **Depende de**: Tarea 1 (InkButtonComponent), Tarea 2 (InkModalComponent)
- **Riesgo**: `FormsModule` debe incluirse en el array `imports` del componente standalone o
  `[(ngModel)]` fallará en tiempo de compilación. Es el error más probable en esta tarea.

### Tarea 4: ProjectManagerComponent (reemplazo completo)
- **Fichero**: `src/app/features/project-manager/project-manager.component.ts` (modificar —
  reemplazar todo el contenido)
- **Qué hace**: Pantalla de inicio con layout de dos paneles. Panel izquierdo: logo SVG,
  wordmark, botones "Nuevo proyecto" y "Abrir proyecto" con estado `loading`, y mensaje de
  error de apertura. Panel derecho: lista de proyectos recientes cargada en `ngOnInit` desde
  `ProjectService.getRecentProjects()`, con acciones de apertura y eliminación por fila.
  Barra superior con toggle de tema. Modal de nuevo proyecto condicional vía
  `showNewProjectModal` signal.
- **Depende de**: Tarea 1 (InkButtonComponent), Tarea 3 (NewProjectModalComponent)
- **Riesgo**: `OnInit` en un componente zoneless. El ciclo de vida `ngOnInit` sí funciona
  en zoneless (no es un gotcha, a diferencia de AfterViewInit con librerías DOM). Sin
  embargo, `recentProjects` se inicializa como `signal([])` y se actualiza en `ngOnInit`:
  el Implementer no debe usar `computed()` sobre `ProjectService` para los recientes porque
  `getRecentProjects()` lee de `localStorage` y no es reactivo. La señal local
  `recentProjects` en el componente que se actualiza manualmente en cada operación es el
  patrón correcto según la spec.

---

## Orden de ejecución

1. Tarea 1 — `ink-button.component.ts` (sin dependencias, base del resto)
2. Tarea 2 — `ink-modal.component.ts` (sin dependencias de código propio)
3. Tarea 3 — `new-project-modal.component.ts` (depende de Tarea 1 y Tarea 2)
4. Tarea 4 — `project-manager.component.ts` (depende de Tarea 1 y Tarea 3)

Tras cada tarea el Implementer debe verificar que el proyecto compila sin errores con
`pnpm exec tsc --noEmit` antes de continuar con la siguiente.

---

## Puntos de atención para el Implementer

### Restricciones de la spec ("Lo que NO hacer")
- No implementar la vista de editor (`/editor`). La navegación a `/editor` tras crear o
  abrir un proyecto es suficiente; el placeholder de INK-01 ya existe en
  `editor-layout.component.ts`.
- No añadir animaciones de entrada/salida en el modal.
- No implementar settings de la app.

### Convenciones del proyecto
- **TailwindCSS v4** — los tokens `--ink-*` se consumen como utilidades (`text-ink-text`,
  `bg-ink-surface`, etc.) gracias al bloque `@theme` en `styles.css`. No usar variables CSS
  directas en los templates de Angular.
- **Zoneless** — no importar ni inyectar `NgZone`. Los signals y el ciclo de vida estándar
  de Angular funcionan sin zona.
- **Standalone** — todos los componentes deben declarar `standalone: true` y listar sus
  dependencias en el array `imports`. Sin NgModules.
- **Signals** — estado de componente via `signal()`. Sin `BehaviorSubject`. Sin `async`
  pipe sobre observables.
- **TauriBridgeService** — único punto de acceso a Tauri. No importar `invoke` directamente
  en ningún componente.
- **IDs** — `crypto.randomUUID()`. El ProjectService ya lo usa correctamente.
- **Gestor de paquetes** — `pnpm`. Si hace falta instalar algo, usar `pnpm add`.

### Gotchas específicos de esta spec
- `CommonModule` se importa en `InkButtonComponent` aunque no es estrictamente necesario
  en Angular 19 standalone (las directivas de control de flujo `@if`/`@for` son built-in).
  La spec lo incluye explícitamente; el Implementer debe respetarlo para evitar desviar del
  código aprobado.
- El slot de acciones en `InkModalComponent` usa `<ng-content select="[slot=actions]">`.
  En `NewProjectModalComponent` el contenido se proyecta con `<ng-container slot="actions">`.
  Esta combinación es la forma correcta en Angular 19; no intentar sustituirla por
  `@ContentChild` u otras alternativas.
- `recentProjects` en `ProjectManagerComponent` es un `signal<RecentProject[]>([])` que se
  actualiza sincrónicamente después de cada operación sobre `ProjectService`. No intentar
  derivarlo con `computed()`.
- El método `openRecentProject` elimina el proyecto de recientes si falla la apertura y
  actualiza el signal inmediatamente. Este comportamiento está en los criterios de
  aceptación; no omitirlo.
- La interfaz local `RecentProject` se declara dentro del fichero de
  `ProjectManagerComponent`. No moverla a los modelos core.
