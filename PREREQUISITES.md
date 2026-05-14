# Inkwell — Prerrequisitos

Entorno de desarrollo para Debian 13 (Trixie). Tiempo estimado de instalación: 15-20 minutos.

---

## 1. Dependencias del sistema (Tauri + Linux)

Tauri necesita WebKit y varias librerías nativas. En Debian 13:

```bash
sudo apt update && sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libxdo-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libglib2.0-dev \
  libgtk-3-dev
```

> **Nota Debian 13**: Tauri 2 usa `webkit2gtk-4.1`. Si en algún paso del build ves un error sobre `webkit2gtk-4.0`, asegúrate de que tienes la versión `4.1` instalada y no la `4.0`.

---

## 2. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Seleccionar la opción **1 (default installation)** cuando pregunte.

Recargar el PATH en la sesión actual:

```bash
source "$HOME/.cargo/env"
```

Verificar:

```bash
rustc --version    # rustc 1.xx.x (...)
cargo --version    # cargo 1.xx.x (...)
```

---

## 3. Node.js via nvm

Se recomienda nvm para gestionar versiones de Node. Angular 19 requiere Node 18.19+ o superior; usar Node 22 LTS.

```bash
# Instalar nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Recargar el shell
source ~/.bashrc   # o ~/.zshrc si usas zsh

# Instalar Node 22 LTS
nvm install 22
nvm use 22
nvm alias default 22
```

Verificar:

```bash
node --version    # v22.x.x
```

---

## 4. pnpm

```bash
npm install -g pnpm
```

Verificar:

```bash
pnpm --version    # 9.x.x o superior
```

> Si prefieres el instalador standalone sin pasar por npm:
> ```bash
> curl -fsSL https://get.pnpm.io/install.sh | sh -
> source ~/.bashrc
> ```

---

## 5. Tauri CLI

```bash
cargo install tauri-cli --version "^2"
```

Esto tarda unos minutos la primera vez (compilación desde fuente).

Verificar:

```bash
cargo tauri --version    # tauri-cli 2.x.x
```

---

## 6. Angular CLI

```bash
pnpm add -g @angular/cli
```

Verificar:

```bash
ng version    # Angular CLI: 19.x.x
```

---

## 7. Verificación final

```bash
rustc --version
cargo --version
node --version
pnpm --version
cargo tauri --version
ng version
```

Deberías ver algo así:

```
rustc 1.78.0 (...)
cargo 1.78.0 (...)
v22.4.0
9.4.0
tauri-cli 2.1.0
Angular CLI: 19.x.x
```

---

## 8. Crit — Revisión de planes

Crit es la herramienta de feedback loop para revisar planes antes de implementar.

**En Claude Code** (instala las skills automáticamente):

```bash
claude plugin marketplace add tomasz-tomczyk/crit
claude plugin install crit@crit
```

Verifica que se instalaron las skills:
```bash
ls .claude/  # deberías ver los ficheros de skill de crit
```

Crit no necesita proceso en background — se lanza bajo demanda cuando el orquestador llama a la herramienta `crit`.

---

## 9. Engram — Memoria persistente

Engram es el sistema de memoria persistente para el agente. Binario Go sin dependencias de runtime.

**Via Homebrew (recomendado):**
```bash
brew install gentleman-programming/tap/engram
```

**Desde código fuente** (si no tienes Homebrew):
```bash
# Necesitas Go 1.25+
sudo apt install -y golang-go   # o via https://go.dev/dl/
git clone https://github.com/Gentleman-Programming/engram.git
cd engram
go install ./cmd/engram
```

Verificar:
```bash
engram version   # engram v0.1.0 (...)
```

**Configurar en el proyecto** — crear o editar `.claude/settings.json` en la raíz de `inkwell/`:

```json
{
  "mcpServers": {
    "engram": {
      "command": "engram",
      "args": ["mcp"]
    }
  }
}
```

Verificar que Claude Code detecta el MCP:
```bash
claude mcp list   # debería aparecer "engram"
```

**TUI opcional** (para inspeccionar la memoria acumulada):
```bash
engram tui
```

---

## Uso de pnpm en las specs

Las specs de Inkwell usan `pnpm` en lugar de `npm`. Correspondencia directa:

| Comando npm (specs) | Comando pnpm equivalente |
|---|---|
| `npm create tauri-app@latest inkwell -- --template angular` | `pnpm create tauri-app@latest inkwell --template angular` |
| `npm install` | `pnpm install` |
| `npm install <paquete>` | `pnpm add <paquete>` |
| `npm install -D <paquete>` | `pnpm add -D <paquete>` |
| `npm install -g <paquete>` | `pnpm add -g <paquete>` |
| `npm run tauri dev` | `pnpm tauri dev` |
| `npm run build` | `pnpm build` |
| `npm run tauri build` | `pnpm tauri build` |

> En el `CLAUDE.md` y las specs, sustituir mentalmente `npm` por `pnpm` en todos los comandos. El resto del código (TypeScript, Rust, configuración) no cambia.

---

## Configuración de pnpm en el proyecto (INK-01)

Al crear el proyecto con `pnpm create tauri-app`, Tauri detecta pnpm automáticamente. No obstante, añadir esto al `package.json` para forzar pnpm y evitar que alguien instale accidentalmente con npm:

```json
{
  "engines": {
    "node": ">=18.19.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.4.0"
}
```

Y crear un `.npmrc` en la raíz del proyecto:

```
engine-strict=true
```

---

## Problemas conocidos en Debian 13

**Error `pkg-config: not found`**
```bash
sudo apt install -y pkg-config
```

**Error `libssl.so: not found` durante el build de Rust**
```bash
sudo apt install -y libssl-dev pkg-config
```

**La ventana de Tauri no abre (pantalla en negro)**
Problema habitual con drivers de vídeo y WebKit. Probar:
```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 pnpm tauri dev
```
Si funciona, añadir la variable al entorno de desarrollo.

**Error `error[E0463]: can't find crate for 'core'`**
El target de Rust no está instalado:
```bash
rustup target add x86_64-unknown-linux-gnu
```
