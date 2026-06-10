# Plan de implementación — INK-35

## Resumen

Implementar atajos de teclado configurables para insertar comillas españolas («») con lógica contextual de apertura/cierre y raya de diálogo (—) en el editor TipTap. La feature se activa mediante un **listener nativo `keydown` sobre `editor.view.dom`** (no InputRules ni `addKeyboardShortcuts` de TipTap), gestiona su propia configuración a través de un servicio Angular dedicado, y se integra en la UI existente (toolbar, settings modal, shortcuts modal). Retrocompatible: el campo en settings es opcional.

---

## Tareas

### Tarea 1: Tipos y defaults (`literary-punctuation.types.ts`)
- **Fichero**: `src/app/features/editor/literary-punctuation/literary-punctuation.types.ts` (crear)
- **Qué hace**: Define las interfaces `CtrlRequirement`, `LiteraryShortcutTrigger`, `LiteraryPunctuationConfig` y la función `getLiteraryPunctuationDefaults()` que detecta la plataforma (`navigator.platform` / `navigator.userAgent`) para establecer modificadores por defecto (macOS → Meta+Shift; Windows/Linux → Left Ctrl+Shift).
- **Depende de**: Ninguna dependencia previa.
- **Riesgo**: Bajo — tipos puros.
- **Verificación**: `ng build` no debe reportar errores de tipado en el nuevo módulo.

---

### Tarea 2: Helpers de lógica y presentación (`literary-punctuation.helpers.ts`)
- **Fichero**: `src/app/features/editor/literary-punctuation/literary-punctuation.helpers.ts` (crear)
- **Qué hace**:
  - `matchesTrigger(event, trigger)`: compara `event.code`, modificadores (`shiftKey`, `altKey`, `metaKey`) y `event.location` para distinguir Left/Right Ctrl.
  - `smartQuoteDirection(editor)`: escanea hacia atrás desde el cursor hasta `quoteLookbackChars` contando `«` y `»` para decidir si insertar apertura o cierre.
  - `insertSmartQuote(editor)` / `insertEmDash(editor)`: insertan `«`/`»` o `—` vía `editor.commands.insertContent`.
  - `formatShortcutLabel(trigger)` / `friendlyKeyName(code)`: generan strings legibles para tooltips y UI (ej. `Ctrl+Shift+<>`).
- **Depende de**: Tarea 1.
- **Riesgo**: Medio — la lógica de `smartQuoteDirection` debe manejar correctamente `doc.textBetween` con separadores `\n` y espacios; el scan debe limitarse a `quoteLookbackChars` y no cruzar la raíz del documento.
- **Verificación**: `ng build` limpio. Lógica pura verificable con unit tests informales (no se exige test suite nueva, pero el código debe ser razonablemente testable).

---

### Tarea 3: Extensión TipTap con listener nativo (`literary-punctuation.extension.ts`)
- **Fichero**: `src/app/features/editor/literary-punctuation/literary-punctuation.extension.ts` (crear)
- **Qué hace**:
  - Crea `LiteraryPunctuationExtension` con `Extension.create<LiteraryPunctuationExtensionOptions>`.
  - En `onCreate()`: registra un handler `keydown` nativo sobre `this.editor.view.dom` (no `document`). El handler:
    - Sale inmediatamente si `!this.options.config.enabled`.
    - Compara el evento contra `quoteShortcut` y `dashShortcut` usando `matchesTrigger()`.
    - Si hay match, llama `event.preventDefault(); event.stopPropagation();` y ejecuta `insertSmartQuote(this.editor)` o `insertEmDash(this.editor)`.
    - Guarda la referencia del handler en una propiedad privada `(this as any)._literaryHandler` para poder eliminarla luego.
  - En `onDestroy()`: recupera la referencia guardada y ejecuta `this.editor.view.dom.removeEventListener('keydown', handler)`.
- **Depende de**: Tarea 1 y Tarea 2.
- **Riesgo**: **Alto** — `editor.view.dom` debe existir en `onCreate`. Si TipTap 3.x tiene un ciclo de vida diferente (ej. `onCreate` se llama antes de que `view.dom` esté listo), habrá que ajustar el punto de registro. Verificar con `console.log` en el WebView de Tauri que `event.location` no se normaliza a `0`.
- **Verificación**: `ng build` limpio. Al abrir el editor, un `console.log` en el handler debe confirmar que los eventos se capturan solo cuando el editor tiene foco y no en inputs externos.

