# Inkwell — CLAUDE.md

Aplicación de escritura de largo aliento para escritores. Alternativa a Scrivener con soporte nativo Linux, almacenamiento basado en archivos locales y asistencia IA integrada vía Anthropic API.

---

## Herramientas de soporte al workflow

### Crit — Revisión de planes

Crit es la herramienta de feedback entre el orquestador y el usuario. Se usa **obligatoriamente** para revisar el plan antes de implementar cualquier spec.

**El flujo con Crit:**
1. El Planner genera el plan y el orquestador lo escribe en `specs/plans/INK-XX-plan.md`
2. El orquestador llama a la herramienta `crit` con ese fichero
3. **El orquestador se detiene completamente.** No implementa nada. No avanza.
4. El usuario revisa el plan en la UI de Crit, deja comentarios inline y hace click en "Finish Review"
5. Crit entrega el feedback estructurado al orquestador
6. Si hay comentarios: invocar `planner` de nuevo con el feedback, regenerar el plan, repetir desde el paso 1
7. Si no hay comentarios o el usuario aprueba: invocar `implementer`

**Regla crítica: cero código antes de aprobación de Crit.** Si el usuario no ha completado la revisión en Crit, el orquestador no escribe ni una línea de código.

---

### Engram — Memoria persistente entre specs

Engram es el sistema de memoria persistente del proyecto. Su función es que el orquestador no empiece cada spec desde cero, sino con contexto acumulado de las specs anteriores.

**Configuración en `.claude/settings.json`:**
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

**Protocolo de uso obligatorio:**

| Momento | Herramienta | Qué guardar / buscar |
|---|---|---|
| Inicio de cada spec | `mem_search` | Buscar contexto relevante de specs anteriores (p.ej. "angular signals service", "tauri commands") |
| Inicio de cada spec | `mem_context` | Recuperar el resumen de la sesión anterior si hubo compactación |
| Tras completar una spec | `mem_save` | Guardar decisiones técnicas, patrones descubiertos, problemas resueltos |
| Tras completar una spec | `mem_session_summary` | Guardar resumen estructurado (Goal/Discoveries/Accomplished/Files) |
| Ante cualquier compactación | `mem_context` | Recuperar estado antes de continuar — **obligatorio** |

**Qué merece un `mem_save` en este proyecto:**
- Decisiones de arquitectura tomadas durante la implementación (p.ej. "interact.js necesita AfterViewInit, no OnInit")
- Problemas con la integración Tauri + Angular que se resolvieron
- Patrones de signals o zoneless que funcionaron de una manera específica
- Cualquier desviación de la spec que fue necesaria y por qué
- Convenciones que el Implementer aplicó y que no estaban explícitas en la spec

**Patrón de recuperación de contexto (3 capas, mínimo de tokens):**
```
1. mem_search "término relevante"    → resultados compactos con IDs
2. mem_timeline observation_id=N     → contexto cronológico si hace falta
3. mem_get_observation id=N          → contenido completo solo si es necesario
```

No cargar todo el contexto de golpe. Buscar primero, profundizar solo en lo relevante.

---

## Metodología de trabajo: Spec-Driven Development (SDD)

El flujo completo para cada spec es:

```
SPEC → Engram (buscar contexto) → Explorer → Planner → Crit (aprobar plan)
     → Implementer → Reviewer → Engram (guardar)
```

### Protocolo paso a paso

**Paso 1 — Recuperar contexto (Engram)**
```
mem_search <términos clave de la spec>
mem_context   ← siempre, por si hubo compactación
```

**Paso 2 — Explorar (Explorer / Haiku)**
Invocar `explorer` con la spec. Produce el informe de contexto del código actual.

**Paso 3 — Planificar (Planner / Sonnet)**
Invocar `planner` con la spec + informe del Explorer.
El Planner escribe el plan en `specs/plans/INK-XX-plan.md`.

**Paso 4 — Revisión del plan (Crit) ← BLOQUEO OBLIGATORIO**
```
crit specs/plans/INK-XX-plan.md
```
**DETENER TODA ACTIVIDAD.** Esperar a que el usuario complete la revisión en Crit.

- Si hay feedback: volver al Paso 3 con los comentarios. Regenerar el plan. Repetir Crit.
- Si aprobado: continuar al Paso 5.

**Paso 5 — Implementar (Implementer / Sonnet)**
Invocar `implementer` tarea a tarea según el plan aprobado.
No pasar a la siguiente tarea hasta que la actual compile sin errores.

**Paso 6 — Revisar (Reviewer / Sonnet)**
Invocar `reviewer` con la spec + ficheros implementados.
Si hay criterios fallidos: volver al Paso 5 solo para las tareas fallidas.

**Paso 7 — Persistir memoria (Engram)**
```
mem_save      ← decisiones y patrones relevantes descubiertos
mem_session_summary  ← resumen estructurado de la spec completada
```

---

### Agentes y modelos

| Agente | Modelo | Cuándo |
|---|---|---|
| `explorer` | claude-haiku-4-5-20251001 | Paso 2: leer y mapear código existente |
| `planner` | claude-sonnet-4-6 | Paso 3: convertir spec en plan de tareas |
| `implementer` | claude-sonnet-4-6 | Paso 5: escribir código tarea a tarea |
| `reviewer` | claude-sonnet-4-6 | Paso 6: validar contra criterios de aceptación |

### Reglas del orquestador

- **No saltarse pasos.** El orden es: Engram → Explorer → Planner → Crit → Implementer → Reviewer → Engram.
- **Crit es un bloqueo real.** Ninguna línea de código antes de la aprobación del plan.
- **Un agente a la vez.** Esperar respuesta completa antes de invocar el siguiente.
- **Un Implementer por tarea.** No pasar el plan completo al Implementer de golpe.
- **Si el Reviewer reporta fallos**, volver al Implementer solo para las tareas fallidas, luego Reviewer de nuevo.
- **No mezclar specs.** Completar y persistir en Engram antes de aceptar la siguiente spec.
- **Ante ambigüedad en la spec**, preguntar al usuario antes de planificar.
- **Ante compactación**, llamar a `mem_context` inmediatamente antes de continuar.

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
  CLAUDE.md
  PREREQUISITES.md
  .claude/
    settings.json          ← configuración de Engram MCP
    agents/
      explorer.md
      planner.md
      implementer.md
      reviewer.md
  specs/
    INK-01-scaffolding.md
    ...
    INK-09-polish.md
    plans/                 ← planes generados por el Planner para Crit
      INK-XX-plan.md       ← creado en el Paso 3, revisado en el Paso 4
  src/                     ← Angular (generado por Tauri CLI)
  src-tauri/               ← Rust (generado por Tauri CLI)
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

## Orden de implementación de specs

```
INK-01 → INK-02 → INK-03 → INK-04 → INK-05 → INK-06 → INK-07 → INK-08 → INK-09
```

Cada spec es un bloque completo. No comenzar la siguiente hasta que:
1. Los criterios de aceptación del Reviewer estén verificados
2. La memoria de Engram esté actualizada con `mem_save` y `mem_session_summary`

---

## Notas críticas

- **Sin base de datos.** Si ves código conectando a SQLite u otra DB, es incorrecto.
- **La API key de Anthropic nunca sale del cliente.** Se guarda en `localStorage` y se envía directamente a `api.anthropic.com`. Sin servidor intermedio.
- **El proyecto activo siempre pasa por `ProjectService`.** Ningún componente accede a disco directamente.
- **Compatibilidad de sync**: estructura plana y predecible para ProtonDrive, Syncthing, rclone.
