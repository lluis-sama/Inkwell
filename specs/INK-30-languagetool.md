# INK-30 — LanguageTool: corrector gramatical y estilístico local

## ⚠️ AVISOS CRÍTICOS PARA EL ORQUESTADOR Y EL PLANNER

Estos puntos deben tratarse como **bloqueantes** en la fase de planificación. Si el planner no los contempla explícitamente, la implementación fallará en producción.

---

### CRÍTICO-1 — Ruta del JRE en macOS es diferente al resto de plataformas

En Linux y Windows, el JRE de Temurin extrae un directorio plano y el binario está en `bin/java` (o `bin\java.exe`). En macOS, el tar extrae un bundle `.app` y la ruta real es `Contents/Home/bin/java`. **`find_java_bin()` debe contemplar ambas rutas o fallará exclusivamente en Mac.** El planner debe incluir un paso de test explícito en macOS antes de dar la feature por cerrada.

### CRÍTICO-2 — Proceso Java huérfano si Inkwell crashea

`lt_stop_server()` mata el proceso en `on_window_event(CloseRequested)`, pero si la app peta sin disparar ese evento, el proceso Java queda vivo. En el siguiente arranque, Inkwell intentará lanzar otro proceso en el puerto 8081 y fallará silenciosamente. **El comando `lt_start_server` debe comprobar si el puerto 8081 ya está en uso antes de lanzar un nuevo proceso.** Si está en uso, asumir que ya hay un servidor corriendo y no lanzar otro. El planner debe incluir este check como paso obligatorio en `lt_start_server`, no como mejora futura.

### CRÍTICO-3 — La extensión TipTap NO es un paquete npm

`tiptap-languagetool` de `sereneinserenade` **no debe instalarse con `npm install`**. El único método correcto es copiar el fichero `languagetool.ts` del repositorio directamente a `src/app/shared/utils/tiptap-languagetool.ts`. Si el agente implementador intenta `npm install @sereneinserenade/tiptap-languagetool`, obtendrá una versión desactualizada o un error. El planner debe incluir el paso de copia manual del fichero fuente como tarea explícita.

### CRÍTICO-4 — El editor NO debe intentar enviar checks hasta que el servidor esté listo

La extensión LanguageTool debe añadirse al editor TipTap **condicionalmente**, solo cuando `LanguageToolService.serverReady()` sea `true`. Si se configura la extensión con `automaticMode: true` antes de que el servidor esté listo, empezará a lanzar peticiones fallidas en loop. El planner debe asegurarse de que la inicialización del editor y la de LanguageTool son dos fases separadas con una guardia explícita.

### CRÍTICO-5 — `--allow-origin '*'` es obligatorio en el servidor

La WebView de Tauri tiene un origen especial que varía por plataforma (`tauri://localhost`, `http://localhost`, etc.). Sin el flag `--allow-origin '*'` en el arranque del servidor LanguageTool, todas las peticiones del frontend serán rechazadas por CORS. **Este flag no es opcional.**

---

## Objetivo

Integrar LanguageTool como corrector gramatical, ortográfico y estilístico dentro del editor TipTap. El servidor LanguageTool corre en local, gestionado íntegramente por Inkwell — el usuario no instala Java ni ningún proceso externo. La descarga (~285 MB) ocurre bajo demanda, solo si el usuario activa la feature.

---

## Versiones pinneadas

| Componente | Versión | Fuente |
|---|---|---|
| LanguageTool | **6.7** | `https://languagetool.org/download/LanguageTool-6.7.zip` |
| Eclipse Temurin JRE | **21** (LTS) | API Adoptium v3 |

Estas versiones deben estar hardcodeadas en el código. Una actualización implica nueva spec o parche deliberado — no actualización automática.

---

## Arquitectura