---

### Tarea 4: Servicio de configuración (`literary-punctuation-settings.service.ts`)
- **Fichero**: `src/app/features/editor/literary-punctuation/literary-punctuation-settings.service.ts` (crear)
- **Qué hace**:
  - `LiteraryPunctuationSettingsService` injectable (`providedIn: 'root'`).
  - Mantiene un `Signal<LiteraryPunctuationConfig>` inicializado con `getLiteraryPunctuationDefaults()`.
  - Expose `config` como `asReadonly()`.
  - `load(stored: Partial<LiteraryPunctuationConfig>)`: fusiona defaults con lo almacenado.
  - `update(patch)`: actualiza la signal y delega la persistencia a `AppConfigService` (ver Tarea 6).
  - `updateShortcut(key, trigger)`: actualiza parcialmente `quoteShortcut` o `dashShortcut` y persiste.
- **Depende de**: Tarea 1.
- **Riesgo**: Bajo-medio — la persistencia requiere que `AppConfigService` ya tenga el campo en `AppSettings` (Tarea 5/6). Si se implementa este servicio antes de que exista el campo en `AppConfig`, la compilación fallará. El orden correcto es Tareas 5 y 6 primero, o dejar la persistencia como stub hasta que Tarea 6 esté lista.
- **Verificación**: `ng build` limpio. El servicio debe poder inyectarse en un componente sin errores.

---

### Tarea 5: Añadir campo al modelo de settings (`app-settings.model.ts`)
- **Fichero**: `src/app/core/models/app-settings.model.ts` (modificar)
- **Qué hace**:
  - Importar `LiteraryPunctuationConfig` (o `Partial<LiteraryPunctuationConfig>`) desde el nuevo módulo.
  - Añadir `literaryPunctuation?: Partial<LiteraryPunctuationConfig>;` a la interfaz `AppSettings`.
  - Añadir `literaryPunctuation: undefined` en `DEFAULT_APP_SETTINGS` (el servicio de Tarea 4 fusionará con defaults cuando sea `undefined`).
- **Depende de**: Tarea 1.
- **Riesgo**: Bajo. Atención a importaciones circulares: `app-settings.model.ts` no debe importar nada del feature de editor que a su vez importe `app-settings.model.ts`.
- **Verificación**: `ng build` limpio. El tipo `AppSettings` debe reflejar el nuevo campo.

---

### Tarea 6: Persistencia en `AppConfigService` (`app-config.service.ts`)
- **Fichero**: `src/app/core/services/app-config.service.ts` (modificar)
- **Qué hace**:
  - En `mergeWithDefaults()`, fusionar el campo `literaryPunctuation` dentro de `appSettings` de la misma forma que se fusionan `editor`, `appearance`, etc.:
    ```typescript
    literaryPunctuation: {
      ...DEFAULT_APP_SETTINGS.literaryPunctuation,
      ...stored.appSettings?.literaryPunctuation,
    },
    ```
  - En `migrateFromLocalStorage()`, no hay migración desde `localStorage` para este campo (nuevo), así que no requiere cambio.
  - Añadir métodos delegados para la persistencia:
    - `async setLiteraryPunctuation(config: Partial<LiteraryPunctuationConfig>): Promise<void>` — actualiza la signal y persiste.
  - En `load()`, tras leer el config, extraer `literaryPunctuation` y pasarlo a `LiteraryPunctuationSettingsService.load()` (ver Tarea 8).
- **Depende de**: Tarea 5.
- **Riesgo**: Medio — `AppConfigService` debe inyectar `LiteraryPunctuationSettingsService` (de Tarea 4) para llamar `load()` en bootstrap. Esto crea una dependencia circular potencial si `LiteraryPunctuationSettingsService` también inyecta `AppConfigService` para persistir. La solución es que `LiteraryPunctuationSettingsService` no inyecte `AppConfigService` directamente; en su lugar, `AppConfigService` o `SettingsService` llaman `load()` y `update()` manualmente, o el servicio de settings recibe el `AppConfigService` como parámetro de método, no como inyección de constructor. **Alternativa preferida**: `LiteraryPunctuationSettingsService` inyecta `AppConfigService` y `AppConfigService` no inyecta `LiteraryPunctuationSettingsService`. En `AppConfigService.load()`, se puede llamar al servicio de settings después de que la config esté lista (ej. desde `main.ts` o desde un efecto en el root). El orquestador debe confirmar cuál patrón prefiere.
- **Verificación**: `ng build` limpio. La app debe arrancar sin errores y la config debe leerse correctamente.

