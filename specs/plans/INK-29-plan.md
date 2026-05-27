# Plan de implementación — INK-29

## Resumen

Implementar la comprobación de actualizaciones al arrancar Inkwell, consultando la API pública de Codeberg (Forgejo) desde Rust, comparando versiones con el crate `semver`, y mostrando un modal informativo en Angular cuando haya una versión más reciente. El usuario podrá abrir la página de releases en su navegador o descartar el modal. Todo el estado vive en memoria (signal); no se persiste en disco.

---

## Tareas

### Tarea 1 — Añadir dependencias Rust

**Archivos**: `src-tauri/Cargo.toml` (modificar)
**Descripción**: Añadir `semver = "1"` y `reqwest = { version = "0.12", features = ["json"] }` a la sección `[dependencies]`.
**Notas**:
- `reqwest` no es dependencia directa actualmente; solo existe como dependencia transitiva via `tauri-plugin-http`. Es necesario declararlo explícitamente.
- Verificar que no haya conflictos de versiones con `reqwest` ya presente transitivamente.

### Tarea 2 — Implementar módulo Rust `updater`

**Archivos**: `src-tauri/src/updater.rs` (crear)
**Descripción**: Crear el fichero con el struct `ForgejoRelease`, el struct público `UpdateInfo`, y los dos comandos Tauri: `check_for_update` y `open_releases_page`.
**Notas**:
- `check_for_update` debe usar `AppHandle` para obtener `package_info().version`.
- El `reqwest::Client` debe configurarse con timeout de 5 segundos y user-agent `"inkwell-updater"`.
- `tag_name` puede venir con prefijo `"v"`; usar `trim_start_matches('v')` antes de parsear con `semver::Version`.
- Las release notes deben limitarse a 20 líneas máximo.
- `open_releases_page` debe usar `tauri_plugin_opener::OpenerExt` con `app.opener().open_url(url, None::<&str>)` en lugar de `tauri_plugin_shell`.
- Ambos comandos devuelven `Result<..., String>` para que los errores puedan propagarse a Angular.

### Tarea 3 — Registrar módulo y comandos en `lib.rs`

**Archivos**: `src-tauri/src/lib.rs` (modificar)
**Descripción**: Añadir `mod updater;` al inicio del fichero y registrar `updater::check_for_update` y `updater::open_releases_page` en el `invoke_handler`.
**Notas**:
- Mantener el orden alfabético o el estilo existente en la lista de comandos.
- Asegurar que el módulo se declara antes de su uso en el `invoke_handler`.

### Tarea 4 — Añadir métodos wrapper a `TauriBridgeService`

**Archivos**: `src/app/core/services/tauri-bridge.service.ts` (modificar)
**Descripción**: Añadir dos métodos: `checkForUpdate(): Promise<UpdateInfo | null>` y `openReleasesPage(url: string): Promise<void>`.
**Notas**:
- `UpdateInfo` debe definirse como interfaz exportada en este servicio o en un fichero de modelos compartido. Dado que la spec lo define en `UpdateService`, el plan asume que `TauriBridgeService` usará un tipo inline o importará la interfaz si se extrae a modelos.
- **Patrón del proyecto**: `TauriBridgeService` es el único fichero que importa `invoke` de `@tauri-apps/api/core`. `UpdateService` nunca lo importará directamente.
- Los errores de red o parseo se manejan en `UpdateService`, no en el bridge.

### Tarea 5 — Crear `UpdateService`

**Archivos**: `src/app/core/services/update.service.ts` (crear)
**Descripción**: Crear el servicio con signals `updateInfo` y `checked`, y métodos `checkOnce()`, `dismiss()`, `openReleasesPage()`.
**Notas**:
- Inyectar `TauriBridgeService` en el constructor; no importar `invoke` directamente.
- `checkOnce()` debe ser idempotente: si `checked()` es `true`, retornar inmediatamente.
- Usar `try/catch` para silenciar cualquier error; no debe interferir con el arranque.
- `openReleasesPage()` obtiene la URL del signal `updateInfo`, llama al bridge, y luego hace `dismiss()`.
- El tipo `UpdateInfo` puede definirse aquí o importarse si se centraliza en modelos.

### Tarea 6 — Crear `UpdateModalComponent`

**Archivos**: `src/app/shared/components/update-modal/update-modal.component.ts` (crear)
**Descripción**: Componente standalone que muestra el modal usando `InkModalComponent` e `InkButtonComponent` cuando `updateInfo()` no es `null`.
**Notas**:
- Usar `@if (svc.updateInfo(); as info)` para la condición.
- El título del modal debe ser `'Inkwell ' + info.version + ' disponible'`.
- Las release notes deben mostrarse en un contenedor con `max-h-48 overflow-y-auto`, máximo 20 líneas (el corte ya se hace en Rust).
- Botones: "Ahora no" (variante ghost, llama `svc.dismiss()`) y "Ver en Codeberg" (variante primary, llama `svc.openReleasesPage()`).
- Usar `ChangeDetectionStrategy.OnPush`.
- Asegurar que las clases CSS usen los tokens `--ink-*` (ej. `bg-ink-bg`, `border-ink-border`, `text-ink-subtle`).

