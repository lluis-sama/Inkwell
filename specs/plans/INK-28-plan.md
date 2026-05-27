## Plan de implementación — INK-28

### Resumen

Migrar los cinco datos persistentes que actualmente viven en `localStorage` (`inkwell-api-key`, `inkwell-app-settings`, `inkwell-theme`, `inkwell-recent-projects`, `inkwell-lang`) a un único fichero `config.json` en el directorio de datos de la aplicación Tauri (`~/.local/share/net.neocodelabs.inkwell/config.json`). La migración introduce dos comandos Rust nuevos, un servicio Angular `AppConfigService` que actúa como única fuente de verdad, y actualiza todos los servicios y componentes que hoy escriben o leen directamente de `localStorage`. El idioma (`lang`) requiere un tratamiento especial vía `APP_INITIALIZER` por la limitación del bootstrap síncrono de Transloco.

---

### Tareas

#### Tarea 1: Modelo `AppConfig` en TypeScript
- **Fichero**: `src/app/core/models/app-config.model.ts` (crear)
- **Qué hace**: Define la interfaz `AppConfig` con los campos `apiKey`, `theme`, `lang`, `appSettings` (sin `appearance.theme`, que se sube a nivel raíz), `recentProjects` y `version: number`. Define también `RecentProject` (nombre, basePath, openedAt) y la constante `DEFAULT_APP_CONFIG` con valores de arranque (version: 1, theme: 'dark', lang: 'es', apiKey: '', recentProjects: []). El campo `appSettings` usará `AppSettings` de `app-settings.model.ts` tal cual existe hoy, incluyendo `appearance.theme` — la consolidación del tema duplicado se resuelve en la Tarea 5.
- **Depende de**: ninguna dependencia previa

#### Tarea 2: Comandos Rust `read_app_config` / `write_app_config`
- **Fichero**: `src-tauri/src/commands/fs_commands.rs` (modificar — añadir al final)
- **Qué hace**: Añade dos comandos públicos:
  - `read_app_config(app: AppHandle) -> Result<String, String>`: resuelve `app.path().app_data_dir()`, construye la ruta `<app_data_dir>/config.json` y lee su contenido como String. Si el fichero no existe devuelve `Ok(String::new())` (string vacío, no error — el cliente interpreta vacío como primer arranque).
  - `write_app_config(app: AppHandle, content: String) -> Result<(), String>`: resuelve `app_data_dir()`, crea el directorio si no existe, escribe el contenido.
  - Ambos son `async fn` por requerir `AppHandle`.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: `app.path().app_data_dir()` devuelve `Result` en Tauri 2.x; hay que hacer `.map_err(|e| e.to_string())?` en ambos comandos.

#### Tarea 3: Registrar los dos nuevos comandos en `lib.rs`
- **Fichero**: `src-tauri/src/lib.rs` (modificar)
- **Qué hace**: Añade `commands::fs_commands::read_app_config` y `commands::fs_commands::write_app_config` al array de `generate_handler!`.
- **Depende de**: Tarea 2

#### Tarea 4: Exponer los dos nuevos comandos en `TauriBridgeService`
- **Fichero**: `src/app/core/services/tauri-bridge.service.ts` (modificar)
- **Qué hace**: Añade dos métodos:
  - `readAppConfig(): Promise<string>` — invoca `read_app_config`.
  - `writeAppConfig(content: string): Promise<void>` — invoca `write_app_config`, pasando `content` como parámetro.
- **Depende de**: Tarea 3

