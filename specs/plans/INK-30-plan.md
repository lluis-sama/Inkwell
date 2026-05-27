# Plan de implementación — INK-30

## Resumen

Se integra LanguageTool como corrector gramatical local gestionado íntegramente por Inkwell: un módulo Rust nuevo maneja la descarga del JRE Temurin 21 y LanguageTool 6.7, el arranque del proceso Java hijo, y su destrucción al cerrar la app. En Angular se añade un `LanguageToolService`, un modal de instalación/estado, un indicador en el toolbar del editor, la sección "Corrector" en Settings, y la extensión TipTap que se activa condicionalmente cuando el servidor está listo.

---

## Regla transversal — i18n obligatorio

**TODO texto visible al usuario debe usar el sistema de traducción Transloco. Está prohibido hardcodear strings en español o inglés en templates HTML o en código TypeScript.**

Patrón en templates: `{{ 'LT.CLAVE' | transloco }}`
Patrón en TypeScript: `this.transloco.translate('LT.CLAVE')`

Los archivos de claves son `src/assets/i18n/es.json` y `src/assets/i18n/en.json`. Ambos archivos deben mantenerse en paridad 1:1 (mismas claves, cada uno en su idioma).

La Tarea I1 centraliza la adición de todas las claves LT, pero el Implementer debe asegurarse de no introducir texto hardcodeado en ninguna de las tareas anteriores. Si al implementar una tarea se descubren textos no contemplados en I1, deben añadirse en ese momento a ambos archivos de traducción.

---

## Tareas

### BLOQUE A — Rust

#### Tarea A1: Cargo.toml — añadir feature `stream` a reqwest y features `full` a tokio
- **Fichero**: `src-tauri/Cargo.toml` (modificar)
- **Qué hace**: Añade `"stream"` al array de features de `reqwest` (necesario para leer el body de la descarga en chunks y calcular el progreso). Añade `"full"` o al menos `"rt-multi-thread"` a `tokio` (el spawn en `setup()` lo requiere). Sin esto la compilación de A2 falla.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Cambiar `tokio` de `["sync"]` a `["full"]` puede aumentar el tiempo de compilación pero no rompe nada existente. Verificar que `reqwest` con `stream` es compatible con la versión 0.12 ya fijada.

#### Tarea A2: Crear `src-tauri/src/languagetool.rs` — módulo completo
- **Fichero**: `src-tauri/src/languagetool.rs` (crear)
- **Qué hace**: Implementa todo el backend de LanguageTool en un único módulo:
  - Constantes: `LT_PORT = 8081`, `LT_VERSION = "6.7"`, `JRE_VERSION = 21`
  - Estado global: `pub static LT_PROCESS: Mutex<Option<Child>>`
  - Struct `LtProgressPayload` con `#[derive(Clone, serde::Serialize)]` y campos `phase: &'static str`, `percent: u8`, `message: String`
  - Función privada `detect_platform() -> Result<(&'static str, &'static str), String>`: usa `std::env::consts::OS` y `std::env::consts::ARCH` para producir las tuplas de la tabla de plataformas de la spec
  - Función privada `find_java_bin(jre_dir: &Path) -> Result<PathBuf, String>`: busca el ejecutable `java` (o `java.exe` en Windows) dentro del árbol de subdirectorios del JRE extraído. En macOS debe buscar primero `Contents/Home/bin/java` y, si no existe, `bin/java` (CRITICO-1)
  - Función privada `find_lt_jar(lt_dir: &Path) -> Result<PathBuf, String>`: busca `languagetool-server.jar` dentro del directorio LT extraído (tipicamente `LanguageTool-6.7/languagetool-server.jar`)
  - Función privada `port_in_use(port: u16) -> bool`: intenta hacer `TcpListener::bind(("127.0.0.1", port))` — si falla, el puerto está en uso (CRITICO-2)
  - Función privada `download_and_extract(app: &AppHandle, url: &str, dest: &Path, phase: &'static str) -> Result<(), String>`: descarga con `reqwest` siguiendo redirects (`redirect::Policy::limited(5)`), lee el `Content-Length` para calcular porcentaje, emite eventos `lt-progress` cada ~5%, extrae el ZIP (Windows + LT) o tar.gz (JRE Linux/macOS) al destino. En Windows el JRE viene como ZIP, en Linux/macOS como tar.gz.
  - Comando `lt_is_installed(app: AppHandle) -> bool`
  - Comando `lt_download_and_install(app: AppHandle) -> Result<(), String>` async: si existe el directorio `languagetool/` pero NO existe el flag `installed`, borrarlo antes de empezar (CRITICO-6). Luego crea el directorio, llama a `download_and_extract` para JRE y para LT, escribe el flag `installed`.
  - Comando `lt_start_server(app: AppHandle) -> Result<(), String>`: llama a `port_in_use(8081)` y si devuelve `true` retorna `Ok(())` sin lanzar nada (CRITICO-2). Si no, lanza el proceso con `Command::new` usando `-Xmx512m`, `--port 8081`, `--allow-origin *` (CRITICO-5), redirige stdout/stderr a null, y guarda el `Child` en `LT_PROCESS`.
  - Comando `lt_stop_server()`: extrae el `Child` del mutex, llama a `.kill()` y `.wait()` para evitar zombies.
  - Comando `lt_server_ready() -> bool` async: GET a `http://localhost:8081/v2/languages` con timeout de 2s.
  - Comando `lt_uninstall(app: AppHandle) -> Result<(), String>`: llama a `lt_stop_server()`, luego `fs::remove_dir_all`.
