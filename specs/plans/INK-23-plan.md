## Plan de implementación — INK-23

### Resumen

Esta spec añade tres mejoras de calidad de vida independientes: un selector de tipografía y tamaño en la toolbar del editor, un control de escala de fuente global en el modal de Settings, y un resize handle con interact.js en el panel lateral del asistente IA. Todo el estado nuevo se centraliza en un `SettingsService` y un modelo `AppSettings` independientes del `ProjectService`, persistidos en `localStorage`.

---

### Tareas

#### Tarea 1: Crear el modelo `app-settings.model.ts`
- **Fichero**: `src/app/core/models/app-settings.model.ts` (crear)
- **Qué hace**: Define las interfaces `EditorSettings`, `UiFontScale`, `AppearanceSettings`, `AiPanelSettings` y `AppSettings`, junto con la constante `DEFAULT_APP_SETTINGS` con los valores por defecto (`fontFamily: 'Georgia, serif'`, `fontSize: 18`, `uiFontScale: 'md'`, `width: 320`). Esta constante la usará el servicio para el merge inicial.
- **Depende de**: ninguna dependencia previa
- **Qué NO tocar**: No modificar `project.model.ts`. Estos tipos son completamente independientes de `ProjectSettings`.

#### Tarea 2: Crear `SettingsService`
- **Fichero**: `src/app/core/services/settings.service.ts` (crear)
- **Qué hace**: Servicio `providedIn: 'root'` con un signal `settings` de tipo `AppSettings`. En el constructor lee `localStorage.getItem('inkwell-app-settings')`, hace un merge profundo con `DEFAULT_APP_SETTINGS` (para garantizar que nunca faltan campos si el JSON guardado es parcial) y llama a `settings.set(merged)`. Expone cuatro métodos públicos:
  - `setEditorFontFamily(family: string)` — actualiza `settings.editor.fontFamily`
  - `setEditorFontSize(size: number)` — clamp entre 12 y 32, actualiza `settings.editor.fontSize`
  - `setUiFontScale(scale: UiFontScale)` — actualiza `settings.appearance.uiFontScale`
  - `setAiPanelWidth(width: number)` — clamp entre 240 y 600, actualiza `settings.aiPanel.width`
  - Cada uno de estos métodos persiste inmediatamente el estado completo en `localStorage` con la clave `'inkwell-app-settings'`.
- **Depende de**: Tarea 1
- **Riesgo**: El merge profundo debe manejar el caso en que `localStorage` tiene un JSON con solo algunos campos (p.ej. solo `appearance`). Usar spread por nivel de anidamiento, no un Object.assign superficial.

#### Tarea 3: Extraer template e inline styles de `AiAssistantPanelComponent` a ficheros separados
- **Ficheros**:
  - `src/app/features/editor/ai-assistant/ai-assistant-panel.component.html` (crear)
  - `src/app/features/editor/ai-assistant/ai-assistant-panel.component.css` (crear)
  - `src/app/features/editor/ai-assistant/ai-assistant-panel.component.ts` (modificar)
- **Qué hace**: El componente actualmente usa `template: \`...\`` inline. Hay que mover todo el contenido del template al fichero `.html` y reemplazar `template:` por `templateUrl: './ai-assistant-panel.component.html'`. Si hay estilos inline en `styles: []`, moverlos al `.css` y usar `styleUrl`. Esta tarea no añade ninguna funcionalidad nueva; es únicamente la extracción para cumplir la convención del proyecto.
- **Depende de**: ninguna dependencia previa (puede ejecutarse en paralelo con Tareas 1 y 2)
- **Riesgo**: El template inline es largo (365 líneas). Copiar con exactitud. Verificar que el selector `<app-ai-assistant-panel>` en `editor-layout.component.html` sigue funcionando sin cambios.