---

### Tarea 7: Delegados en `SettingsService` (`settings.service.ts`)
- **Fichero**: `src/app/core/services/settings.service.ts` (modificar)
- **Qué hace**:
  - Añadir métodos que deleguen a `AppConfigService` para actualizar la configuración de puntuación literaria, o bien exponer directamente `LiteraryPunctuationSettingsService` para que los componentes lo usen. Dado que la spec propone un servicio dedicado (`LiteraryPunctuationSettingsService`), la opción más limpia es:
    - Inyectar `LiteraryPunctuationSettingsService` en `SettingsService` (o dejar que los componentes lo inyecten directamente).
    - Si se prefiere centralizar, añadir métodos en `SettingsService` como `setLiteraryPunctuationEnabled(enabled: boolean)`, `setLiteraryPunctuationQuoteShortcut(...)`, etc., que llamen al servicio dedicado.
  - **Recomendación del plan**: los componentes inyectan directamente `LiteraryPunctuationSettingsService` (ya es `providedIn: 'root'`). No es necesario añadir delegados en `SettingsService` salvo que el equipo prefiera centralizar todo en `SettingsService`. Si se añaden, deben ser delegados simples.
- **Depende de**: Tarea 4 y Tarea 6.
- **Riesgo**: Bajo. Esencialmente una decisión de estilo; si se deja que los componentes inyecten el servicio dedicado directamente, no hay riesgo.
- **Verificación**: `ng build` limpio. No hay comportamiento funcional nuevo en esta tarea si se opta por inyección directa.

---

### Tarea 8: Integración en el componente de editor (`tiptap-editor.component.ts`)
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
- **Qué hace**:
  - Importar `LiteraryPunctuationExtension` y `LiteraryPunctuationSettingsService`.
  - Inyectar `LiteraryPunctuationSettingsService` en el componente.
  - Añadir un `effect` que observe `this.#literarySettings.config()`:
    - Si `this.editor` existe, reconstruir las extensiones con `buildExtensions(config)` y actualizar el editor.
    - Si `setOptions` con nuevas extensiones no funciona en TipTap 3.23.2, destruir y recrear el editor (la spec permite esta alternativa).
  - Modificar `createEditor()` para:
    - Leer la config actual del servicio: `const litConfig = this.#literarySettings.config();`.
    - Incluir `LiteraryPunctuationExtension.configure({ config: litConfig })` en el array de extensiones.
  - Asegurar que la recreación del editor por `rebuildKey` (LanguageTool) también incluya la extensión con la config actual.
- **Depende de**: Tarea 3, Tarea 4, Tarea 6.
- **Riesgo**: **Alto** — dos puntos críticos:
  1. **Zoneless**: el `effect` debe ejecutarse correctamente sin `NgZone`. En Angular zoneless, los `effect` se ejecutan automáticamente cuando cambian las signals, pero hay que asegurar que la referencia al editor no es `null` y que la destrucción/recuperación no causa loops infinitos.
  2. **TipTap `setOptions` vs recreate**: en TipTap 3.x, `editor.setOptions({ extensions: [...] })` puede no funcionar para añadir/quitar extensiones en caliente (a diferencia de reconfigurar opciones). Si no funciona, la alternativa es destruir y recrear. El implementer debe probar ambos caminos y usar el que funcione. Si se recrea, el `debounceTimer` debe limpiarse y el contenido pendiente debe emitirse antes de destruir, igual que ya hace el `rebuildKey` effect.
- **Verificación**: `ng build` limpio. Al abrir el editor, el listener de `LiteraryPunctuationExtension` debe estar activo en `editor.view.dom`. Al cambiar `enabled` desde el toolbar o settings, el comportamiento debe activarse/desactivarse sin reiniciar la app. Un `console.log` en el handler puede confirmar que `enabled` se respeta.

---