- **Depende de**: Tarea A1
- **Riesgo**: La extracción de tar.gz requiere la crate `flate2` y `tar`, y la de ZIP requiere `zip`. Hay que añadirlas a Cargo.toml en esta misma tarea o en A1. Verificar que `std::process::Command` con `.spawn()` en Tauri 2 no requiere ninguna capability especial en `tauri.conf.json`.

#### Tarea A3: Modificar `src-tauri/src/lib.rs` — registrar módulo, setup, on_window_event
- **Fichero**: `src-tauri/src/lib.rs` (modificar)
- **Qué hace**: Añade `mod languagetool;` junto a `mod commands` y `mod updater`. Añade `.setup(|app| { ... })` antes de `.invoke_handler` donde se spawna un `tauri::async_runtime::spawn` que llama a `lt_start_server` si `lt_is_installed` devuelve true. Añade `.on_window_event(|_window, event| { if let tauri::WindowEvent::CloseRequested { .. } = event { languagetool::lt_stop_server(); } })`. Añade los 6 comandos LT al `generate_handler![]`.
- **Depende de**: Tarea A2
- **Riesgo**: El closure de `setup` recibe `&mut App`, necesita `app.handle().clone()` para pasar a las funciones async. El orden `.setup().on_window_event().invoke_handler().run()` debe respetarse — Tauri 2 es sensible al orden del builder chain.

---

### BLOQUE B — Modelos y configuración Angular

#### Tarea B1: Añadir `ltPromptShown` y `ltEnabled` al modelo `AppConfig`
- **Fichero**: `src/app/core/models/app-config.model.ts` (modificar)
- **Qué hace**: Añade `ltPromptShown: boolean` y `ltEnabled: boolean` a la interfaz `AppConfig`. Actualiza `DEFAULT_APP_CONFIG` con `ltPromptShown: false` y `ltEnabled: false`.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: El `mergeWithDefaults` en `AppConfigService` hace spread directo del nivel raíz de `AppConfig`. Al añadir campos nuevos con defaults, los usuarios que ya tienen `config.json` sin esos campos los obtendrán del default automáticamente sin código adicional. Verificar que esto es correcto leyendo la lógica de `mergeWithDefaults`.