#### Tarea 5: Nuevo servicio `AppConfigService`
- **Fichero**: `src/app/core/services/app-config.service.ts` (crear)
- **Qué hace**: Servicio `providedIn: 'root'` que:
  1. Expone `readonly config = signal<AppConfig>(DEFAULT_APP_CONFIG)`.
  2. Tiene un método `async load(): Promise<void>` que llama a `TauriBridgeService.readAppConfig()`, parsea el JSON, aplica migración desde localStorage si `config.json` no existe (ver sección de migración), y llama a `config.set(merged)`.
  3. Tiene un método privado `async persist(): Promise<void>` que serializa `config()` y llama a `TauriBridgeService.writeAppConfig()`.
  4. Expone métodos de escritura públicos (cada uno llama a `config.update(...)` + `persist()`):
     - `setApiKey(key: string): Promise<void>`
     - `clearApiKey(): Promise<void>`
     - `setTheme(theme: 'light' | 'dark'): Promise<void>`
     - `setLang(lang: 'es' | 'en'): Promise<void>`
     - `setAppSettings(settings: AppSettings): Promise<void>`
     - `addRecentProject(name: string, basePath: string): Promise<void>`
     - `removeRecentProject(basePath: string): Promise<void>`
     - `getRecentProjects(): Array<RecentProject>` (síncrono, lee del signal)

  **Estrategia de migración one-shot (en `load()`)**: si `read_app_config` devuelve string vacío (fichero no existe) Y `localStorage` tiene alguna de las cinco claves conocidas, leer cada clave de localStorage, construir el `AppConfig` fusionado y persistirlo en `config.json`. Eliminar las claves de localStorage después de la migración exitosa. Si no hay nada en localStorage, usar `DEFAULT_APP_CONFIG`.

  **Consolidación del tema duplicado**: al leer `inkwell-app-settings` durante la migración, si existe `inkwell-theme` en localStorage, ese valor tiene prioridad para `config.theme`; de lo contrario se usa `stored.appearance.theme` si existe. El campo `appSettings.appearance.theme` del config.json se mantiene sincronizado con `config.theme` en cada llamada a `setTheme()`.

- **Depende de**: Tarea 1, Tarea 4
- **Riesgo**: El método `load()` es async; no puede llamarse en el constructor directamente para inicializar el signal de forma síncrona. El signal arranca con `DEFAULT_APP_CONFIG`; los componentes ven los valores reales solo tras completarse el `APP_INITIALIZER` de la Tarea 9.

#### Tarea 6: Actualizar `AiService`
- **Fichero**: `src/app/core/services/ai.service.ts` (modificar)
- **Qué hace**:
  - Inyectar `AppConfigService`.
  - Reemplazar `readonly apiKey = signal<string>(localStorage.getItem('inkwell-api-key') ?? '')` por `readonly apiKey = computed(() => this.appConfig.config().apiKey)`.
  - Reemplazar el cuerpo de `saveApiKey(key)` por `await this.appConfig.setApiKey(key)` (el método pasa a ser `async`).
  - Reemplazar el cuerpo de `clearApiKey()` por `await this.appConfig.clearApiKey()` (ídem).
  - Eliminar todos los `localStorage.setItem/getItem/removeItem` relacionados con `inkwell-api-key`.
- **Depende de**: Tarea 5
- **Riesgo**: `apiKey` pasa de `WritableSignal` a `computed`. Si algún componente llama a `apiKey.set(...)` directamente (sin pasar por `saveApiKey`), fallará en compilación — hay que verificar con grep antes de implementar. Según el Explorer, no hay consumidores directos de `apiKey.set()`.

#### Tarea 7: Actualizar `SettingsService`
- **Fichero**: `src/app/core/services/settings.service.ts` (modificar)
- **Qué hace**:
  - Inyectar `AppConfigService`.
  - Cambiar `readonly settings = signal<AppSettings>(this.loadSettings())` a `readonly settings = computed(() => this.appConfig.config().appSettings)`.
  - Eliminar el método privado `loadSettings()` y la constante `STORAGE_KEY`.
  - Reescribir `updateSettings(partial)` para que llame a `this.appConfig.setAppSettings({ ...this.settings(), ...partial })`. El método pasa a ser `async`; todos los métodos públicos `setEditorFontFamily`, `setEditorFontSize`, etc. pasan a ser `async` también.
  - Eliminar todos los `localStorage.*` del servicio.
- **Depende de**: Tarea 5
- **Riesgo**: `settings` pasa de `WritableSignal` a `computed`. Los consumidores que lean `settings()` no se ven afectados. Los consumidores que llamen a los setters deben poder manejar Promises; revisar con grep si algún caller usa el valor de retorno de los setters (actualmente todos son `void`, no deberían romper).