### Tarea 7 — Integrar `UpdateService` en `AppComponent`

**Archivos**: `src/app/app.component.ts` (modificar)
**Descripción**: Inyectar `UpdateService` y llamar `checkOnce()` en `ngOnInit`.
**Notas**:
- No usar `await` en `ngOnInit` para no bloquear el renderizado inicial.
- Llamada simple: `this.updateService.checkOnce();`.
- Añadir `UpdateModalComponent` al array `imports` del componente (opcional, ya que el modal se usa en el template como tag, pero Angular standalone requiere que esté importado en el componente que lo usa).

### Tarea 8 — Integrar `UpdateModalComponent` en el template raíz

**Archivos**: `src/app/app.component.html` (modificar)
**Descripción**: Añadir `<app-update-modal />` al final del template, después de los elementos existentes.
**Notas**:
- El modal se mostrará automáticamente cuando el signal `updateInfo` cambie a no-null.
- No requiere condición `@if` en `app.component.html`; la condición está dentro del propio `UpdateModalComponent`.

---

## Orden de ejecución

1. **Tarea 1**: Añadir dependencias Rust (`semver`, `reqwest`).
2. **Tarea 2**: Crear `src-tauri/src/updater.rs` con structs y comandos.
3. **Tarea 3**: Registrar `mod updater` y comandos en `src-tauri/src/lib.rs`.
4. **Tarea 4**: Añadir métodos wrapper a `TauriBridgeService`.
5. **Tarea 5**: Crear `UpdateService`.
6. **Tarea 6**: Crear `UpdateModalComponent`.
7. **Tarea 7**: Modificar `AppComponent.ts` para inyectar servicio y llamar `checkOnce()`.
8. **Tarea 8**: Modificar `AppComponent.html` para incluir `<app-update-modal />`.

---

## Decisiones técnicas

1. **tauri-plugin-opener en lugar de tauri-plugin-shell**: La spec original proponía `tauri-plugin-shell` con `ShellExt::open`, pero el proyecto ya tiene `tauri-plugin-opener = "2"` instalado y registrado en `lib.rs`. La spec no fue actualizada tras INK-08/INK-19. El plan usa `tauri_plugin_opener::OpenerExt` con `app.opener().open_url(url, None::<&str>)` en el comando `open_releases_page`. Esto evita instalar un plugin adicional y mantiene consistencia con el resto de la codebase.

2. **reqwest como dependencia directa**: Aunque `reqwest` está presente transitivamente via `tauri-plugin-http`, no es dependencia directa en `Cargo.toml`. El plan lo declara explícitamente con `features = ["json"]` para garantizar que el módulo `updater.rs` pueda usarlo sin depender de la resolución transitiva.

3. **TauriBridgeService patrón**: La spec original mostraba `import { invoke } from '@tauri-apps/api/core'` directamente en `UpdateService`. El plan sigue la convención establecida del proyecto: `TauriBridgeService` es el único punto de contacto con Tauri. Se añaden los métodos `checkForUpdate()` y `openReleasesPage()` al bridge, y `UpdateService` los consume inyectando `TauriBridgeService`.

---

## Puntos de atención para el Implementer

- **Fallos silenciosos**: Cualquier error en Rust (red, timeout, parseo) o en Angular debe ser capturado y descartado. No mostrar toasts ni logs visibles al usuario.
- **Una vez por sesión**: El guard `checked` en `UpdateService` garantiza que `checkOnce()` no dispare múltiples peticiones HTTP. No persiste en disco ni en `localStorage`.
- **Sin `await` en `ngOnInit`**: La llamada a `checkOnce()` en `AppComponent` debe ser fire-and-forget para no bloquear el arranque de la UI.
- **Zoneless**: No usar `NgZone`. Los signals se detectan automáticamente con `ChangeDetectionStrategy.OnPush`.
- **User-Agent**: El cliente `reqwest` debe enviar `user_agent("inkwell-updater")` para identificación en logs del servidor.
- **Prefijo `v` en tag_name**: Forgejo/Codeberg pueden devolver `"v1.2.3"` o `"1.2.3"`. Siempre aplicar `trim_start_matches('v')` antes de `Version::parse`.
- **Max 20 líneas de release notes**: El corte se hace en Rust (`lines().take(20)`) para no enviar datos innecesarios al frontend.
- **Timeout**: 5 segundos en la petición HTTP para evitar bloqueos prolongados en arranque.
- **No añadir opción de desactivar**: Esta spec NO incluye toggle en settings para desactivar la comprobación. No implementar dicha opción.

---

## Checklist de criterios de aceptación

- [ ] Con internet y versión actual < remota → modal aparece al arrancar.
- [ ] Con internet y versión actual >= remota → no ocurre nada.
- [ ] Sin internet (timeout) → no ocurre nada, la app arranca con normalidad.
- [ ] "Ahora no" → modal desaparece, no vuelve a aparecer en la misma sesión.
- [ ] "Ver en Codeberg" → se abre el navegador por defecto en la URL de la release → modal desaparece.
- [ ] Cerrar y reabrir la app → vuelve a comprobar (no persiste estado en disco).
- [ ] `checkOnce()` llamado varias veces en la misma sesión → solo hace la llamada HTTP una vez (`checked` guard).