### Tarea 9: Toggle en la barra de herramientas (`editor-toolbar.component.ts` + `.html`)
- **Fichero**: `src/app/features/editor/tiptap/editor-toolbar.component.ts` (modificar) y `src/app/features/editor/tiptap/editor-toolbar.component.html` (modificar)
- **Qué hace**:
  - En el `.ts`:
    - Inyectar `LiteraryPunctuationSettingsService`.
    - Añadir `literaryEnabled = computed(() => this.#literarySettings.config().enabled)`.
    - Añadir `literaryTooltip = computed(() => { ... })` que use `formatShortcutLabel(config.quoteShortcut)` y muestre "Activada / Desactivada".
    - Añadir `toggleLiterary(): void { this.#literarySettings.update({ enabled: !this.literaryEnabled() }); }`.
  - En el `.html`:
    - Añadir un botón SVG con el glifo `«»` al final del grupo de controles de formato existentes, antes del `<div class="flex-1"></div>` (o antes del LT Status Indicator si el spacer lo precede).
    - El botón debe tener `[class.active]="literaryEnabled()"`, `[title]="literaryTooltip()"`, `(click)="toggleLiterary()"`.
    - El SVG debe ser inline, 14×14, consistente con el resto de la toolbar (stroke, currentColor, etc.).
- **Depende de**: Tarea 4 (para el servicio y `formatShortcutLabel`).
- **Riesgo**: Bajo. El tooltip usa `\n` para salto de línea; el navegador lo renderiza como espacio en `title`, pero es aceptable. Si se quiere multilinea real en tooltip, se requiere un componente tooltip custom (fuera de scope de esta spec).
- **Verificación**: `ng build` limpio. El botón debe aparecer en la toolbar, reflejar el estado activo/inactivo con la clase `active`, y al hacer clic toggle debe persistir en config (revisable reiniciando la app).

---