#### Tarea B2: Añadir getters/setters LT en `AppConfigService`
- **Fichero**: `src/app/core/services/app-config.service.ts` (modificar)
- **Qué hace**: Añade los métodos `async setLtPromptShown(value: boolean)` y `async setLtEnabled(value: boolean)`, ambos con el mismo patrón de `config.update(c => ({ ...c, fieldName: value }))` seguido de `await this.persist()`. Estos métodos son los únicos puntos de escritura de las flags LT.
- **Depende de**: Tarea B1

---

### BLOQUE C — Servicio Angular y bridge

#### Tarea C1: Añadir métodos LT a `TauriBridgeService`
- **Fichero**: `src/app/core/services/tauri-bridge.service.ts` (modificar)
- **Qué hace**: Añade los 6 métodos que delegan en `invoke`:
  - `ltIsInstalled(): Promise<boolean>` → `invoke<boolean>('lt_is_installed')`
  - `ltDownloadAndInstall(): Promise<void>` → `invoke<void>('lt_download_and_install')`
  - `ltStartServer(): Promise<void>` → `invoke<void>('lt_start_server')`
  - `ltStopServer(): Promise<void>` → `invoke<void>('lt_stop_server')`
  - `ltServerReady(): Promise<boolean>` → `invoke<boolean>('lt_server_ready')`
  - `ltUninstall(): Promise<void>` → `invoke<void>('lt_uninstall')`
- **Depende de**: Tarea A2 (para que los nombres de comando coincidan)

#### Tarea C2: Crear `LanguageToolService`
- **Fichero**: `src/app/core/services/language-tool.service.ts` (crear)
- **Qué hace**: Servicio `providedIn: 'root'` con:
  - Signals: `installState = signal<LtInstallState>('not-installed')`, `serverReady = signal(false)`, `progress = signal<LtProgress | null>(null)`
  - Readonly `apiUrl = 'http://localhost:8081/v2/'`
  - Tipo `LtInstallState = 'not-installed' | 'downloading' | 'ready' | 'error'`
  - Interface `LtProgress { phase: 'jre' | 'lt'; percent: number; message: string }`
  - `initialize()`: llama a `bridge.ltIsInstalled()`, si no está instalado devuelve; si está, arranca el servidor si no está ya corriendo, llama a `waitForServer()`, pone `serverReady(true)` y `installState('ready')`
  - `install()`: pone `installState('downloading')`, registra listeners de eventos Tauri `lt-progress` y `lt-install-complete` con `listen()` de `@tauri-apps/api/event`, llama a `bridge.ltDownloadAndInstall()`
  - `stopServer()`: llama a `bridge.ltStopServer()`, pone `serverReady(false)`
  - `startServer()`: llama a `bridge.ltStartServer()`, llama a `waitForServer()`, pone `serverReady(true)` y `installState('ready')`
  - `uninstall()`: llama a `bridge.ltUninstall()`, pone `installState('not-installed')` y `serverReady(false)` y `progress(null)`
  - `waitForServer(maxAttempts = 30)` private: polling con `setTimeout` de 1s, máx 30 intentos; si se agota, pone `installState('error')`
  - Inyecta `TauriBridgeService` (no `invoke` directamente — regla del proyecto)
- **Depende de**: Tarea C1
- **Riesgo**: `listen()` de `@tauri-apps/api/event` devuelve un `UnlistenFn`. Los listeners registrados en `install()` deben guardarse y llamarse para evitar memory leaks si el usuario cancela/reintenta. Añadir un campo privado `_unlisteners: Array<() => void>` y limpiarlos al inicio de `install()` y en `uninstall()`.

---

### BLOQUE D — Extensión TipTap