#### Tarea 4: Modificar `TiptapEditorComponent` — binding dinámico de fuente
- **Ficheros**:
  - `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
  - `src/app/features/editor/tiptap/tiptap-editor.component.html` (modificar)
- **Qué hace**:
  - En el `.ts`: inyectar `SettingsService`. Declarar dos computed signals: `editorFontFamily = computed(() => this.settingsService.settings().editor.fontFamily)` y `editorFontSize = computed(() => this.settingsService.settings().editor.fontSize)`.
  - En el `.html`: añadir `[style.font-family]="editorFontFamily()"` y `[style.font-size.px]="editorFontSize()"` en el `div#editorEl` (la línea que ya tiene la clase `flex-1 overflow-y-auto px-16 py-12`).
  - En el `.ts`: eliminar de la sección `styles: [...]` las dos líneas que hardcodean la fuente: `font-family: "Lora", Georgia, serif;` y `font-size: 1.05rem;` del selector `::ng-deep .tiptap-host .ProseMirror`. El resto de estilos `::ng-deep` (h1, h2, blockquote, etc.) deben permanecer intactos.
- **Depende de**: Tarea 2
- **Riesgo**: El componente tiene `styles: [...]` inline (no usa fichero `.css`). La spec no exige extraerlo — solo eliminar las dos líneas de fuente. No tocar el resto de reglas CSS del bloque. La fuente se aplicará ahora sobre el elemento host del editor via binding, no sobre `.ProseMirror` via `::ng-deep`.

#### Tarea 5: Modificar `EditorToolbarComponent` — controles de tipografía
- **Ficheros**:
  - `src/app/features/editor/tiptap/editor-toolbar.component.ts` (modificar)
  - `src/app/features/editor/tiptap/editor-toolbar.component.html` (modificar)
- **Qué hace**:
  - En el `.ts`: inyectar `SettingsService`. Añadir la constante `EDITOR_FONT_OPTIONS` con 6 objetos `{ label: string; value: string }` para las familias: Georgia, Palatino Linotype, Times New Roman, Inter, Helvetica Neue, Courier Prime. Añadir computed signals `editorFontFamily()` y `editorFontSize()` leyendo de `settingsService.settings()`. Añadir métodos `setFontFamily(family: string)` y `incrementFontSize()` / `decrementFontSize()` que llamen a los métodos correspondientes del servicio.
  - En el `.html`: añadir, a la derecha del último separador existente (después de los botones de deshacer/rehacer), un nuevo separador `toolbar-sep` seguido de: (1) un `<select>` con las opciones de familia tipográfica vinculado a `editorFontFamily()` que llame `setFontFamily($event.target.value)` en `(change)`, y (2) un stepper compuesto por tres elementos inline: botón `−` que llama `decrementFontSize()`, un `<span>` que muestra `editorFontSize()` con unidad "px", y botón `+` que llama `incrementFontSize()`. Usar clases `toolbar-btn` existentes para los botones.
- **Depende de**: Tarea 2
- **Riesgo**: El `<select>` no debe usar `[(ngModel)]` porque este componente no importa `FormsModule`. Usar `[value]` y `(change)` con event del DOM. El `(mousedown)="$event.preventDefault()"` del wrapper ya existe y protege el foco del editor — no tocarlo.

#### Tarea 6: Modificar `ThemeService` — efecto de escala de fuente UI
- **Fichero**: `src/app/core/services/theme.service.ts` (modificar)
- **Qué hace**: Inyectar `SettingsService`. Añadir el mapa `FONT_SCALE_MAP: Record<UiFontScale, string>` con valores `{ sm: '14px', md: '16px', lg: '18px', xl: '20px' }`. Añadir un segundo `effect()` en el constructor que llame a un método privado `applyFontScale(scale: UiFontScale)`, el cual ejecuta `document.documentElement.style.setProperty('font-size', FONT_SCALE_MAP[scale])`. El effect existente que gestiona el tema `data-theme` no debe tocarse.
- **Depende de**: Tarea 2
- **Riesgo**: `ThemeService` actualmente no inyecta nada. Al inyectar `SettingsService`, ambos son `providedIn: 'root'`, por lo que no hay riesgo de circularidad. Verificar que el `effect()` se crea dentro del contexto de inyección del constructor.