```
Angular (TipTap + LanguageTool Extension)
    │  POST http://localhost:8081/v2/check
    ▼
LanguageTool HTTP Server (proceso hijo gestionado por Rust)
    │  java -jar languagetool-server.jar --port 8081
    ▼
JRE 21 bundleado en app_data_dir
```

Todo vive en `{app_data_dir}/languagetool/`:

```
{app_data_dir}/
  languagetool/
    jre/          ← Temurin JRE 21 extraído
    lt/           ← LanguageTool 6.7 extraído
    installed     ← fichero vacío que actúa como flag de instalación completa
```

---

## Parte Rust

### Módulo `src-tauri/src/languagetool.rs`

#### Estado global del proceso

```rust
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::AppHandle;

pub static LT_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

const LT_PORT: u16 = 8081;
const LT_VERSION: &str = "6.7";
const JRE_VERSION: u16 = 21;
```

#### Comando: `lt_is_installed`

Comprueba si el flag `installed` existe en `{app_data_dir}/languagetool/`.

```rust
#[tauri::command]
pub fn lt_is_installed(app: AppHandle) -> bool {
    let base = app.path().app_data_dir().unwrap().join("languagetool");
    base.join("installed").exists()
}
```

#### Comando: `lt_download_and_install`

Descarga JRE + LanguageTool ZIP, extrae, y crea el flag `installed`.
Emite progreso mediante eventos Tauri al frontend.

```rust
#[tauri::command]
pub async fn lt_download_and_install(app: AppHandle) -> Result<(), String> {
    let base = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("languagetool");

    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    // 1. Detectar plataforma y arquitectura
    let (os, arch) = detect_platform()?;

    // 2. Descargar JRE
    emit_progress(&app, "jre", 0, "Descargando Java Runtime...");
    let jre_url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jre/hotspot/normal/eclipse",
        JRE_VERSION, os, arch
    );
    download_and_extract(&app, &jre_url, &base.join("jre"), "jre").await?;

    // 3. Descargar LanguageTool
    emit_progress(&app, "lt", 0, "Descargando LanguageTool...");
    let lt_url = format!(
        "https://languagetool.org/download/LanguageTool-{}.zip",
        LT_VERSION
    );
    download_and_extract(&app, &lt_url, &base.join("lt"), "lt").await?;

    // 4. Marcar como instalado
    std::fs::write(base.join("installed"), "").map_err(|e| e.to_string())?;

    app.emit("lt-install-complete", ()).ok();
    Ok(())
}
```

**`detect_platform()`** devuelve tuplas como:
- Linux x64 → `("linux", "x64")`
- Linux ARM64 → `("linux", "aarch64")`
- Windows x64 → `("windows", "x64")`
- macOS Intel → `("mac", "x64")`
- macOS Apple Silicon → `("mac", "aarch64")`

Usar `std::env::consts::OS` y `std::env::consts::ARCH`.

**Nota sobre la descarga del JRE**: la URL de Adoptium hace redirect. `reqwest` debe seguir redirects (`redirect::Policy::limited(5)`). El binario final varía por plataforma: `.tar.gz` en Linux/macOS, `.zip` en Windows.

#### Comando: `lt_start_server`

Lanza el proceso hijo. Se llama al arrancar la app si LT está instalado.

```rust
#[tauri::command]
pub fn lt_start_server(app: AppHandle) -> Result<(), String> {
    let base = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("languagetool");

    let java_bin = find_java_bin(&base.join("jre"))?;
    let lt_jar = find_lt_jar(&base.join("lt"))?;

    let child = Command::new(&java_bin)
        .args([
            "-Xmx512m",
            "-jar", lt_jar.to_str().unwrap(),
            "--port", &LT_PORT.to_string(),
            "--allow-origin", "*",   // necesario para la WebView de Tauri
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    *LT_PROCESS.lock().unwrap() = Some(child);
    Ok(())
}
```

**`-Xmx512m`**: limita la heap de Java a 512 MB. LanguageTool básico funciona bien con 256-512 MB. Sin este flag puede consumir más de 1 GB.