#### Tarea D1: Obtener `tiptap-languagetool.ts` y colocarlo en `shared/utils`
- **Fichero**: `src/app/shared/utils/tiptap-languagetool.ts` (crear)
- **Qué hace**: Descarga mediante `curl` el fichero raw del repositorio `sereneinserenade/tiptap-languagetool` (rama main, fichero `packages/tiptap-languagetool/src/languagetool.ts`) y lo guarda en la ruta indicada. Si el fichero tiene importaciones Vue-específicas (`vue`, `@vue/...`) que no son necesarias para Angular, eliminarlas o comentarlas. El fichero debe exportar la extensión `LanguageTool` de forma compatible con TipTap 2.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: CRITICO-3 — no usar `npm install`. El fichero del repo puede tener dependencias de `@tiptap/suggestion` o `tippy.js` para el panel de sugerencias. Si esas dependencias no están instaladas en el proyecto, eliminar esa parte del código (la spec no implementa el panel flotante de sugerencias). Verificar con `pnpm ls` qué paquetes TipTap ya están instalados antes de adaptar.

---

### BLOQUE E — Componentes Angular

#### Tarea E1: Crear `LtInstallModalComponent` (TS + HTML)
- **Ficheros**: 
  - `src/app/shared/components/lt-install-modal/lt-install-modal.component.ts` (crear)
  - `src/app/shared/components/lt-install-modal/lt-install-modal.component.html` (crear)
- **Qué hace**: Componente standalone con `ChangeDetectionStrategy.OnPush`. Inyecta `LanguageToolService`. Emite un `Output` llamado `closed`. El template usa `<ink-modal>` como wrapper y `@switch (ltSvc.installState())` para mostrar los 4 estados definidos en la spec: `not-installed` (texto informativo + botón instalar), `downloading` (barra de progreso con `ltSvc.progress()`), `ready` (confirmación + botón cerrar), `error` (mensaje + botón reintentar). El modal no tiene botón de cancelar mientras está en estado `downloading` (CRITICO-6 implícito). Todos los textos usan `transloco` con claves `LT.*`.
- **Depende de**: Tarea C2
- **Riesgo**: El wrapper `<ink-modal>` tiene `closeOnOverlay = true` por defecto. En estado `downloading` hay que pasarle `[closeOnOverlay]="false"` para evitar que el usuario cierre accidentalmente durante la descarga y deje un estado corrupto.

#### Tarea E2: Crear `LtStatusIndicatorComponent`
- **Fichero**: `src/app/shared/components/lt-status-indicator/lt-status-indicator.component.ts` (crear)
- **Qué hace**: Componente standalone con `ChangeDetectionStrategy.OnPush`. Inyecta `LanguageToolService`. Renderiza un `<button>` con icono y texto "LT" cuya clase CSS y texto del icono varían según el estado del servicio usando `computed()`. Los 4 estados visuales son: running (verde, icono check), loading (amarillo, spinner unicode), error (rojo, icono X), not-installed (gris, icono flecha). El botón está deshabilitado en estado `downloading`. Al hacer clic, emite un `Output` llamado `clicked` con el estado actual para que el componente padre decida qué modal abrir. No inyecta ningún servicio de modales porque no existe `ModalService` en el proyecto — la responsabilidad de abrir modales recae en el componente padre que lo incluye en el toolbar (ver Tarea F2). Los estilos van inline con TailwindCSS, sin fichero `.css` separado.
- **Depende de**: Tarea C2
- **Riesgo**: La spec menciona `ModalService` en el código de ejemplo del componente, pero ese servicio NO existe en el codebase. El Implementer NO debe inventarlo. El patrón correcto en este proyecto es signals en el componente padre + `@if`. El indicador debe exponer un `Output` y dejar que el padre gestione la apertura del modal.

#### Tarea E3: Crear `LtWelcomeModalComponent` (modal de primer arranque)
- **Fichero**: `src/app/shared/components/lt-welcome-modal/lt-welcome-modal.component.ts` (crear, template inline)
- **Qué hace**: Modal que se muestra una única vez cuando `ltPromptShown = false`. Usa `<ink-modal>`. Muestra el copy de bienvenida de la spec ("Corrector gramatical disponible", tamaño de descarga). Tiene dos botones: "Instalar ahora" (llama a `ltService.install()` y emite `closed`) y "Ahora no" (solo emite `closed`). El componente padre (AppComponent) es responsable de marcar `ltPromptShown = true` mediante `AppConfigService` en cualquiera de las dos acciones. Template inline por simplicidad (es pequeño).
- **Depende de**: Tareas C2, B2