#### Tarea 7: Modificar `InkSettingsModalComponent` — control de escala de fuente UI
- **Ficheros**:
  - `src/app/shared/components/ink-settings-modal.component.ts` (modificar)
  - `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**:
  - En el `.ts`: inyectar `SettingsService`. Añadir el array `fontScaleOptions` con 4 objetos `{ id: UiFontScale; label: string }`: `{ id: 'sm', label: 'Pequeño' }`, `{ id: 'md', label: 'Normal' }`, `{ id: 'lg', label: 'Grande' }`, `{ id: 'xl', label: 'Muy grande' }`. Añadir computed signal `currentScale()` que lee `settingsService.settings().appearance.uiFontScale`.
  - En el `.html`: en la sección `@if (activeSection() === 'appearance')`, después del bloque de selección de tema existente, añadir un nuevo bloque con label "Escala de interfaz" y 4 botones (uno por opción de `fontScaleOptions`) que llamen a `settingsService.setUiFontScale(option.id)`. El botón activo (cuando `currentScale() === option.id`) recibe clases de resaltado consistentes con el resto del modal.
- **Depende de**: Tarea 2

#### Tarea 8: Modificar `AiAssistantPanelComponent` — resize handle con interact.js
- **Ficheros**:
  - `src/app/features/editor/ai-assistant/ai-assistant-panel.component.ts` (modificar)
  - `src/app/features/editor/ai-assistant/ai-assistant-panel.component.html` (modificar)
  - `src/app/features/editor/ai-assistant/ai-assistant-panel.component.css` (modificar)
- **Qué hace**:
  - En el `.ts`: inyectar `SettingsService`. Cambiar `@ViewChild('messagesEl')` para que coexista con un nuevo `viewChild<ElementRef>('resizeHandle')` usando la API signal-based (`viewChild` importado de `@angular/core`). Añadir computed signal `panelWidth = computed(() => this.settingsService.settings().aiPanel.width)`. En `ngAfterViewInit` (que ya existe como `AfterViewChecked` — ver riesgo), añadir el método `initResize()` que llama a `interact(handle).draggable({ axis: 'x', listeners: { move: (event) => { const newWidth = panelWidth() - event.dx; settingsService.setAiPanelWidth(newWidth); } } })`. Destruir el interactable en `ngOnDestroy` (añadir la interfaz si no existe).
  - En el `.html`: en el `<aside>`, reemplazar la clase `w-80` por `[style.width.px]="panelWidth()"`. Añadir un `<div #resizeHandle>` como primer hijo del `<aside>`, posicionado absolutamente en el borde izquierdo, con `cursor-col-resize` y dimensiones `w-1 h-full`.
  - En el `.css`: añadir el estilo del handle: posición absoluta a la izquierda, ancho de 4-6px, cursor `col-resize`, zona de hover con color sutil.
- **Depende de**: Tarea 3 (el fichero `.html` y `.css` ya deben existir), Tarea 2
- **Riesgo**: El componente implementa `AfterViewChecked`, no `AfterViewInit`. Para inicializar interact.js hay que implementar también `AfterViewInit` (ambas interfaces pueden coexistir). Alternativamente, usar `effect()` con `viewChild` signal-based para inicializar cuando el handle esté disponible — esto es más idiomático en Angular 19 zoneless. La dirección del drag: `event.dx` positivo = arrastrar hacia la derecha = reducir el panel (el handle está en el borde izquierdo del panel). Por tanto `newWidth = panelWidth() - event.dx`.

#### Tarea 9: Modificar `EditorLayoutComponent` — eliminar ancho fijo del panel IA
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**: Verificar si el elemento `<app-ai-assistant-panel>` tiene alguna clase de ancho fijo (p.ej. `w-80`) en el template y eliminarla si existe. El ancho del panel ahora lo controla el propio componente mediante el binding `[style.width.px]`. Revisar también el contenedor padre del panel para asegurar que no hay `shrink-0` que interfiera con el resize.
- **Depende de**: Tarea 8
- **Nota**: La revisión del template actual (`editor-layout.component.html`) muestra que `<app-ai-assistant-panel>` no tiene clase de ancho fija en el lado del layout — el `w-80` está dentro del propio componente. Esta tarea confirma ese estado y no requiere cambios, pero el Implementer debe verificarlo en el momento de ejecución.

---

### Orden de ejecución

