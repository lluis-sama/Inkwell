## Plan de implementación — INK-02

### Resumen

Esta spec añade la capa de filesystem al proyecto en dos bloques secuenciales: primero los 7 comandos Tauri en Rust (que deben compilar antes de tocar Angular), y después el `TauriBridgeService` de Angular más los botones de test temporales en `ProjectManagerComponent`. La discrepancia detectada entre la spec (que menciona `main.rs`) y el proyecto real (que usa `lib.rs` como punto de entrada del builder) se resuelve explícitamente: los cambios de registro de plugins y handlers van en `lib.rs`, y `main.rs` no se toca.

---

### Tareas

#### Tarea 1: Añadir dependencias Rust en Cargo.toml
- **Fichero**: `src-tauri/Cargo.toml` (modificar)
- **Qué hace**: Añadir `tauri-plugin-dialog = "2"`, `tauri-plugin-fs = "2"` y `tokio = { version = "1", features = ["fs"] }` a la sección `[dependencies]`. Sin estas dependencias el compilador rechazará el código de las tareas siguientes.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Confirmar que las versiones `"2"` de los plugins de Tauri son compatibles con la versión `"2"` de `tauri` ya declarada. No especificar sub-versiones concretas para respetar el lock file existente.

#### Tarea 2: Crear el módulo commands (mod.rs)
- **Fichero**: `src-tauri/src/commands/mod.rs` (crear)
- **Qué hace**: Declarar `pub mod fs_commands;` para que Rust reconozca el submódulo. Sin este archivo, el compilador no encontrará `fs_commands.rs`.
- **Depende de**: Tarea 1

#### Tarea 3: Implementar los 7 comandos Tauri en fs_commands.rs
- **Fichero**: `src-tauri/src/commands/fs_commands.rs` (crear)
- **Qué hace**: Implementar los 7 comandos:
  - `open_folder_dialog(app: AppHandle) -> Option<String>` — abre diálogo para seleccionar carpeta existente
  - `select_new_project_folder(app: AppHandle) -> Option<String>` — abre diálogo para elegir destino de nuevo proyecto
  - `read_json_file(path: String) -> Result<String, String>` — lee archivo y devuelve contenido como String
  - `write_json_file(path: String, content: String) -> Result<(), String>` — escribe String en disco, crea directorios intermedios si no existen
  - `list_json_files(folder_path: String) -> Result<Vec<String>, String>` — lista archivos `.json` de una carpeta; devuelve nombres sin extensión; devuelve `[]` si la carpeta no existe (idempotente)
  - `delete_json_file(path: String) -> Result<(), String>` — elimina archivo; no lanza error si no existe (idempotente)
  - `create_project_structure(base_path: String) -> Result<(), String>` — crea subdirectorios `documents/` y `boards/` bajo `base_path` con `create_dir_all` (idempotente)
  - Todos los comandos llevan el atributo `#[tauri::command]`
  - Los errores se mapean a `String` con `.map_err(|e| e.to_string())`
- **Depende de**: Tarea 2
- **Riesgo**: Los comandos de diálogo requieren `use tauri_plugin_dialog::DialogExt;`. Los comandos de fs usan `std::fs` (no `tauri-plugin-fs`; el plugin de fs es para la capa de permisos de Tauri, la I/O real en Rust usa la stdlib). `write_json_file` debe llamar `std::fs::create_dir_all` sobre el directorio padre antes de escribir, o fallará si el directorio no existe.

#### Tarea 4: Registrar el módulo y los comandos en lib.rs
- **Fichero**: `src-tauri/src/lib.rs` (modificar)
- **Qué hace**:
  - Añadir `mod commands;` al inicio del archivo para que Rust compile el módulo
  - Registrar `tauri_plugin_dialog::init()` y `tauri_plugin_fs::init()` con `.plugin()`
  - Reemplazar `greet` en `generate_handler![]` por los 7 comandos del módulo: `commands::fs_commands::open_folder_dialog`, etc.
  - Eliminar la función `greet` que ya no se necesita
- **Depende de**: Tarea 3
- **Riesgo**: Este es el fichero correcto, NO `main.rs`. La spec menciona `main.rs` pero el proyecto usa `lib.rs` como punto de entrada del builder; `main.rs` solo llama `inkwell_lib::run()` y no debe modificarse. El orden de los `.plugin()` no importa pero deben estar todos antes de `.invoke_handler()`.

#### Tarea 5: Añadir permisos de dialog y fs en capabilities/default.json
- **Fichero**: `src-tauri/capabilities/default.json` (modificar)
- **Qué hace**: Añadir los permisos necesarios al array `"permissions"`:
  - `"dialog:allow-open"` — para el diálogo de selección de carpeta existente
  - `"dialog:allow-save"` — para el diálogo de selección de destino nuevo
  - `"fs:allow-read-file"`, `"fs:allow-write-file"`, `"fs:allow-read-dir"`, `"fs:allow-remove-file"`, `"fs:allow-mkdir"` — para las operaciones de filesystem
- **Depende de**: Tarea 4
- **Riesgo**: Sin estos permisos Tauri bloqueará las llamadas en runtime aunque el código Rust compile sin errores. Los nombres exactos de los permisos deben coincidir con los que expone cada plugin; si el Implementer tiene dudas, verificar con `pnpm tauri dev` y revisar el error de permisos en consola.

#### Tarea 6: Verificación de compilación Rust
- **Fichero**: ninguno (solo verificar)
- **Qué hace**: Ejecutar `pnpm tauri dev` o `cd src-tauri && cargo check` para confirmar que el código Rust compila sin errores antes de iniciar la parte Angular.
- **Depende de**: Tarea 5
- **Riesgo**: Si hay errores de compilación en este punto, deben resolverse antes de continuar. No avanzar a Angular con el backend roto.

