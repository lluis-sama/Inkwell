# ✒️ Inkwell

**The free writing environment for writers.**

Inkwell is an open-source desktop application for Linux designed for long-form writers. Organize your work, write without distractions, and use AI to improve your narrative — all with your files on your disk, no accounts, no subscriptions.

> 🌐 [Leer en español](README.es.md)

![Inkwell Editor](docs/screenshots/editor.png)

---

## ✨ Features

### Write
- **Focused editor** — serif typography, double spacing, focus mode and typewriter mode
- **Snapshots** — save document versions with one click and restore any of them
- **Professional export** — PDF in standard manuscript format for publishers, EPUB for e-readers, DOCX for Word
- **Import** — bring in existing documents in TXT, Markdown and DOCX

### Organize
- **Unlimited binder** — folders and chapters with infinite depth, drag to reorder, filter by status
- **Corkboards** — cards for characters, research and notes, with AI-generated images for your moodboard
- **Narrative view** — all your chapters as cards with synopses and assigned characters
- **Project templates** — start with a predefined structure or create your own

### AI-powered
- **Writing assistant** — analyzes scenes, reviews text, brainstorms with you
- **Narrative consistency** — detects contradictions in names, descriptions and timeline
- **Automatic synopses** — generate each chapter's synopsis with one click
- **Flexible AI** — use the Anthropic API, a local model with Ollama, or any compatible server

### Your data, your control
- JSON files on your disk — readable, versionable, portable
- Sync with ProtonDrive, Syncthing or any client of your choice
- No accounts. No our servers. No telemetry.

---

## 📦 Download

Download the installer for your platform from the [releases page](../../releases).

| Platform | Format |
|---|---|
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (universal) | `.AppImage` |

**Requirements:** Linux 64-bit · ~200MB disk space

---

## 🛠️ Build from source

### Prerequisites

```bash
# System dependencies (Debian/Ubuntu)
sudo apt install -y \
  build-essential curl \
  libwebkit2gtk-4.1-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Node.js (nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22 && nvm use 22

# pnpm
npm install -g pnpm

# Tauri CLI
cargo install tauri-cli --version "^2"
```

### Build

```bash
git clone https://codeberg.org/YOUR_USERNAME/inkwell.git
cd inkwell
pnpm install
pnpm tauri build
```

Artifacts are generated in `src-tauri/target/release/bundle/`.

### Development mode

```bash
pnpm tauri dev
```

---

## 🤖 Setting up AI

Inkwell supports three AI providers:

**Anthropic (cloud)** — get an API key at [console.anthropic.com](https://console.anthropic.com) and enter it in Settings → AI.

**Ollama (local)** — install [Ollama](https://ollama.ai), download a model and configure the URL in Settings → AI:
```bash
ollama pull llama3.2
# URL: http://localhost:11434
```

**OpenAI-compatible server** — works with llama.cpp, LM Studio, LocalAI, Jan and others. Enter your server URL in Settings → AI.

AI is completely optional. Inkwell works without it.

---

## 🏗️ Tech stack

| Layer | Technology |
|---|---|
| Desktop | [Tauri 2](https://tauri.app) |
| Frontend | [Angular 19](https://angular.dev) (zoneless + signals) |
| Editor | [TipTap 2](https://tiptap.dev) |
| Styles | [TailwindCSS](https://tailwindcss.com) · Catppuccin |
| AI | Anthropic API · Ollama · OpenAI-compatible |

---

## 🤝 Contributing

Contributions are welcome. Before opening a pull request, please open an issue to discuss the change you'd like to make.

```bash
# Fork the repo on Codeberg
# Create a branch
git checkout -b feature/my-improvement

# Make your changes and commit
git commit -m "feat: description of change"

# Push and open a Pull Request
git push origin feature/my-improvement
```

---

## 📄 License

Inkwell is free software distributed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Made with ♥ for writers · <a href="https://codeberg.org/YOUR_USERNAME/inkwell">Codeberg</a></sub>
</div>
