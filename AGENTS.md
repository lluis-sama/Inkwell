# Inkwell — AGENTS.md

Aplicación de escritura de largo aliento para escritores. Alternativa a Scrivener con soporte nativo Linux, almacenamiento basado en archivos locales y asistencia IA integrada vía Anthropic API.

---

## Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Desktop shell | Tauri | 2.x |
| Frontend framework | Angular (zoneless + signals) | 19.x |
| Estilos | TailwindCSS | 3.x |
| Editor de texto | TipTap | 2.x |
| Drag & drop tableros | interact.js | 1.x |
| IA | Anthropic API (claude-sonnet-4-20250514) | — |
| Lenguaje backend (Tauri) | Rust | stable |

---

## Estructura del repositorio

```
inkwell/
  CLAUDE.md            ← instrucciones para Claude Code
  AGENTS.md            ← instrucciones para opencode
  PREREQUISITES.md
  .claude/
    settings.json      ← MCP config para Claude Code
    agents/            ← agentes para Claude Code
  .opencode/
    agents/            ← agentes para opencode (sdd, explorer, planner, implementer, reviewer)
    commands/          ← comandos (crit, etc.)
    skills/            ← skills (crit, etc.)
    plugins/           ← plugins TypeScript (crit.ts, etc.)
  opencode.jsonc        ← config de opencode (MCP, modelos, etc.)
  specs/
    INK-01-scaffolding.md
    ...
    INK-09-polish.md
    plans/             ← planes generados por el @planner para Crit
      INK-XX-plan.md
  src/                 ← Angular (generado por Tauri CLI)
  src-tauri/           ← Rust (generado por Tauri CLI)
  package.json
  pnpm-lock.yaml
  tailwind.config.js
```

---

## Estructura de un proyecto del usuario en disco

```
mi-novela/
  project.json
  documents/{uuid}.json
  boards/{uuid}.json
```

No hay base de datos. Todo son archivos JSON. Diseñado para sincronizar con ProtonDrive, Syncthing o rclone sin integración especial.

---

## Modelos de datos (fuente de verdad)

### `project.model.ts`

```typescript
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tree: TreeNode[];
  settings: ProjectSettings;
}

export interface TreeNode {
  id: string;
  title: string;
  type: 'folder' | 'document';
  children: TreeNode[];  // siempre presente; [] para hojas; profundidad ilimitada
}

export interface ProjectSettings {
  autosaveInterval: number; // segundos; 0 = desactivado
  maxSnapshots: number;     // default: 10
  aiModel: string;          // default: 'claude-sonnet-4-20250514'
}
```

### `document.model.ts`

```typescript
export interface DocumentFile {
  id: string;
  title: string;
  content: object;        // TipTap JSON
  snapshots: Snapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface Snapshot {
  id: string;
  content: object;
  createdAt: string;
  label?: string;
}
```

### `board.model.ts`

```typescript
export interface BoardFile {
  id: string;
  title: string;
  cards: Card[];
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  title: string;
  body: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
```

---

## Comandos Tauri (Rust ↔ Angular)

Todos en `src-tauri/src/commands/fs_commands.rs`.

| Comando | Firma |
|---|---|
| `open_folder_dialog` | `async fn(app: AppHandle) -> Option<String>` |
| `select_new_project_folder` | `async fn(app: AppHandle) -> Option<String>` |
| `read_json_file` | `fn(path: String) -> Result<String, String>` |
| `write_json_file` | `fn(path: String, content: String) -> Result<(), String>` |
| `list_json_files` | `fn(folder_path: String) -> Result<Vec<String>, String>` |
| `delete_json_file` | `fn(path: String) -> Result<(), String>` |
| `create_project_structure` | `fn(base_path: String) -> Result<(), String>` |
| `set_window_title` | `fn(app: AppHandle, title: String) -> Result<(), String>` |

**Regla**: Los comandos son I/O puro. Sin lógica de negocio en Rust. El parseo de JSON ocurre siempre en Angular.

---

## Servicios Angular

| Servicio | Responsabilidad |
|---|---|
| `TauriBridgeService` | Único punto de contacto con `@tauri-apps/api`. Nadie más importa Tauri. |
| `ProjectService` | Estado global del proyecto activo (signal). CRUD del árbol. |
| `DocumentService` | CRUD de documentos. Lógica de snapshots. |
| `BoardService` | CRUD de tableros y tarjetas. |
| `AiService` | Streaming a Anthropic API. Gestión de API key. |
| `ThemeService` | Toggle Catppuccin Mocha ↔ Latte. Persiste en localStorage. |
| `ToastService` | Notificaciones efímeras globales. |

---

## Convenciones de código

- **Signals everywhere**: `signal()`, `computed()`, `effect()`. Sin `BehaviorSubject` salvo para eventos DOM.
- **Zoneless**: `provideExperimentalZonelessChangeDetection()`. Sin `NgZone`.
- **Standalone components**: todos. Sin NgModules.
- **Tipado estricto**: `strict: true`. Sin `any` salvo el TipTap JSON (tipado como `object`).
- **`TauriBridgeService`** es el único lugar con `import { invoke } from '@tauri-apps/api/core'`.
- **Theming**: los componentes usan tokens `--ink-*`. Nunca variables `--ctp-*` directamente.
- **IDs**: `crypto.randomUUID()`. Sin librerías externas de UUID.
- **Estilos**: TailwindCSS. Sin estilos globales custom salvo variables CSS base en `styles.css`.
- **pnpm**: gestor de paquetes del proyecto. Sin npm ni yarn.

---

## Notas críticas

- **Sin base de datos.** Si ves código conectando a SQLite u otra DB, es incorrecto.
- **La API key de Anthropic nunca sale del cliente.** Se guarda en `localStorage` y se envía directamente a `api.anthropic.com`. Sin servidor intermedio.
- **El proyecto activo siempre pasa por `ProjectService`.** Ningún componente accede a disco directamente.
- **Compatibilidad de sync**: estructura plana y predecible para ProtonDrive, Syncthing, rclone.