#### Tarea 7: Crear TauriBridgeService
- **Fichero**: `src/app/core/services/tauri-bridge.service.ts` (crear)
- **Qué hace**: Implementar el servicio Angular que es el único punto de contacto con `@tauri-apps/api`. Expone un método público por cada uno de los 7 comandos Tauri, tipados según las firmas del CLAUDE.md:
  - `openFolderDialog(): Promise<string | null>`
  - `selectNewProjectFolder(): Promise<string | null>`
  - `readJsonFile(path: string): Promise<string>`
  - `writeJsonFile(path: string, content: string): Promise<void>`
  - `listJsonFiles(folderPath: string): Promise<string[]>`
  - `deleteJsonFile(path: string): Promise<void>`
  - `createProjectStructure(basePath: string): Promise<void>`
  - La clase es `Injectable({ providedIn: 'root' })` y standalone (sin NgModules)
  - El único import de `@tauri-apps/api` en todo el proyecto frontend está aquí: `import { invoke } from '@tauri-apps/api/core'`
  - Los métodos son simples envoltorios de `invoke<T>('nombre_comando', { args })` sin lógica adicional
- **Depende de**: Tarea 6
- **Riesgo**: Los nombres de los argumentos en `invoke()` deben usar snake_case para coincidir con la firma Rust (p.ej. `{ folder_path: folderPath }`). Un error común es usar camelCase en los args del invoke, lo que causa que Rust reciba `undefined`.

#### Tarea 8: Añadir botones de test en ProjectManagerComponent
- **Fichero**: `src/app/features/project-manager/project-manager.component.ts` (modificar)
- **Qué hace**: Añadir 4 botones temporales de test al componente existente, sin eliminar el botón de tema. Los 4 tests corresponden a los criterios de aceptación:
  1. "Test: Crear estructura" — llama `createProjectStructure('/tmp/inkwell-test')`
  2. "Test: Escribir y leer" — escribe un JSON en `/tmp/inkwell-test/documents/test-doc.json` y lo lee de vuelta
  3. "Test: Listar archivos" — lista `/tmp/inkwell-test/documents/` y muestra el resultado en consola
  4. "Test: Eliminar" — elimina `/tmp/inkwell-test/documents/test-doc.json` y lista de nuevo
  - Inyectar `TauriBridgeService` con `inject()`
  - Cada método usa `async/await` con `try/catch` que loguea en consola
  - Los resultados se muestran en consola del navegador (no hace falta UI de resultado)
- **Depende de**: Tarea 7
- **Riesgo**: Este componente es temporal; debe añadirse sin romper el botón de tema existente. No importar nada de `@tauri-apps/api` directamente.

---

### Orden de ejecución

1. Tarea 1 — Cargo.toml: añadir dependencias Rust
2. Tarea 2 — commands/mod.rs: crear módulo
3. Tarea 3 — commands/fs_commands.rs: implementar los 7 comandos
4. Tarea 4 — lib.rs: registrar módulo, plugins y handlers
5. Tarea 5 — capabilities/default.json: añadir permisos
6. Tarea 6 — Verificación de compilación Rust (checkpoint obligatorio)
7. Tarea 7 — tauri-bridge.service.ts: crear servicio Angular
8. Tarea 8 — project-manager.component.ts: añadir botones de test

---

### Puntos de atención para el Implementer

**Discrepancia resuelta — lib.rs vs main.rs**
La spec menciona modificar `main.rs` para registrar plugins y handlers. El proyecto real usa `lib.rs` como punto de entrada del builder Tauri. El `main.rs` existente solo contiene `inkwell_lib::run()` y NO debe tocarse. Todos los cambios de registro van en `lib.rs`.

**Idempotencia obligatoria**
- `create_project_structure`: usar `std::fs::create_dir_all`, nunca `create_dir`. Llamar dos veces no debe fallar.
- `delete_json_file`: comprobar existencia antes de eliminar, o usar el patrón `remove_file(...).or_else(|e| if e.kind() == ErrorKind::NotFound { Ok(()) } else { Err(e) })`.
- `list_json_files`: si la carpeta no existe, devolver `Ok(vec![])`, no un error.
- `write_json_file`: llamar `create_dir_all` sobre el directorio padre del path antes de escribir.

**Args en invoke() siempre en snake_case**
Rust deserializa los argumentos por nombre. `invoke('read_json_file', { path })` es correcto. `invoke('read_json_file', { filePath })` no funcionará.

**TauriBridgeService es el único importador de @tauri-apps/api**
Ningún componente, ningún otro servicio, ningún modelo puede importar `@tauri-apps/api`. Si el Reviewer encuentra un import directo fuera de `TauriBridgeService`, es un fallo de la spec.

**Plugins de Tauri vs stdlib de Rust para I/O**
`tauri-plugin-fs` y `tauri-plugin-dialog` se necesitan como dependencias de Cargo y como plugins registrados en `lib.rs` para que el sistema de permisos de Tauri funcione. Sin embargo, la I/O real en los comandos Rust usa `std::fs` (stdlib), no las APIs del plugin de fs. El plugin de dialog sí se usa directamente vía `DialogExt` en los comandos async.

**Sin set_window_title en esta spec**
El comando `set_window_title` aparece en el CLAUDE.md como parte del contrato final, pero no es requerido por los criterios de aceptación de INK-02. No implementarlo en esta spec para mantener el scope acotado.

**Convenciones Angular**
- Servicio con `Injectable({ providedIn: 'root' })`, clase standalone, sin NgModules
- Signals no aplican a este servicio (es puro I/O async, no estado reactivo)
- El componente de test usa `inject()`, no constructor injection