**`find_java_bin`**: busca el ejecutable `java` (o `java.exe` en Windows) dentro de la carpeta JRE extraída. La ruta exacta varía según la versión, algo como `jre/jdk-21.x.x/bin/java`.

**`find_lt_jar`**: busca `languagetool-server.jar` en la carpeta LT extraída. La ruta exacta dentro del ZIP de LT es `LanguageTool-6.7/languagetool-server.jar`.

#### Comando: `lt_stop_server`

Matar el proceso al cerrar la app.

```rust
#[tauri::command]
pub fn lt_stop_server() {
    if let Ok(mut guard) = LT_PROCESS.lock() {
        if let Some(mut child) = guard.take() {
            child.kill().ok();
        }
    }
}
```

Registrar en el handler `on_window_event` de Tauri para el evento `CloseRequested`.

#### Comando: `lt_server_ready`

Polling para saber si el servidor ya acepta peticiones.

```rust
#[tauri::command]
pub async fn lt_server_ready() -> bool {
    let url = format!("http://localhost:{}/v2/languages", LT_PORT);
    reqwest::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .is_ok()
}
```

#### Comando: `lt_uninstall`

Elimina `{app_data_dir}/languagetool/` completo.

```rust
#[tauri::command]
pub fn lt_uninstall(app: AppHandle) -> Result<(), String> {
    lt_stop_server();
    let base = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("languagetool");
    std::fs::remove_dir_all(&base).map_err(|e| e.to_string())
}
```

### Registro de comandos en `lib.rs`

```rust
.invoke_handler(tauri::generate_handler![
    // ... comandos existentes ...
    languagetool::lt_is_installed,
    languagetool::lt_download_and_install,
    languagetool::lt_start_server,
    languagetool::lt_stop_server,
    languagetool::lt_server_ready,
    languagetool::lt_uninstall,
])
```

### Arranque automático en `lib.rs`

```rust
.setup(|app| {
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if languagetool::lt_is_installed(app_handle.clone()) {
            languagetool::lt_start_server(app_handle).ok();
        }
    });
    Ok(())
})
```

---

## Parte Angular

### `LanguageToolService`

`src/app/core/services/language-tool.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type LtInstallState =
  | 'not-installed'
  | 'downloading'
  | 'ready'
  | 'error';

export interface LtProgress {
  phase: 'jre' | 'lt';
  percent: number;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class LanguageToolService {
  readonly installState = signal<LtInstallState>('not-installed');
  readonly serverReady = signal(false);
  readonly progress = signal<LtProgress | null>(null);

  readonly apiUrl = `http://localhost:8081/v2/`;

  async initialize(): Promise<void> {
    const installed = await invoke<boolean>('lt_is_installed');
    if (!installed) {
      this.installState.set('not-installed');
      return;
    }

    this.installState.set('downloading'); // reutilizamos como "iniciando"
    await this.waitForServer();
    this.installState.set('ready');
    this.serverReady.set(true);
  }

  async install(): Promise<void> {
    this.installState.set('downloading');

    await listen<LtProgress>('lt-progress', (event) => {
      this.progress.set(event.payload);
    });

    await listen('lt-install-complete', async () => {
      await invoke('lt_start_server');
      await this.waitForServer();
      this.installState.set('ready');
      this.serverReady.set(true);
      this.progress.set(null);
    });

    try {
      await invoke('lt_download_and_install');
    } catch {
      this.installState.set('error');
    }
  }

  async uninstall(): Promise<void> {
    await invoke('lt_uninstall');
    this.installState.set('not-installed');
    this.serverReady.set(false);
  }

  private async waitForServer(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const ready = await invoke<boolean>('lt_server_ready');
      if (ready) return;
      await new Promise(r => setTimeout(r, 1000));
    }
    this.installState.set('error');
  }
}
```

### Extensión TipTap

La extensión **no está disponible como paquete npm estable**. La estrategia es:

1. Copiar el fichero `languagetool.ts` del repositorio `sereneinserenade/tiptap-languagetool` a `src/app/shared/utils/tiptap-languagetool.ts`
2. Adaptarlo para Angular si hay dependencias de Vue

Configuración en el editor:

```typescript
import { LanguageTool } from '../shared/utils/tiptap-languagetool';
import { inject } from '@angular/core';
import { LanguageToolService } from '../core/services/language-tool.service';

