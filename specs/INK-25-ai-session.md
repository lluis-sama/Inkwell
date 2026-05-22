# INK-25 — Persistencia de la conversación del asistente IA

## Objetivo

La conversación con el asistente IA persiste al cerrar el panel, al cerrar el proyecto y al reiniciar la aplicación. Al reabrir un proyecto, el historial de la última conversación se restaura automáticamente. El usuario puede iniciar una conversación nueva con un botón explícito.

---

## Scope

**Incluido:**
- Mover el historial de conversación de `AiAssistantPanelComponent` a `AiService`
- Guardar la conversación en `{projectPath}/ai_session.json` tras cada intercambio
- Cargar la conversación al abrir el proyecto
- Botón "Nueva conversación" en la cabecera del panel
- Limpiar la sesión al cambiar de proyecto

**Excluido:**
- Múltiples conversaciones con historial navegable
- Conversación por documento (una sola por proyecto)

---

## Parte 1: Formato de ai_session.json

```typescript
// src/app/core/models/ai-session.model.ts
export interface AiSession {
  projectId: string;
  mode: AiMode;
  messages: AiMessage[];
  updatedAt: string; // ISO
}
```

Ejemplo de fichero:
```json
{
  "projectId": "uuid-del-proyecto",
  "mode": "analyze",
  "messages": [
    { "role": "user",      "content": "Analiza esta escena..." },
    { "role": "assistant", "content": "La escena tiene una estructura..." }
  ],
  "updatedAt": "2026-05-22T15:30:00.000Z"
}
```

---

## Parte 2: AiService — cambios

### Estado que se mueve desde el componente

```typescript
// Antes: estaba en AiAssistantPanelComponent
// Ahora: vive en AiService

readonly messages     = signal<AiMessage[]>([]);
readonly currentMode  = signal<AiMode>('analyze');
readonly isStreaming  = signal<boolean>(false);
```

### Nuevos métodos

```typescript
async loadSession(projectPath: string, projectId: string): Promise<void> {
  try {
    const session = await this.file.readJson<AiSession>(
      `${projectPath}/ai_session.json`
    );
    if (session?.projectId === projectId) {
      this.messages.set(session.messages);
      this.currentMode.set(session.mode);
    }
  } catch {
    // Fichero no existe aún — estado inicial vacío, sin error
  }
}

async clearSession(projectPath: string, projectId: string): Promise<void> {
  this.messages.set([]);
  await this.persistSession(projectPath, projectId);
}

private async persistSession(projectPath: string, projectId: string): Promise<void> {
  const session: AiSession = {
    projectId,
    mode: this.currentMode(),
    messages: this.messages(),
    updatedAt: new Date().toISOString(),
  };
  await this.file.writeJson(`${projectPath}/ai_session.json`, session);
}
```

### En sendMessage() — persistir tras cada respuesta

```typescript
async sendMessage(userContent: string, projectPath: string, projectId: string): Promise<void> {
  // ... lógica de streaming existente ...

  // Al finalizar el stream, persistir
  await this.persistSession(projectPath, projectId);
}
```

---

## Parte 3: ProjectService — cambios

Llamar a `AiService.loadSession()` al abrir un proyecto y limpiar el estado en memoria al cerrarlo:

```typescript
// En openProject() — tras cargar el proyecto
await this.aiService.loadSession(project.path, project.id);

// En closeProject()
this.aiService.messages.set([]);
this.aiService.currentMode.set('analyze');
```

---

## Parte 4: AiAssistantPanelComponent — cambios

El componente deja de gestionar el estado de la conversación y lo delega completamente a `AiService`. Los signals `messages`, `currentMode` e `isStreaming` pasan a leerse desde el servicio.

### Botón "Nueva conversación"

Añadir en la cabecera del panel, junto a los botones de modo:

```html
<button
  class="text-xs px-2 py-1 rounded text-ink-text-muted hover:text-ink-text-primary
         hover:bg-ink-hover transition-colors ml-auto"
  (click)="onNewConversation()"
  title="Nueva conversación"
  [disabled]="aiService.messages().length === 0"
>
  Nueva conversación
</button>
```

```typescript
async onNewConversation(): Promise<void> {
  const project = this.project.currentProject();
  if (!project) return;
  await this.aiService.clearSession(project.path, project.id);
}
```

---

## Tests

- `AiService.loadSession()` con un `ai_session.json` válido → restaura `messages` y `mode`.
- `AiService.loadSession()` cuando el fichero no existe → no lanza error, estado vacío.
- `AiService.loadSession()` con `projectId` distinto → ignora el fichero, estado vacío.
- `AiService.clearSession()` → `messages` vacío + fichero sobreescrito.
- `ProjectService.closeProject()` → `AiService.messages()` queda vacío.

---

## Dependencias

Ninguna nueva.

## Orden de implementación sugerido

1. Modelo `AiSession`
2. Mover estado a `AiService` + nuevos métodos
3. `ProjectService` — cargar/limpiar en ciclo de vida del proyecto
4. Simplificar `AiAssistantPanelComponent` (eliminar estado local)
5. Botón "Nueva conversación"

## Spec anterior

INK-24 (El Cajón)