#### Tarea 8: Actualizar `ThemeService`
- **Fichero**: `src/app/core/services/theme.service.ts` (modificar)
- **Qué hace**:
  - Inyectar `AppConfigService`.
  - Cambiar `readonly theme = signal<Theme>(this.getInitialTheme())` a `readonly theme = computed(() => this.appConfig.config().theme as Theme)`.
  - En el `effect` que aplica el atributo DOM (`data-theme`): mantenerlo igual, pero eliminar la línea `localStorage.setItem('inkwell-theme', this.theme())`.
  - Reescribir `toggle()` para que llame a `this.appConfig.setTheme(this.theme() === 'dark' ? 'light' : 'dark')` (async).
  - Reescribir `setTheme(theme)` para que llame a `this.appConfig.setTheme(theme)` (async).
  - Eliminar el método privado `getInitialTheme()` y toda referencia a `localStorage`.
  - El fallback al sistema operativo (`window.matchMedia`) se mueve a `DEFAULT_APP_CONFIG`: se puede detectar al definir la constante o en el `AppConfigService.load()` como parte del default si no hay nada persistido.
- **Depende de**: Tarea 5
- **Riesgo**: El tema se aplica al DOM mediante el `effect`. Como el signal `theme` ahora depende del signal `config` de `AppConfigService`, el `effect` solo ejecutará el `setAttribute` una vez que `config` se haya cargado (tras el `APP_INITIALIZER`). El efecto visual es que el tema puede aplicarse con un breve retraso al arranque — aceptable porque ocurre dentro del bootstrap de Angular antes de que el primer frame sea visible.

#### Tarea 9: Actualizar `ProjectService`
- **Fichero**: `src/app/core/services/project.service.ts` (modificar)
- **Qué hace**:
  - Inyectar `AppConfigService`.
  - Reemplazar `getRecentProjects()` por delegación a `this.appConfig.getRecentProjects()`.
  - Reemplazar `addRecentProject(name, basePath)` para que llame a `await this.appConfig.addRecentProject(name, basePath)` (async).
  - Reemplazar `removeRecentProject(basePath)` para que llame a `await this.appConfig.removeRecentProject(basePath)` (async).
  - Eliminar todos los `localStorage.*` relacionados con `inkwell-recent-projects`.
- **Depende de**: Tarea 5

#### Tarea 10: Actualizar escritura de idioma en `InkNavComponent` y `ProjectManagerComponent`
- **Fichero**: `src/app/shared/components/ink-nav.component.ts` (modificar)
- **Fichero**: `src/app/features/project-manager/project-manager.component.ts` (modificar)
- **Qué hace**: En ambos componentes, en el método que cambia el idioma (el que hace `setActiveLang` + `localStorage.setItem`):
  - Mantener la llamada a `translocoService.setActiveLang(next)` — sigue siendo necesaria para el cambio inmediato en la sesión activa.
  - Sustituir `localStorage.setItem('inkwell-lang', next)` por `await this.appConfig.setLang(next)`.
  - Inyectar `AppConfigService` en ambos componentes.
- **Depende de**: Tarea 5

#### Tarea 11: Actualizar `app.config.ts` con `APP_INITIALIZER` para idioma
- **Fichero**: `src/app/app.config.ts` (modificar)
- **Qué hace**:
  - Mantener `defaultLang: localStorage.getItem('inkwell-lang') ?? 'es'` como solución provisional para el bootstrap síncrono de Transloco. Esta línea NO se elimina en esta tarea.
  - Añadir un `APP_INITIALIZER` que:
    1. Inyecta `AppConfigService` y llama a `appConfigService.load()`.
    2. Tras la carga, lee `appConfigService.config().lang`.
    3. Inyecta `TranslocoService` y llama a `translocoService.setActiveLang(lang)` si el idioma difiere del que Transloco cargó por defecto desde localStorage.
  - El `APP_INITIALIZER` devuelve una `Promise` o usa `inject()`; debe ser compatible con zoneless (no usar NgZone).
  - Firma del factory: `() => async () => { ... }` con `multi: true`, `useFactory`, `deps: [AppConfigService, TranslocoService]`.
  - Una vez que el `APP_INITIALIZER` funciona, la línea de `localStorage.getItem('inkwell-lang')` queda como cache rápida (el usuario verá el idioma correcto desde el primer frame en arranques normales; solo en el primer arranque post-actualización donde localStorage esté vacío pero config.json tenga el idioma, Transloco arrancará en 'es' y el initializer lo corregirá antes de que el usuario vea la pantalla).
- **Depende de**: Tarea 5
- **Riesgo**: Es el punto más delicado de la spec. En zoneless, el `APP_INITIALIZER` debe resolverse antes de que Angular muestre el primer componente. El uso de `async/await` dentro del factory es el patrón correcto con `provideAppInitializer` de Angular 19 o el proveedor `{ provide: APP_INITIALIZER, useFactory: ..., multi: true }`. Si se usa `APP_INITIALIZER` clásico, el valor de retorno del factory debe ser una función que devuelva Promise. Verificar que `TranslocoService` está disponible en el inyector raíz en este punto del bootstrap.