// Dentro del componente del editor, al crear la instancia de TipTap:
const ltService = inject(LanguageToolService);

const editor = new Editor({
  extensions: [
    // ... extensiones existentes ...
    LanguageTool.configure({
      language: 'auto',           // detección automática de idioma
      apiUrl: ltService.apiUrl,   // http://localhost:8081/v2/
      automaticMode: true,        // comprueba mientras escribes (debounced)
    }),
  ],
});
```

**La extensión solo debe añadirse si `ltService.serverReady()` es `true`**. Si no está listo, el editor arranca sin ella.

### `LtInstallModalComponent`

`src/app/shared/components/lt-install-modal/lt-install-modal.component.ts`:

Modal que se muestra cuando el usuario activa LanguageTool por primera vez desde Settings.

```typescript
@Component({
  selector: 'app-lt-install-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ink-modal title="Corrector gramatical" (closed)="close()">
      <div class="flex flex-col gap-4">

        @switch (ltSvc.installState()) {

          @case ('not-installed') {
            <p class="text-ink-subtle text-sm">
              El corrector gramatical requiere descargar LanguageTool y
              Java Runtime (~285 MB). El proceso puede tardar varios minutos
              según tu conexión. Los archivos se guardan en tu sistema y no
              se vuelven a descargar.
            </p>
            <p class="text-xs text-ink-subtle">
              Espacio necesario: ~390 MB
            </p>
            <div class="flex justify-end gap-2">
              <ink-button variant="ghost" (clicked)="close()">Cancelar</ink-button>
              <ink-button variant="primary" (clicked)="ltSvc.install()">
                Descargar e instalar
              </ink-button>
            </div>
          }

          @case ('downloading') {
            @if (ltSvc.progress(); as p) {
              <p class="text-sm text-ink-text">{{ p.message }}</p>
              <div class="w-full bg-ink-surface rounded-full h-2">
                <div
                  class="bg-ink-accent h-2 rounded-full transition-all"
                  [style.width.%]="p.percent">
                </div>
              </div>
              <p class="text-xs text-ink-subtle text-right">{{ p.percent }}%</p>
            } @else {
              <p class="text-sm text-ink-text">Iniciando servidor...</p>
            }
          }

          @case ('ready') {
            <p class="text-sm text-ink-text">
              ✓ LanguageTool instalado y listo.
            </p>
            <div class="flex justify-end">
              <ink-button variant="primary" (clicked)="close()">Cerrar</ink-button>
            </div>
          }

          @case ('error') {
            <p class="text-sm text-ink-error">
              Ha ocurrido un error durante la instalación. Comprueba tu
              conexión a internet e inténtalo de nuevo.
            </p>
            <div class="flex justify-end gap-2">
              <ink-button variant="ghost" (clicked)="close()">Cancelar</ink-button>
              <ink-button variant="primary" (clicked)="ltSvc.install()">Reintentar</ink-button>
            </div>
          }

        }

      </div>
    </ink-modal>
  `,
})
export class LtInstallModalComponent {
  readonly ltSvc = inject(LanguageToolService);

  close(): void {
    // emitir output o usar router/signal para cerrar el modal
  }
}
```

### Sección en Settings

En la pantalla de ajustes (ya existente), añadir una sección "Corrector gramatical":

```
[toggle]  Corrector gramatical avanzado
          Detecta errores de gramática, estilo y ortografía.
          Requiere ~390 MB de espacio en disco.

          [Estado: No instalado / Instalado (6.7) / Iniciando...]

          [Desinstalar]   ← solo visible si está instalado
```

El toggle al activarse por primera vez muestra `LtInstallModalComponent`.
El toggle al desactivarse hace `lt_stop_server()` pero NO desinstala.
"Desinstalar" hace `lt_uninstall()` y libera el disco.

### `AppComponent` — inicialización

```typescript
ngOnInit(): void {
  this.updateService.checkOnce();      // INK-28
  this.ltService.initialize();         // INK-30
}
```

---

## Progreso durante la descarga (eventos Rust → Angular)

Desde Rust, emitir eventos con `app.emit("lt-progress", payload)`:

```rust
#[derive(Clone, serde::Serialize)]
struct LtProgressPayload {
    phase: &'static str,   // "jre" | "lt"
    percent: u8,
    message: String,
}
```

Durante la descarga, emitir cada ~5% de progreso calculando `bytes_descargados / total_bytes * 100`. El header `Content-Length` de la respuesta HTTP da el total.

---

## Tamaños reales de descarga (referencia para la spec)

| Componente | Descarga | Disco extraído |
|---|---|---|
| Temurin JRE 21 (Linux x64) | ~60 MB | ~140 MB |
| Temurin JRE 21 (Windows x64) | ~55 MB | ~125 MB |
| Temurin JRE 21 (macOS x64/arm64) | ~57 MB | ~130 MB |
| LanguageTool 6.7 ZIP | ~225 MB | ~250 MB |
| **Total (aprox)** | **~285 MB** | **~380 MB** |

---

## Comportamiento por plataforma

| Plataforma | JRE OS param | JRE arch param | Java binary |
|---|---|---|---|
| Linux x64 | `linux` | `x64` | `bin/java` |
| Linux ARM64 | `linux` | `aarch64` | `bin/java` |
| Windows x64 | `windows` | `x64` | `bin\java.exe` |
| macOS Intel | `mac` | `x64` | `Contents/Home/bin/java` |
| macOS Apple Silicon | `mac` | `aarch64` | `Contents/Home/bin/java` |

La ruta en macOS es diferente porque el JRE se empaqueta como `.app` bundle dentro del tar.

---

## Caveats importantes

**El servidor tarda en arrancar**: Java + LanguageTool necesitan ~5-10 segundos para estar listos. El polling en `waitForServer()` lo maneja, pero el editor no debe intentar enviar checks hasta que `serverReady()` sea `true`.

**El proceso java sobrevive si Inkwell crashea**: En condiciones normales `lt_stop_server()` lo mata en `on_window_event`. Si hay un crash inesperado, el proceso queda huérfano. Mitigación: al arrancar, verificar si el puerto 8081 ya está en uso antes de lanzar un segundo proceso.

**`--allow-origin '*'`**: necesario porque la WebView de Tauri tiene un origen especial (`tauri://localhost` o `http://localhost` según plataforma). Sin este flag, el servidor rechaza las peticiones CORS del frontend.

**Memoria**: con `-Xmx512m` el proceso Java usa ~300-500 MB de RAM en uso normal. Es el precio a pagar. Documentarlo en la UI de settings ("Uso de memoria: ~400 MB").

---

## Tests de criterio de aceptación

- [ ] Con LT no instalado: el corrector no interfiere con el editor en absoluto
- [ ] Activar el toggle por primera vez → aparece modal con advertencia de tamaño
- [ ] La descarga muestra progreso en tiempo real (no se congela la UI)
- [ ] Si se cancela la descarga a mitad → no queda ningún flag `installed` corrupto
- [ ] Si hay error de red → se muestra el estado de error con botón de reintento
- [ ] Con LT instalado: al arrancar la app, el servidor java arranca automáticamente
- [ ] El editor muestra subrayados inline en errores gramaticales/ortográficos en español
- [ ] El editor muestra subrayados inline en inglés con idioma auto-detectado
- [ ] Al cerrar la app el proceso java muere (verificar con el gestor de tareas)
- [ ] "Desinstalar" elimina el directorio y libera ~380 MB en disco
- [ ] En macOS Apple Silicon y Linux ARM64 descarga el binario `aarch64` correcto
- [ ] Con LT instalado y servidor caído (proceso muerto externamente): la app arranca igual, el editor funciona sin corrector

---

---

## UI/UX — Flujo completo de usuario

### Primer arranque con LT no instalado

Al abrir Inkwell **por primera vez** (o la primera vez que la app detecta que LT no está instalado), mostrar **una única vez** un modal de bienvenida a la feature:

```
┌─────────────────────────────────────────────────┐
│  ✨ Corrector gramatical disponible              │
│                                                 │
│  Inkwell puede integrar LanguageTool, un        │
│  corrector gramatical y estilístico avanzado    │
│  que funciona completamente en local.           │
│                                                 │
│  Requiere descargar ~285 MB.                    │
│  Espacio en disco necesario: ~390 MB.           │
│                                                 │
│  [ Instalar ahora ]   [ Ahora no ]              │
└─────────────────────────────────────────────────┘
```

- "Instalar ahora" → arranca el proceso de descarga (ver modal de instalación)
- "Ahora no" → cierra el modal, **no vuelve a aparecer automáticamente**
- El estado de "ya se preguntó" se persiste en `AppSettings` como `ltPromptShown: boolean`
- Si el usuario más tarde quiere instalarlo, puede hacerlo desde el toolbar (ver abajo)

---

### Indicador en el toolbar del editor

En el toolbar principal del editor (junto a los controles de formato ya existentes), añadir un **indicador de estado de LanguageTool** en el extremo derecho o en una zona dedicada:

#### Estados visuales del indicador

```
[  ✓ LT  ]   → verde/accent   — servidor corriendo y listo
[ ⟳ LT  ]   → amarillo       — servidor arrancando (spinner)
[ ✗ LT  ]   → rojo/error     — servidor instalado pero caído
[ ↓ LT  ]   → gris           — no instalado
```

El indicador es siempre visible en el toolbar cuando el usuario está en la vista del editor. No se oculta nunca.

---

### Comportamiento al hacer clic en el indicador

#### Si LT está corriendo (`serverReady = true`)

Abre un modal de estado/control:

```
┌─────────────────────────────────────────────────┐
│  LanguageTool 6.7                               │
│  Estado: ✓ Activo                               │
│                                                 │
│  El corrector gramatical está funcionando.      │
│  Memoria en uso: ~400 MB                        │
│                                                 │
│  [ Detener ]          [ Cerrar ]                │
└─────────────────────────────────────────────────┘
```

- "Detener" → llama a `lt_stop_server()`, actualiza el signal a `stopped`, los subrayados del editor desaparecen
- "Cerrar" → cierra el modal sin cambios

#### Si LT está instalado pero detenido (`installState = 'ready'`, `serverReady = false`)

```
┌─────────────────────────────────────────────────┐
│  LanguageTool 6.7                               │
│  Estado: ✗ Detenido                             │
│                                                 │
│  [ Iniciar ]          [ Cerrar ]                │
└─────────────────────────────────────────────────┘
```

- "Iniciar" → llama a `lt_start_server()` y espera `waitForServer()`

#### Si LT no está instalado (`installState = 'not-installed'`)

Abre directamente el modal de instalación (el mismo de la primera vez, sin el copy de "bienvenida"):

```
┌─────────────────────────────────────────────────┐
│  Instalar corrector gramatical                  │
│                                                 │
│  Requiere descargar ~285 MB.                    │
│  Espacio en disco necesario: ~390 MB.           │
│                                                 │
│  [ Instalar ]         [ Cancelar ]              │
└─────────────────────────────────────────────────┘
```

#### Si LT está arrancando (`installState = 'downloading'` o servidor iniciando)

El clic no abre ningún modal — el indicador spinner es suficiente feedback. Ignorar el clic mientras está en transición.

---

### Modal de progreso de descarga

Cuando arranca la instalación, el modal de confirmación transiciona al estado de progreso **in-place** (no abre un modal nuevo):

```
┌─────────────────────────────────────────────────┐
│  Instalando LanguageTool                        │
│                                                 │
│  Descargando Java Runtime...                    │
│  ████████████░░░░░░░░  62%                      │
│                                                 │
│  Por favor, no cierres la aplicación.           │
└─────────────────────────────────────────────────┘
```

El modal **no tiene botón de cancelar** durante la descarga activa para evitar estados corruptos. Si el usuario cierra la app, Rust debe limpiar los ficheros parciales al siguiente arranque (comprobar si existe `installed` flag; si no existe pero hay directorio `languagetool/`, borrarlo).

---

### Componente: `LtStatusIndicatorComponent`

`src/app/shared/components/lt-status-indicator/lt-status-indicator.component.ts`

```typescript
@Component({
  selector: 'app-lt-status-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="flex items-center gap-1.5 px-2 py-1 rounded text-xs
             border border-ink-border hover:border-ink-accent
             transition-colors"
      [class]="indicatorClass()"
      [disabled]="ltSvc.installState() === 'downloading'"
      (click)="handleClick()">
      <span>{{ indicatorIcon() }}</span>
      <span>LT</span>
    </button>
  `,
})
export class LtStatusIndicatorComponent {
  readonly ltSvc = inject(LanguageToolService);
  private readonly modalSvc = inject(ModalService); // ya existente en la app

