# INK-29 — Comprobación de actualizaciones

## Objetivo

Al arrancar la aplicación, Inkwell consulta la API pública de Codeberg para comprobar si existe una versión más reciente. Si la hay, muestra un modal informativo una única vez por sesión. El usuario puede abrir la página de releases en su navegador por defecto o descartar el modal. No hay descarga ni instalación automática.

---

## Decisiones de diseño

- **Sin `tauri-plugin-updater`**: no se usa el sistema de auto-update nativo de Tauri. Evita la complejidad de code signing, keypairs y las diferencias entre formatos de paquete por plataforma (`.deb`, `.AppImage`, `.msi`, `.dmg`).
- **Endpoint**: API pública de Forgejo — `GET https://codeberg.org/api/v1/repos/frozenfangkb/inkwell/releases/latest`. No requiere token. No requiere mantener ningún fichero extra en el repositorio.
- **Comparación de versiones**: semver estricto con el crate `semver`. La versión actual de la app se obtiene con `tauri::App::package_info().version` en tiempo de ejecución.
- **Una vez por sesión**: el estado vive en memoria Angular (signal). No se persiste en `AppSettings` ni en disco — si el usuario descarta el modal y cierra la app, la próxima sesión vuelve a comprobar.
- **Apertura del navegador**: `tauri-plugin-shell` (ya instalado desde INK-08/INK-19) con `open_url`.
- **Fallos silenciosos**: cualquier error de red o de parseo se descarta sin mostrar nada al usuario. No debe interferir con el arranque.

---

## Crates nuevos

En `src-tauri/Cargo.toml`:

```toml
semver = "1"
```

`reqwest` ya debe estar disponible desde INK-13 (transcripción). Si no, añadir:

```toml
reqwest = { version = "0.12", features = ["json"] }
```

---

## Parte Rust

### Struct de respuesta

`src-tauri/src/updater.rs` (fichero nuevo):

```rust
use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const RELEASES_API: &str =
    "https://codeberg.org/api/v1/repos/frozenfangkb/inkwell/releases/latest";

const RELEASES_PAGE: &str =
    "https://codeberg.org/frozenfangkb/inkwell/releases";

#[derive(Debug, Deserialize)]
struct ForgejoRelease {
    tag_name: String,
    body: Option<String>,
    html_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub release_notes: String,
    pub url: String,
}
```

### Comando `check_for_update`

```rust
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current = app.package_info().version.clone();
    let current_semver = Version::new(
        current.major as u64,
        current.minor as u64,
        current.patch as u64,
    );

    let release: ForgejoRelease = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("inkwell-updater")
        .build()
        .map_err(|e| e.to_string())?
        .get(RELEASES_API)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // tag_name puede ser "v1.2.3" o "1.2.3"
    let tag = release.tag_name.trim_start_matches('v');

    let remote_semver = Version::parse(tag).map_err(|e| e.to_string())?;

    if remote_semver > current_semver {
        Ok(Some(UpdateInfo {
            version: remote_semver.to_string(),
            release_notes: release
                .body
                .unwrap_or_default()
                .lines()
                .take(20)           // máximo 20 líneas en el modal
                .collect::<Vec<_>>()
                .join("\n"),
            url: release
                .html_url
                .unwrap_or_else(|| RELEASES_PAGE.to_string()),
        }))
    } else {
        Ok(None)
    }
}
```

### Comando `open_releases_page`

```rust
#[tauri::command]
pub async fn open_releases_page(url: String, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app.shell()
        .open(&url, None)
        .map_err(|e| e.to_string())
}
```

### Registro en `lib.rs` / `main.rs`

```rust
.invoke_handler(tauri::generate_handler![
    // ... comandos existentes ...
    updater::check_for_update,
    updater::open_releases_page,
])
```

---

## Parte Angular

### `UpdateService`

`src/app/core/services/update.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  version: string;
  release_notes: string;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  readonly updateInfo = signal<UpdateInfo | null>(null);
  readonly checked = signal(false);

  async checkOnce(): Promise<void> {
    if (this.checked()) return;
    this.checked.set(true);

    try {
      const info = await invoke<UpdateInfo | null>('check_for_update');
      if (info) {
        this.updateInfo.set(info);
      }
    } catch {
      // fallo silencioso — no interrumpir el arranque
    }
  }

  dismiss(): void {
    this.updateInfo.set(null);
  }

  async openReleasesPage(): Promise<void> {
    const info = this.updateInfo();
    if (!info) return;
    try {
      await invoke('open_releases_page', { url: info.url });
    } catch {
      // silencioso
    }
    this.dismiss();
  }
}
```