---

### Orden de ejecución

1. Tarea 1 — Modelo `AppConfig`
2. Tarea 2 — Comandos Rust
3. Tarea 3 — Registrar comandos en `lib.rs`
4. Tarea 4 — Exponer en `TauriBridgeService`
5. Tarea 5 — `AppConfigService` (central; el resto depende de aquí)
6. Tarea 6 — `AiService`
7. Tarea 7 — `SettingsService`
8. Tarea 8 — `ThemeService`
9. Tarea 9 — `ProjectService`
10. Tarea 10 — `InkNavComponent` + `ProjectManagerComponent`
11. Tarea 11 — `app.config.ts` con `APP_INITIALIZER`

---

### Puntos de atención para el Implementer

**Consolidación del tema duplicado**
Actualmente existen dos fuentes de verdad para el tema: `inkwell-theme` (string directo) y `AppSettings.appearance.theme`. Tras la migración, la fuente de verdad es `AppConfig.theme`. El campo `appSettings.appearance.theme` debe mantenerse sincronizado en `AppConfigService.setTheme()` actualizando ambos al mismo tiempo. Sin esto, `SettingsService` leerá el tema incorrecto si algún código lee `settings().appearance.theme`.

**`computed()` no es `WritableSignal`**
`AiService.apiKey`, `SettingsService.settings` y `ThemeService.theme` pasan de `WritableSignal` a `computed`. Antes de implementar cada tarea, verificar con grep que ningún consumidor externo llama a `.set()` o `.update()` directamente sobre esas propiedades. Si existe alguno, ese consumidor también debe actualizarse.

**`app_data_dir()` en Tauri 2.x**
La API es `app.path().app_data_dir()` que devuelve `Result<PathBuf, tauri::Error>`. No es `app.path_resolver().app_data_dir()` (API de Tauri 1.x). Usar el patrón `.map_err(|e| e.to_string())?`.

**Migración one-shot: no lanzar errores al usuario**
Si la migración desde localStorage falla por JSON corrupto u otro motivo, el `AppConfigService.load()` debe silenciar el error y usar `DEFAULT_APP_CONFIG`. No propagar el error al `APP_INITIALIZER` — que el app arranque siempre, aunque pierda settings de una sesión anterior.

**`setLang` en los componentes: no eliminar `setActiveLang`**
Al sustituir el `localStorage.setItem('inkwell-lang')` por `appConfig.setLang()`, no eliminar la llamada a `translocoService.setActiveLang(next)`. Esa llamada es la que cambia el idioma inmediatamente en la sesión activa. `appConfig.setLang()` solo persiste para la próxima vez.

**Métodos async en `SettingsService`**
`setEditorFontFamily`, `setEditorFontSize`, `setUiFontScale`, `setAiPanelWidth`, `setDeskPosition`, `setDeskBottomHeight`, `setDeskSideWidth` pasan a ser `async`. Revisar todos los consumidores de estos métodos en templates y componentes para añadir `await` o manejo de Promise donde corresponda.

**Fallback al sistema operativo para el tema**
`ThemeService.getInitialTheme()` incluye lógica de `window.matchMedia`. Esta lógica debe preservarse en `AppConfigService.load()`: si `config.json` no existe y `localStorage` no tiene `inkwell-theme`, detectar el tema del sistema y usarlo como default en lugar de `'dark'`.

**Zoneless + `APP_INITIALIZER`**
En zoneless, los efectos secundarios del `APP_INITIALIZER` (como llamar a `translocoService.setActiveLang`) no disparan detección de cambios automáticamente. Si se necesita forzar un re-render tras el cambio de idioma, usar `ChangeDetectorRef.markForCheck()` o confiar en que Transloco con `reRenderOnLangChange: true` lo gestiona vía sus propios observables.

**Sin `NgModules`**
El `APP_INITIALIZER` se añade directamente al array `providers` de `appConfig` en `app.config.ts`. No crear ningún módulo.

**Restricción de la spec: sin base de datos, sin servidor**
Todo el I/O pasa por `TauriBridgeService` → comandos Rust. El `config.json` vive en disco local. No introducir ningún mecanismo de sincronización o backend.