---

### BLOQUE F — Integración en el editor

#### Tarea F1: Modificar `tiptap-editor.component.ts` — añadir extensión LT condicionalmente
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
- **Qué hace**: Inyecta `LanguageToolService`. En `ngAfterViewInit()`, antes de construir el array de `extensions`, comprueba `ltService.serverReady()`. Si es `true`, importa y añade `LanguageTool.configure({ language: 'auto', apiUrl: ltService.apiUrl, automaticMode: true })` al array. Si es `false`, el editor arranca sin esa extensión. No se reinicializa el editor si LT se activa después del arranque — la extensión solo se activa al crear el editor si el servidor ya está listo (CRITICO-4). Nota: si se necesita soporte para activar LT dinámicamente tras el arranque (servidor lento), eso queda fuera de esta spec.
- **Depende de**: Tareas C2, D1
- **Riesgo**: CRITICO-4 — si se configura `automaticMode: true` antes de que el servidor esté listo, la extensión empieza a lanzar peticiones fallidas en bucle. La guardia `if (ltService.serverReady())` es la única protección. Dado que `ngAfterViewInit` se ejecuta una vez, si el servidor tarda más de lo esperado en arrancar (primera carga), LT simplemente no estará activo en esa sesión del editor hasta que se recargue el documento. Esto es aceptable para INK-30.

#### Tarea F2: Modificar `editor-toolbar.component.*` — añadir indicador LT
- **Ficheros**:
  - `src/app/features/editor/tiptap/editor-toolbar.component.ts` (modificar)
  - `src/app/features/editor/tiptap/editor-toolbar.component.html` (modificar)
- **Qué hace**: Importa `LtStatusIndicatorComponent` en el array `imports[]` del decorador. En el template HTML, añade `<app-lt-status-indicator>` en el extremo derecho de la toolbar. Añade en el TS los signals necesarios para gestionar la apertura de los modales LT desde el toolbar: `showLtInstallModal = signal(false)` y `showLtRunningModal = signal(false)` y `showLtStoppedModal = signal(false)`. El método `onLtIndicatorClicked(state)` abre el modal correspondiente según el estado recibido del Output del indicador. Los modales se renderizan con `@if` en el template de la toolbar (siguiendo el patrón del proyecto).
- **Depende de**: Tarea E1, E2, C2

---

### BLOQUE G — Settings