### `AppComponent` — llamada al arrancar

En `src/app/app.component.ts`, dentro de `ngOnInit` o con `effect`:

```typescript
export class AppComponent implements OnInit {
  private readonly updateService = inject(UpdateService);

  ngOnInit(): void {
    // No await — no bloquea el arranque de la UI
    this.updateService.checkOnce();
  }
}
```

### `UpdateModalComponent`

`src/app/shared/components/update-modal/update-modal.component.ts`:

```typescript
import {
  Component, inject, ChangeDetectionStrategy,
} from '@angular/core';
import { UpdateService } from '../../../core/services/update.service';
import { InkModalComponent } from '../ink-modal.component';
import { InkButtonComponent } from '../ink-button.component';

@Component({
  selector: 'app-update-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InkModalComponent, InkButtonComponent],
  template: `
    @if (svc.updateInfo(); as info) {
      <ink-modal
        [title]="'Inkwell ' + info.version + ' disponible'"
        (closed)="svc.dismiss()">

        <div class="flex flex-col gap-4">

          <p class="text-ink-subtle text-sm">
            Hay una nueva versión de Inkwell disponible. Visita la página
            de releases para descargar el instalador para tu sistema.
          </p>

          @if (info.release_notes) {
            <div class="rounded-lg bg-ink-bg border border-ink-border p-3
                        max-h-48 overflow-y-auto">
              <p class="text-xs font-semibold text-ink-subtle mb-2 uppercase
                         tracking-wide">
                Novedades
              </p>
              <pre class="text-sm text-ink-text whitespace-pre-wrap
                          font-sans leading-relaxed">{{ info.release_notes }}</pre>
            </div>
          }

          <div class="flex justify-end gap-2">
            <ink-button variant="ghost" (clicked)="svc.dismiss()">
              Ahora no
            </ink-button>
            <ink-button variant="primary" (clicked)="svc.openReleasesPage()">
              Ver en Codeberg
            </ink-button>
          </div>

        </div>
      </ink-modal>
    }
  `,
})
export class UpdateModalComponent {
  readonly svc = inject(UpdateService);
}
```

### Integración en `AppComponent` template

```html
<!-- Al final del template raíz, antes del cierre -->
<app-update-modal />
```

---

## Flujo completo

```
App arranca
  → ngOnInit llama checkOnce()
  → Rust: GET Codeberg API (timeout 5s)
      ├── Error de red → checked = true, updateInfo = null → silencioso
      └── Respuesta OK
            ├── versión remota <= actual → updateInfo = null → nada
            └── versión remota > actual → updateInfo = { version, notes, url }
                  → UpdateModalComponent detecta signal ≠ null
                  → Modal aparece
                        ├── "Ahora no" → dismiss() → updateInfo = null
                        └── "Ver en Codeberg" → open_releases_page() → navegador
                              → dismiss() → updateInfo = null
```

---

## Tests de criterio de aceptación

- [ ] Con internet y versión actual < remota → modal aparece al arrancar
- [ ] Con internet y versión actual >= remota → no ocurre nada
- [ ] Sin internet (timeout) → no ocurre nada, la app arranca con normalidad
- [ ] "Ahora no" → modal desaparece, no vuelve a aparecer en la misma sesión
- [ ] "Ver en Codeberg" → se abre el navegador por defecto en la URL de la release → modal desaparece
- [ ] Cerrar y reabrir la app → vuelve a comprobar (no persiste estado en disco)
- [ ] `checkOnce()` llamado varias veces en la misma sesión → solo hace la llamada HTTP una vez (`checked` guard)

---

## Lo que esta spec NO hace

- No descarga ni instala nada automáticamente
- No persiste "ignorar esta versión" en `AppSettings`
- No muestra ningún indicador de "comprobando..." durante el fetch
- No añade ninguna opción de configuración para desactivar las comprobaciones