### Tarea 10: Sección de configuración en Settings Modal (`ink-settings-modal.component.ts` + `.html`)
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (modificar) y `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**:
  - Añadir una nueva sub-sección **"Puntuación literaria"** dentro de la sección **Editor** (o como sub-sección separada si la UI lo permite; la spec dice "Ajustes › Editor › Puntuación literaria"). Dado que el modal actual tiene una sidebar fija con `sections`, la forma más sencilla es añadir un grupo de controles dentro de la sección `editor` (ya que no hay sub-secciones en la sidebar).
  - Controles a añadir:
    - Toggle *Activar atajos de puntuación literaria* → `config.enabled`.
    - Campo de captura de atajo para **Comillas españolas** y **Raya de diálogo**:
      - Un `<input>` que escucha `keydown`, capture `event.code` y modificadores (Shift, Alt, Meta, Ctrl location), y llame a `updateShortcut()`.
      - Mostrar el atajo actual con `formatShortcutLabel()`.
      - Incluir una opción para distinguir Left/Right Ctrl (ej. checkbox o toggle).
    - Input numérico *Ventana de detección (caracteres)* → `quoteLookbackChars`, con min 100, max 5000.
    - Botón *Restaurar por defecto* → llama a `getLiteraryPunctuationDefaults()` y aplica vía `update()`.
  - Los controles deben inyectar `LiteraryPunctuationSettingsService` y usar `ngModel` o bindings directos a la signal.
  - La persistencia ocurre inmediatamente al cambiar (no requiere botón de guardar específico para esta sección, dado que el servicio ya persiste en `AppConfig`).
- **Depende de**: Tarea 4, Tarea 6.
- **Riesgo**: **Medio-Alto** — el capturador de atajo es la parte más compleja de la UI:
  - Debe evitar que el atajo se dispare en el navegador (ej. `Ctrl+Shift+S` abriría "Guardar como").
  - Debe manejar correctamente `event.preventDefault()` en el input del capturador.
  - Debe mostrar una representación legible del atajo capturado.
  - Si el capturador resulta demasiado complejo para una sola tarea, la spec permite delegarlo a una sub-spec futura; en ese caso, para esta spec se implementan inputs de texto que muestran `event.code` y checkboxes para los modificadores.
- **Verificación**: `ng build` limpio. Los cambios en settings deben persistir tras reiniciar la app. El toggle debe sincronizarse con el botón de la toolbar (ambos leen del mismo Signal).

---

### Tarea 11: Añadir atajos a la lista estática del modal de shortcuts (`shortcuts-modal.component.ts`)
- **Fichero**: `src/app/shared/components/shortcuts-modal.component.ts` (modificar)
- **Qué hace**:
  - Añadir un nuevo grupo `ShortcutGroup` a `BASE_SHORTCUTS` con título "Puntuación literaria".
  - Incluir dos entradas:
    - Comillas españolas: `['Ctrl', 'Shift', '<>']` (adaptado a `⌘` en macOS por `adaptShortcutsForPlatform`).
    - Raya de diálogo: `['Ctrl', 'Shift', '-']` (adaptado a `⌘` en macOS).
  - Nota: la lista estática no puede reflejar atajos personalizados por el usuario. La spec lo acepta como limitación para esta versión. Si se quiere dinamismo, requeriría leer la config del servicio en `ngOnInit`, pero el componente actual no inyecta servicios. Se puede optar por inyectar `LiteraryPunctuationSettingsService` y construir la lista dinámicamente en `ngOnInit` usando `formatShortcutLabel()` — esto es una mejora opcional pero recomendada.
- **Depende de**: Tarea 2 (para `formatShortcutLabel` si se usa la versión dinámica) o ninguna si se usa lista estática.
- **Riesgo**: Bajo.
- **Verificación**: `ng build` limpio. Abrir el modal de shortcuts (`Ctrl+Shift+?`) debe mostrar el nuevo grupo con los atajos.

---

## Orden de ejecución

1. **Tarea 1**: `literary-punctuation.types.ts` — tipos y defaults.
2. **Tarea 2**: `literary-punctuation.helpers.ts` — helpers puros.
3. **Tarea 3**: `literary-punctuation.extension.ts` — extensión TipTap con listener nativo.
4. **Tarea 5**: `app-settings.model.ts` — añadir campo al modelo de settings.
5. **Tarea 6**: `app-config.service.ts` — mergear y persistir el campo.
6. **Tarea 4**: `literary-punctuation-settings.service.ts` — servicio de config (puede ir tras Tarea 6 para evitar conflictos de persistencia, o antes con stubs).
7. **Tarea 7**: `settings.service.ts` — delegados opcionales (o skip si se usa inyección directa).
8. **Tarea 8**: `tiptap-editor.component.ts` — integrar la extensión y reacción a cambios.
9. **Tarea 9**: `editor-toolbar.component.ts` + `.html` — toggle en toolbar.
10. **Tarea 10**: `ink-settings-modal.component.ts` + `.html` — sección de configuración.
11. **Tarea 11**: `shortcuts-modal.component.ts` — añadir atajos a la lista.

---

## Puntos de atención para el Implementer

### Arquitectura crítica
1. **NO usar `addKeyboardShortcuts` ni InputRules de TipTap/ProseMirror**. El listener debe ser nativo sobre `editor.view.dom`, registrado en `onCreate` y eliminado en `onDestroy` de la extensión. Esto es un requisito no negociable de la spec para distinguir Left/Right Ctrl y usar `event.code`.
2. **Zoneless**: todos los componentes y servicios deben usar signals (`signal`, `computed`, `effect`). No usar `BehaviorSubject` ni `NgZone`. El `effect` en `TiptapEditorComponent` que reacciona a la config debe gestionar correctamente la destrucción del editor previo.
3. **Standalone**: todos los componentes son standalone. No crear NgModules. Asegurar que los nuevos ficheros se importan correctamente en `imports` de los componentes que los consumen.

### Ciclo de vida y memoria
4. **Listener cleanup**: en `onDestroy` de la extensión, **siempre** eliminar el listener con la referencia exacta guardada. Si se usa una función anónima sin guardar la referencia, el listener quedará colgado y se duplicarán eventos al recrear el editor.
5. **Recreación del editor**: si `editor.setOptions({ extensions: ... })` no funciona en TipTap 3.23.2 para añadir/quitar extensiones en caliente, destruir y recrear el editor es la alternativa válida. Antes de destruir, limpiar el `debounceTimer` y emitir el contenido pendiente (igual que ya hace el `rebuildKey` effect).

### Tipado y dependencias
6. **Importaciones**: `LiteraryPunctuationExtension` se importa en `tiptap-editor.component.ts`. `LiteraryPunctuationSettingsService` se inyecta en `tiptap-editor.component.ts`, `editor-toolbar.component.ts`, `ink-settings-modal.component.ts` y potencialmente `shortcuts-modal.component.ts`.
7. **Sin `any`**: la spec usa `(this as any)._literaryHandler` para evitar añadir propiedades no declaradas en la extensión. Esto es aceptable en este contexto por ser una propiedad privada de ciclo de vida, pero si se puede tipar correctamente (ej. extendiendo la interfaz de la extensión) es preferible.

### UI/UX
8. **Tooltip multilinea**: el atributo `title` nativo no respeta `\n`. El tooltip del toolbar mostrará la línea como espacio. Esto es aceptable para la spec; si se quiere un tooltip real con dos líneas, requeriría un componente tooltip custom (fuera de scope).
9. **Capturador de atajo**: si el input de captura de atajo es complejo, implementar una versión simplificada: un `<input readonly>` que muestra `event.code` al pulsar una tecla, y checkboxes para Shift/Alt/Meta/Ctrl Left/Right. El usuario hace clic en el input, pulsa la tecla deseada, y el sistema captura `code` + modificadores.
10. **Retrocompatibilidad**: el campo `literaryPunctuation` en `AppSettings` es opcional (`?`). Si no existe en `config.json` de instalaciones previas, `mergeWithDefaults` debe manejarlo sin errores (ej. `...stored.appSettings?.literaryPunctuation` con optional chaining).

### Plataforma y Tauri
11. **Verificar `event.location`**: antes de dar la feature por terminada, un `console.log` en el WebView de Tauri debe confirmar que `event.location` reporta `1` (Left) y `2` (Right) correctamente en Linux, Windows y macOS. Si Tauri normaliza a `0`, la distinción Left/Right Ctrl no funcionará y habrá que recurrir a una heurística (ej. `event.key` + `event.code`) o cambiar el default a `any`.
12. **Teclado ANSI**: en teclados US (ANSI) la tecla `IntlBackslash` no existe. El atajo por defecto simplemente no disparará. La UI debe ser clara en que el usuario puede configurar un atajo alternativo. No debe mostrar errores ni bloquear la app.

### Lo que NO hacer (de la spec)
- **No usar `@tiptap/extension-typography`**: no está instalado y no es necesario.
- **No modificar `TreeNode`, `InkwellProject` ni el formato de documento ProseMirror**: la extensión es aditiva.
- **No crear una base de datos ni migraciones**: la persistencia es via `config.json` a través de `AppConfigService`.
- **No exponer la API key de Anthropic ni añadir lógica de servidor**: el scope es puramente frontend + Tauri commands existentes.

---

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `editor.setOptions` no actualiza extensiones en caliente en TipTap 3.23.2 | Alto | Alternativa documentada: destruir y recrear el editor al cambiar la config. El implementer debe probar ambos caminos y documentar cuál funciona. |
| `event.location` normalizado a `0` en WebView de Tauri | Alto | Verificar con `console.log` en desarrollo. Si falla, cambiar default de `ctrl: 'left'` a `ctrl: 'any'` en Windows/Linux y documentar la limitación. |
| Capturador de atajo en Settings UI es demasiado complejo para una sola tarea | Medio | Implementar versión simplificada (input readonly + checkboxes) y dejar la versión avanzada para una sub-spec futura. |
| Dependencia circular entre `AppConfigService` y `LiteraryPunctuationSettingsService` | Medio | `AppConfigService` no inyecta `LiteraryPunctuationSettingsService`. En su lugar, el servicio de settings se inyecta en componentes que lo necesitan, y `AppConfigService` expone métodos `setLiteraryPunctuation` que el servicio de settings llama. El bootstrap (`load` inicial) puede hacerse desde `main.ts` o desde un efecto en el componente raíz. |
| El listener nativo se registra múltiples veces al recrear el editor | Medio | Asegurar que `onDestroy` de la extensión anterior siempre se ejecuta antes de `onCreate` de la nueva. TipTap garantiza `onDestroy` al destruir el editor, pero si se usa `setOptions` sin destruir, puede haber fugas. Usar `destroy()` + `new Editor()` es más seguro. |
| Performance de `smartQuoteDirection` con documentos grandes | Bajo | El scan está limitado a `quoteLookbackChars` (default 800). Verificar que `doc.textBetween` con límite de offset no escanea todo el documento. |

---

## Nota para el orquestador

Si el implementer encuentra que `editor.setOptions({ extensions: ... })` no funciona en TipTap 3.23.2, debe usar la alternativa de destruir y recrear el editor. Si el capturador de atajo en Settings resulta demasiado complejo, debe implementar la versión simplificada y reportar la necesidad de una sub-spec para la UI avanzada. Si `event.location` no funciona en Tauri, debe ajustar los defaults a `ctrl: 'any'` y documentar.
