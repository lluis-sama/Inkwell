# Inkwell — CLAUDE.md

Aplicación de escritura de largo aliento para escritores. Alternativa a Scrivener con soporte nativo Linux, almacenamiento basado en archivos locales y asistencia IA integrada vía Anthropic API.

---

## Metodología de trabajo: Spec-Driven Development (SDD)

Este proyecto usa SDD. **No escribas código sin una spec activa.**

El flujo obligatorio para cada spec es:

```
SPEC → Explorer → Planner → Implementer → Reviewer → Criterios de aceptación
```

### Cuándo usar cada agente

| Agente | Cuándo invocarlo |
|---|---|
| `explorer` | Al inicio de cada spec, antes de planificar. También cuando necesites entender el estado actual de un fichero o módulo. |
| `planner` | Tras la exploración, para convertir la spec en un plan de tareas concreto antes de tocar código. |
| `implementer` | Con el plan aprobado, para escribir o modificar código. Un bloque de implementación por tarea del plan. |
| `reviewer` | Tras completar la implementación de la spec, para validar contra los criterios de aceptación. |

### Protocolo por spec

1. **Recibir spec**: El usuario entrega una spec (p.ej. `INK-03`).
2. **Explorar**: Invocar `explorer` para mapear ficheros existentes relevantes.
3. **Planificar**: Invocar `planner` con la spec + el contexto de la exploración.
4. **Implementar**: Invocar `implementer` tarea a tarea según el plan. No pasar a la siguiente tarea hasta que la actual compile.
5. **Revisar**: Invocar `reviewer` con la spec completa + los ficheros modificados.
6. **Criterios**: Recorrer los criterios de aceptación de la spec uno a uno. Marcar los que pasan. Reportar los que fallan al usuario antes de continuar.

### Reglas del orquestador

- **No saltarse pasos.** Si la exploración no se ha hecho, no se planifica. Si el plan no existe, no se implementa.
- **Un agente a la vez.** Esperar a que el agente termine antes de invocar el siguiente.
- **Si el reviewer reporta fallos**, invocar `implementer` de nuevo solo para las tareas fallidas, luego `reviewer` otra vez.
- **No mezclar specs.** Completar la spec activa al 100% antes de aceptar la siguiente.
- **Ante ambigüedad en la spec**, preguntar al usuario antes de planificar. No inferir.

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
  .claude/
    agents/
      explorer.md
      planner.md
      implementer.md
      reviewer.md
  src-tauri/
    src/
      main.rs
      commands/
        fs_commands.rs
    tauri.conf.json
    Cargo.toml
  src/
    app/
      core/
        models/
          project.model.ts
          document.model.ts
          board.model.ts
        services/
          project.service.ts
          document.service.ts
          board.service.ts
          ai.service.ts
          tauri-bridge.service.ts
          theme.service.ts
      features/
        project-manager/
        editor/
        boards/
        ai-assistant/
      shared/
        components/
        services/
        utils/
    main.ts
    app.config.ts
    app.routes.ts
  package.json
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

No hay base de datos. Todo son archivos JSON. Esta estructura permite sincronizar con ProtonDrive, Syncthing o cualquier cliente de nube sin integración especial.

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

---

## Orden de implementación de specs

```
INK-01 → INK-02 → INK-03 → INK-04 → INK-05 → INK-06 → INK-07 → INK-08 → INK-09
```

Cada spec es un bloque completo. No comenzar la siguiente hasta que los criterios de aceptación de la actual estén verificados.

---

## Notas críticas

- **Sin base de datos.** Si ves código conectando a SQLite u otra DB, es incorrecto.
- **La API key de Anthropic nunca sale del cliente.** Se guarda en `localStorage` y se envía directamente a `api.anthropic.com`. Sin servidor intermedio.
- **El proyecto activo siempre pasa por `ProjectService`.** Ningún componente accede a disco directamente.
- **Compatibilidad de sync**: la estructura de archivos es plana y predecible. Diseñada para ProtonDrive, Syncthing, rclone.