1. Tarea 1 — `app-settings.model.ts` (modelo base, sin dependencias)
2. Tarea 2 — `SettingsService` (base de todo el resto)
3. Tarea 3 — Extracción del template inline de `AiAssistantPanelComponent` (puede ejecutarse tras Tarea 1, no depende del servicio)
4. Tarea 4 — `TiptapEditorComponent` binding de fuente (depende de Tarea 2)
5. Tarea 5 — `EditorToolbarComponent` controles de tipografía (depende de Tarea 2)
6. Tarea 6 — `ThemeService` efecto de escala de fuente (depende de Tarea 2)
7. Tarea 7 — `InkSettingsModalComponent` control de escala UI (depende de Tarea 2)
8. Tarea 8 — `AiAssistantPanelComponent` resize handle (depende de Tareas 2 y 3)
9. Tarea 9 — `EditorLayoutComponent` verificación de ancho fijo (depende de Tarea 8)

---

### Puntos de atención para el Implementer

**Convenciones obligatorias del proyecto:**
- Templates y estilos SIEMPRE en ficheros separados (`.html` y `.css`). La Tarea 3 existe precisamente para resolver la violación de `AiAssistantPanelComponent`. La Tarea 4 es una excepción autorizada: `TiptapEditorComponent` conserva `styles: []` inline porque ya existe así y la spec solo pide eliminar dos líneas, no refactorizar el fichero completo.
- Signals everywhere: los computed signals deben usarse en templates con `()`. Sin `BehaviorSubject`.
- Zoneless: no usar `NgZone`. Los `effect()` deben crearse en el constructor (contexto de inyección).
- Standalone: todos los componentes son standalone. Al inyectar `SettingsService` en cualquier componente, no hay que añadirlo a ningún módulo.

**Merge profundo en SettingsService:**
El JSON en `localStorage` puede ser parcial (de versiones anteriores de la app o si el usuario borró parte). El merge debe hacerse nivel a nivel: `{ ...DEFAULT_APP_SETTINGS, ...stored, editor: { ...DEFAULT_APP_SETTINGS.editor, ...stored?.editor }, appearance: { ...DEFAULT_APP_SETTINGS.appearance, ...stored?.appearance }, aiPanel: { ...DEFAULT_APP_SETTINGS.aiPanel, ...stored?.aiPanel } }`.

**interact.js en el panel IA:**
- Seguir el patrón de `BoardCardComponent` exactamente: `import interact from 'interactjs'`, inicializar en el ciclo de vida apropiado, guardar la referencia del interactable y llamar `.unset()` en `ngOnDestroy`.
- El handle debe estar en el borde IZQUIERDO del aside (no derecho), porque el panel está a la derecha de la pantalla.
- La matemática del resize: cuando el usuario arrastra el handle hacia la izquierda (`event.dx` negativo), el panel debe crecer, y viceversa. Por eso la fórmula es `newWidth = currentWidth - event.dx`.

**Escala de fuente global:**
- `ThemeService` establece `document.documentElement.style.setProperty('font-size', value)` — esto afecta a toda la UI vía `rem`. Verificar que los tokens `--ink-*` y las clases Tailwind que usan `rem` se ven afectadas correctamente.
- El selector de fuente en `EditorToolbarComponent` no debe usar `FormsModule`. El componente no lo importa y no debe añadirse solo para este control. Usar event binding nativo `(change)`.

**`AiAssistantPanelComponent` — AfterViewInit vs AfterViewChecked:**
El componente ya implementa `AfterViewChecked` para el scroll automático. Para el resize handle, la opción más limpia en Angular 19 zoneless es usar `viewChild` signal-based y un `effect()` que observe cuando el elemento esté disponible, en lugar de añadir `AfterViewInit`. Esto evita el riesgo de inicializar interact.js antes de que el DOM esté listo.

**Lo que NO hacer (restricciones de la spec):**
- No añadir ningún campo nuevo a `ProjectSettings` en `project.model.ts`.
- No añadir ninguna llamada a Tauri o al backend de Rust. Todo es `localStorage`.
- No usar `NgModule`. No usar `BehaviorSubject`.
- No usar variables CSS `--ctp-*` directamente. Usar tokens `--ink-*` para cualquier estilo del handle.
- No extraer los estilos inline de `TiptapEditorComponent` a fichero `.css` (la spec no lo pide y hacerlo añadiría riesgo sin beneficio para esta spec).