#### Tarea G1: Modificar `InkSettingsModalComponent` — añadir sección "Corrector"
- **Ficheros**:
  - `src/app/shared/components/ink-settings-modal.component.ts` (modificar)
  - `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**: Añade `'corrector'` al tipo `SettingsSection` y al array `sections[]`. Inyecta `LanguageToolService` y `AppConfigService`. En el template, añade el bloque `@if (activeSection() === 'corrector')` con: un toggle "Corrector gramatical avanzado" vinculado a `ltEnabled` del config, el estado actual (texto "No instalado" / "Instalado (6.7)" / "Iniciando..."), el uso de memoria ("~400 MB"), y un botón "Desinstalar" visible solo cuando `installState() !== 'not-installed'`. El toggle al activarse por primera vez (si no está instalado) abre el modal de instalación — se gestiona emitiendo desde settings o usando un signal local `showLtInstallModal`. El toggle al desactivarse llama a `ltService.stopServer()` pero NO desinstala.
- **Depende de**: Tareas C2, B2, E1

---

### BLOQUE H — AppComponent

#### Tarea H1: Modificar `app.component.ts` — inicialización LT y welcome modal
- **Ficheros**:
  - `src/app/app.component.ts` (modificar)
  - `src/app/app.component.html` (modificar)
- **Qué hace**: Inyecta `LanguageToolService` y `AppConfigService`. En `ngOnInit()`, después de `updateService.checkOnce()`, llama a `ltService.initialize()`. Añade el signal `showLtWelcomeModal = signal(false)`. Tras `initialize()`, comprueba si `appConfigService.config().ltEnabled` es `false` Y `appConfigService.config().ltPromptShown` es `false`: si se cumple, pone `showLtWelcomeModal(true)`. En el template, añade `@if (showLtWelcomeModal()) { <app-lt-welcome-modal (closed)="onLtWelcomeClosed($event)" /> }`. El método `onLtWelcomeClosed(installed: boolean)` llama a `appConfigService.setLtPromptShown(true)` y, si `installed`, también `appConfigService.setLtEnabled(true)`, y cierra el modal.
- **Depende de**: Tareas C2, B2, E3

---

### BLOQUE I — i18n

#### Tarea I1: Añadir claves LT a los ficheros de traducción
- **Ficheros**:
  - `src/assets/i18n/es.json` (modificar)
  - `src/assets/i18n/en.json` (modificar)
- **Qué hace**: Añade todas las claves `LT.*` necesarias para los componentes creados en los bloques E, F y G. Claves mínimas requeridas:
  - `LT.WELCOME_TITLE`, `LT.WELCOME_BODY`, `LT.WELCOME_INSTALL`, `LT.WELCOME_LATER`
  - `LT.INSTALL_TITLE`, `LT.INSTALL_BODY`, `LT.INSTALL_SIZE`, `LT.INSTALL_BTN`, `LT.CANCEL`
  - `LT.DOWNLOADING_TITLE`, `LT.DOWNLOADING_JRE`, `LT.DOWNLOADING_LT`, `LT.DOWNLOADING_WARN`
  - `LT.READY_MSG`, `LT.ERROR_MSG`, `LT.RETRY`
  - `LT.STATUS_RUNNING`, `LT.STATUS_STOPPED`, `LT.STATUS_LOADING`, `LT.STATUS_NOT_INSTALLED`
  - `LT.RUNNING_TITLE`, `LT.RUNNING_BODY`, `LT.RUNNING_STOP`, `LT.RUNNING_MEMORY`
  - `LT.STOPPED_TITLE`, `LT.STOPPED_START`
  - `SETTINGS.SECTION_CORRECTOR`, `SETTINGS.LT.TOGGLE_LABEL`, `SETTINGS.LT.TOGGLE_DESC`, `SETTINGS.LT.STATUS`, `SETTINGS.LT.UNINSTALL`, `SETTINGS.LT.MEMORY_HINT`
- **Depende de**: Tareas E1, E2, E3, G1 (necesario conocer todos los textos antes de traducir)

---

## Orden de ejecución

1. A1 — Cargo.toml: features reqwest + tokio + crates de extracción
2. A2 — `languagetool.rs`: módulo Rust completo
3. A3 — `lib.rs`: registrar módulo, setup, on_window_event, comandos
4. B1 — `app-config.model.ts`: añadir ltPromptShown, ltEnabled
5. B2 — `app-config.service.ts`: setters LT
6. C1 — `tauri-bridge.service.ts`: métodos LT
7. C2 — `language-tool.service.ts`: servicio Angular
8. D1 — `tiptap-languagetool.ts`: copiar y adaptar extensión
9. E1 — `LtInstallModalComponent`: TS + HTML
10. E2 — `LtStatusIndicatorComponent`: TS (template inline)
11. E3 — `LtWelcomeModalComponent`: TS (template inline)
12. F1 — `tiptap-editor.component.ts`: extensión LT condicional
13. F2 — `editor-toolbar.component.*`: indicador LT + modales
14. G1 — `ink-settings-modal.component.*`: sección corrector
15. H1 — `app.component.*`: inicialización LT + welcome modal
16. I1 — `es.json` + `en.json`: claves LT.*

---

## Puntos de atención para el Implementer

### Restricciones de la spec (Lo que NO hacer)
- No implementar descarga de datos ngram (8+ GB)
- No implementar actualización automática de LanguageTool
- No añadir diccionario personal
- No exponer configuración de reglas individuales
- No implementar el panel flotante de sugerencias — usar el que ya proporciona la extensión TipTap

### CRITICO-1 — Ruta del JRE en macOS
`find_java_bin()` debe buscar en este orden dentro del directorio JRE extraído:
1. `Contents/Home/bin/java` (macOS bundle .app)
2. `bin/java` (Linux)
3. `bin/java.exe` (Windows)
Usar `Path::exists()` para determinar cuál corresponde en tiempo de ejecución, no en compilación.

### CRITICO-2 — Puerto 8081 ya en uso
`lt_start_server` debe llamar a `port_in_use(8081)` ANTES de lanzar el proceso. Si devuelve `true`, retornar `Ok(())` directamente asumiendo que ya hay un servidor corriendo. Nunca intentar matar el proceso previo en este comando.

### CRITICO-3 — NO usar npm/pnpm install para la extensión TipTap
El Implementer debe usar `curl` o `wget` para descargar el fichero raw de GitHub/el repositorio de sereneinserenade. Si intenta `pnpm add @sereneinserenade/tiptap-languagetool`, obtendrá una versión incompatible.

### CRITICO-4 — Editor condicional
La línea `LanguageTool.configure(...)` solo debe aparecer dentro del bloque `if (ltService.serverReady())` en `ngAfterViewInit`. No añadir la extensión al array de extensiones base del editor. No usar `effect()` para reaccionar a cambios de `serverReady` después de la inicialización del editor (fuera de scope de esta spec).

### CRITICO-5 — `--allow-origin '*'` obligatorio
El `Command::new` en `lt_start_server` debe incluir `"--allow-origin"` y `"*"` como argumentos separados en el array de `.args([...])`. Sin esto, CORS bloquea todas las peticiones desde la WebView de Tauri.

### CRITICO-6 — Limpieza de descarga parcial
Al inicio de `lt_download_and_install`, antes de hacer nada: si `{app_data_dir}/languagetool/` existe pero `{app_data_dir}/languagetool/installed` NO existe, llamar a `fs::remove_dir_all` sobre el directorio y recrearlo. Esto limpia descargas corruptas de sesiones anteriores.

### Sin ModalService
El proyecto NO tiene ningún `ModalService`. No crearlo. El patrón es: signal booleano en el componente padre + `@if` en el template. Los modales LT se controlan desde `EditorToolbarComponent` (para el indicador) y desde `AppComponent` (para el welcome modal).

### Extracción de archivos en Rust
La crate estándar de Rust no incluye soporte para ZIP ni para tar.gz. Hay que añadir a `Cargo.toml`:
- `zip = "2"` (o la versión más reciente compatible) para extraer el ZIP de LanguageTool y el JRE de Windows
- `flate2 = "1"` y `tar = "0.4"` para extraer el tar.gz del JRE en Linux/macOS

### Convenciones Angular obligatorias
- Todos los componentes nuevos: `standalone: true`, `ChangeDetectionStrategy.OnPush`
- Signals everywhere: no `BehaviorSubject`
- `TauriBridgeService` es el único lugar con `invoke` — `LanguageToolService` inyecta `TauriBridgeService`, no llama a `invoke` directamente
- i18n obligatorio: todos los textos visibles al usuario con `transloco`
- Templates y estilos en ficheros separados para `LtInstallModalComponent` (tiene lógica HTML compleja). Para `LtStatusIndicatorComponent` y `LtWelcomeModalComponent` se acepta template inline por su simplicidad.

### Gestión de memoria en `waitForServer`
El polling usa `setTimeout` en un bucle async. Si el componente/servicio se destruye durante el polling, puede quedar colgado. Añadir una flag de cancelación o usar la señal de `AbortController` para interrumpir el polling si `installState` cambia a un estado inesperado.

### Verificar extracción multiplataforma
La función `download_and_extract` debe detectar si el archivo descargado es ZIP o tar.gz basándose en la URL (termina en `.zip` o `.tar.gz`), no en el Content-Type. La lógica de extracción es diferente según el formato.