  readonly indicatorIcon = computed(() => {
    if (this.ltSvc.installState() === 'downloading') return '⟳';
    if (this.ltSvc.serverReady()) return '✓';
    if (this.ltSvc.installState() === 'error') return '✗';
    return '↓';
  });

  readonly indicatorClass = computed(() => {
    if (this.ltSvc.serverReady()) return 'text-green-400 border-green-400/30';
    if (this.ltSvc.installState() === 'error') return 'text-red-400 border-red-400/30';
    if (this.ltSvc.installState() === 'downloading') return 'text-yellow-400 border-yellow-400/30 cursor-wait';
    return 'text-ink-subtle';
  });

  handleClick(): void {
    if (this.ltSvc.installState() === 'downloading') return;

    if (this.ltSvc.serverReady()) {
      this.modalSvc.open('lt-running');
    } else if (this.ltSvc.installState() === 'not-installed') {
      this.modalSvc.open('lt-install');
    } else {
      this.modalSvc.open('lt-stopped');
    }
  }
}
```

---

### Persitencia en `AppSettings`

Añadir los siguientes campos al modelo `AppSettings` (ya existente):

```typescript
interface AppSettings {
  // ... campos existentes ...
  ltPromptShown: boolean;    // se preguntó al usuario si quería instalar LT
  ltEnabled: boolean;        // el usuario quiere LT activo (aunque esté detenido por ahora)
}
```

`ltEnabled: false` + `ltPromptShown: false` → mostrar modal de bienvenida al primer arranque
`ltEnabled: false` + `ltPromptShown: true` → no molestar, indicador visible en toolbar
`ltEnabled: true` → arrancar el servidor automáticamente al abrir la app

---

## Lo que esta spec NO hace

- No implementa descarga de datos ngram (mejoran la detección pero pesan 8+ GB)
- No implementa actualización automática de LanguageTool a nuevas versiones
- No añade diccionario personal (palabras ignoradas)
- No expone configuración de reglas individuales (habilitar/deshabilitar reglas concretas)
- No implementa el panel flotante de sugerencias — usa el que ya proporciona la extensión TipTap
