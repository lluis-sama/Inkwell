# Plan de implementación — INK-25

## Resumen

Esta spec mueve el estado de la conversación IA (messages, currentMode, isStreaming) desde `AiAssistantPanelComponent` a `AiService`, añade persistencia en `{projectPath}/ai_session.json`, y conecta el ciclo de vida del proyecto (abrir / cerrar) con la carga y limpieza de esa sesión. El componente queda reducido a UI pura que delega toda la lógica al servicio.

---

## Tareas

### Tarea 1: Modelo AiSession
- **Fichero**: `src/app/core/models/ai-session.model.ts` (crear)
- **Qué hace**: Define la interfaz `AiSession` con campos `projectId: string`, `mode: AiMode`, `messages: AiMessage[]`, `updatedAt: string`. No re-exporta `AiMode` ni `AiMessage`; las importa desde `ai.service.ts` (ya están definidas ahí como `export type`/`export interface`).
- **Depende de**: ninguna dependencia previa.
- **Riesgo**: `AiMode` y `AiMessage` están definidos en `ai.service.ts`, no en un fichero de modelos puro. La importación cruzará desde un modelo hacia un servicio, lo cual es inusual. Alternativa aceptable: mover `AiMode` y `AiMessage` a `ai-session.model.ts` y actualizar el import en `ai.service.ts`. El Implementer debe elegir una sola dirección y ser consistente. Se recomienda mantenerlos en `ai.service.ts` para no romper otros importadores, e importar en `ai-session.model.ts` solo si es necesario para el tipo del campo — o simplemente declarar los campos con los tipos inline en la interfaz y dejar `AiMode`/`AiMessage` donde están.

### Tarea 2: Función de ruta `aiSessionPath`
- **Fichero**: `src/app/shared/utils/project-paths.ts` (modificar)
- **Qué hace**: Añade al final del fichero la función exportada `aiSessionPath(basePath: string): string` que retorna `` `${basePath}/ai_session.json` ``. Sigue el patrón de `statsPath` y `consistencyReportPath` ya presentes.
- **Depende de**: ninguna dependencia previa.

### Tarea 3: Estado de conversación y métodos de persistencia en AiService
- **Fichero**: `src/app/core/services/ai.service.ts` (modificar)
- **Qué hace**:
  1. Añade las tres señales de estado al cuerpo de la clase, justo antes de `saveApiKey`:
     - `readonly messages = signal<AiMessage[]>([])`
     - `readonly currentMode = signal<AiMode>('analyze')`
     - `readonly isStreaming = signal<boolean>(false)`
  2. Inyecta `TauriBridgeService` (además del ya presente `ProjectService`).
  3. Añade el método privado `private async persistSession(basePath: string, projectId: string): Promise<void>` que construye un objeto `AiSession` con el estado actual y llama a `this.bridge.writeJsonFile(aiSessionPath(basePath), JSON.stringify(session, null, 2))`.
  4. Añade el método público `async loadSession(basePath: string, projectId: string): Promise<void>`: lee el fichero, parsea el JSON, verifica que `session.projectId === projectId`; si el fichero no existe o lanza error, silencia la excepción y deja el estado en su valor inicial; si el `projectId` no coincide, ignora igualmente.
  5. Añade el método público `async clearSession(basePath: string, projectId: string): Promise<void>`: hace `this.messages.set([])`, `this.currentMode.set('analyze')` y llama a `persistSession`.
- **Depende de**: Tarea 1 (tipo `AiSession`), Tarea 2 (función `aiSessionPath`).
- **Riesgo**: `TauriBridgeService` y `ProjectService` formarían una dependencia circular si `ProjectService` también inyecta `AiService`. Verificar en el código que `ProjectService` ya inyecta `AiService` — si lo hace, `AiService` no debe inyectar `ProjectService` y debe recibir `basePath`/`projectId` como parámetros (lo que ya hace la spec). Al leer el código confirmamos que `ProjectService` NO inyecta `AiService`, por lo que la inyección de `TauriBridgeService` en `AiService` es segura. La inyección circular no aplica aquí.

### Tarea 4: sendMessage movido a AiService — método `sendMessage()`
- **Fichero**: `src/app/core/services/ai.service.ts` (modificar, continuación de Tarea 3)
- **Qué hace**: Añade el método público `async sendMessage(userInput: string, context: string): Promise<void>` que encapsula la lógica actualmente en `AiAssistantPanelComponent.send()`:
  1. Añade el mensaje de usuario a `this.messages`.
  2. Pone `this.isStreaming.set(true)`.
  3. Itera sobre `this.streamMessage(this.messages(), this.currentMode(), context)` actualizando `streamingContent` (que se mantiene en el componente — ver Tarea 6).
  4. Al finalizar el stream, añade la respuesta del asistente a `this.messages`.
  5. Llama a `this.persistSession(basePath, projectId)` usando `this.projectService.basePath()` y `this.projectService.project()?.id` — ambos accesibles porque `ProjectService` ya está inyectado.
  6. Pone `this.isStreaming.set(false)`.
  7. En el bloque `catch`, elimina el último mensaje de usuario y relanza el error para que el componente lo capture en `error`.
- **Depende de**: Tarea 3.
- **Riesgo**: El streaming devuelve chunks de texto; el componente necesita mostrarlos en tiempo real. Solución: `sendMessage()` acepta un callback opcional `onChunk?: (chunk: string) => void` o bien retorna el `AsyncGenerator` y el componente lo consume. La opción más limpia para zoneless es que `AiService` exponga una señal `streamingContent = signal<string>('')` y el método `sendMessage` la actualice en cada chunk — esto mueve también `streamingContent` al servicio. El Implementer debe elegir esta segunda opción para no requerir callbacks y mantener la reactividad por señales.

### Tarea 5: ProjectService — integrar loadSession y clearSession
- **Fichero**: `src/app/core/services/project.service.ts` (modificar)
- **Qué hace**:
  1. Inyecta `AiService` en `ProjectService` (ya inyecta otros servicios mediante `inject()`).
  2. En `openProject()`, tras `this.project.set(project)` y antes del `return`, añade: `await this.aiService.loadSession(basePath, project.id)`.
  3. En `closeProject()`, antes de limpiar las señales propias, añade: `this.aiService.messages.set([]); this.aiService.currentMode.set('analyze')`. No llamar a `clearSession` aquí porque ya no hay `basePath` disponible tras la limpieza — la limpieza en memoria es suficiente para el requisito de la spec.
- **Depende de**: Tarea 3.
- **Riesgo**: Hay que verificar que `AiService` no forme ciclo con `ProjectService`. Confirmado: `AiService` inyecta `ProjectService` (ya lo hace ahora mismo). Si `ProjectService` también inyecta `AiService`, se crea un ciclo. Para resolverlo, `AiService` debe dejar de inyectar `ProjectService` para los métodos `loadSession`/`clearSession`/`persistSession` — esos métodos ya reciben `basePath` y `projectId` como parámetros. Para `sendMessage`, en lugar de leer `this.projectService.basePath()`, recibirá `basePath` y `projectId` como parámetros también. Esto rompe la dependencia circular. El Implementer debe quitar `private projectService = inject(ProjectService)` de `AiService` o verificar que no genera ciclo antes de dejarlo.

### Tarea 6: Simplificar AiAssistantPanelComponent — eliminar estado local
- **Fichero**: `src/app/features/editor/ai-assistant/ai-assistant-panel.component.ts` (modificar)
- **Qué hace**:
  1. Elimina las declaraciones locales: `activeMode`, `messages`, `isStreaming`. Pasan a leerse desde `this.ai.currentMode`, `this.ai.messages`, `this.ai.isStreaming`.
  2. Mantiene en el componente: `streamingContent` (si la Tarea 4 decidió moverlo al servicio, eliminarlo también aquí), `error`, `showSettings`, `userInput`.
  3. Reemplaza el método `send()` con una llamada a `this.ai.sendMessage(this.userInput.trim(), this.buildContext())` envuelta en `try/catch` que actualiza `error`.
  4. Actualiza todas las referencias en la plantilla HTML: `activeMode()` → `ai.currentMode()`, `messages()` → `ai.messages()`, `isStreaming()` → `ai.isStreaming()`.
  5. El método `clearHistory()` cambia a llamar `await this.ai.clearSession(basePath, projectId)` o directamente `this.ai.messages.set([]); this.ai.currentMode.set('analyze'); this.ai.streamingContent.set('')` si no hay necesidad de persistir.
- **Depende de**: Tarea 3, Tarea 4.
- **Riesgo**: La plantilla HTML referencia `activeMode` en la clase del botón de modo y en `modeLabels`/`modePlaceholders`. Todas esas referencias deben actualizarse a `ai.currentMode()`. Buscar con grep antes de compilar.

### Tarea 7: Actualizar plantilla HTML del componente
- **Fichero**: `src/app/features/editor/ai-assistant/ai-assistant-panel.component.html` (modificar)
- **Qué hace**: Actualiza todas las referencias de señales locales que ahora viven en el servicio:
  - `messages()` → `ai.messages()`
  - `activeMode()` → `ai.currentMode()`
  - `isStreaming()` → `ai.isStreaming()`
  - `streamingContent()` → `ai.streamingContent()` (si se movió al servicio)
  - El botón "limpiar historial" llama a `clearHistory()` que ya habrá sido actualizado en la Tarea 6.
- **Depende de**: Tarea 6.
- **Riesgo**: El botón de modo usa `[class]="activeMode() === modeKey ? ... : ..."` — buscar y reemplazar en toda la plantilla. También `(click)="activeMode.set(modeKey)"` debe cambiarse a `(click)="ai.currentMode.set(modeKey)"`.

### Tarea 8: Botón "Nueva conversación"
- **Fichero**: `src/app/features/editor/ai-assistant/ai-assistant-panel.component.html` (modificar)
- **Fichero secundario**: `src/app/features/editor/ai-assistant/ai-assistant-panel.component.ts` (modificar si hace falta un método)
- **Qué hace**: Añade un botón en la cabecera del panel, en el `<div class="flex gap-1">` junto a los botones existentes de settings y limpiar. El botón llama a `newConversation()` en el componente, que ejecuta `this.ai.messages.set([]); this.ai.currentMode.set('analyze'); this.ai.streamingContent.set(''); this.error.set(null)` y llama a `persistSession` a través de `clearSession` con basePath y projectId del servicio. Icono sugerido: hoja en blanco o símbolo `+`. Título i18n: `AI.NEW_CONVERSATION`.
- **Depende de**: Tarea 6, Tarea 7.
- **Riesgo**: La spec dice que el botón "Nueva conversación" es distinto al botón de "limpiar historial" existente. Revisar si deben coexistir o si el nuevo reemplaza al antiguo. La spec no menciona eliminar el existente; se añade como botón adicional.

### Tarea 9: Clave de traducción para "Nueva conversación"
- **Fichero**: localización i18n (buscar con `find /home/david/dev/inkwell/src -name "*.json" | xargs grep -l "AI.TITLE"` para localizar los ficheros de traducción)
- **Qué hace**: Añade la clave `"NEW_CONVERSATION"` dentro del objeto `"AI"` en todos los ficheros de traducción del proyecto. Valor sugerido en español: `"Nueva conversación"`.
- **Depende de**: Tarea 8.

### Tarea 10: Tests unitarios
- **Fichero**: `src/app/core/services/ai.service.spec.ts` (crear o modificar)
- **Qué hace**: Añade los cuatro casos especificados:
  1. `loadSession()` con `ai_session.json` válido → restaura `messages` y `currentMode`.
  2. `loadSession()` cuando el fichero no existe → no lanza error, estado vacío.
  3. `loadSession()` con `projectId` distinto → ignora el fichero, estado vacío.
  4. `clearSession()` → `messages` vacío y fichero sobreescrito (mock de `writeJsonFile`).
  5. `ProjectService.closeProject()` → `AiService.messages()` queda vacío (test de integración ligero con ambos servicios instanciados).
- **Depende de**: Tarea 3, Tarea 5.
- **Riesgo**: `TauriBridgeService` invoca comandos Tauri; en tests hay que mockearlo. Usar `jasmine.createSpyObj` o `{ provide: TauriBridgeService, useValue: mockBridge }`. El mock de `readJsonFile` debe poder lanzar un error (simular fichero inexistente) y retornar un JSON válido.

---

## Orden de ejecución

1. Tarea 1 — Modelo `AiSession`
2. Tarea 2 — Función `aiSessionPath` en `project-paths.ts`
3. Tarea 3 — Señales de estado y métodos de persistencia en `AiService`
4. Tarea 4 — Método `sendMessage()` en `AiService`
5. Tarea 5 — Integración en `ProjectService` (abrir/cerrar)
6. Tarea 6 — Simplificar `AiAssistantPanelComponent` (lógica TS)
7. Tarea 7 — Actualizar plantilla HTML del componente
8. Tarea 8 — Botón "Nueva conversación" en la cabecera
9. Tarea 9 — Clave de traducción
10. Tarea 10 — Tests unitarios

---

## Puntos de atención para el Implementer

### Dependencia circular — punto crítico
`AiService` actualmente inyecta `ProjectService`. Si `ProjectService` también inyecta `AiService` (Tarea 5), Angular lanzará un error de inyección circular en runtime. La solución es que `AiService` **no inyecte `ProjectService`**. Los métodos `loadSession`, `clearSession`, `sendMessage` y `persistSession` reciben `basePath: string` y `projectId: string` como parámetros explícitos. `ProjectService` es quien los llama pasando sus propias señales como argumentos. Quitar `private projectService = inject(ProjectService)` de `AiService` tras la refactorización.

### Señal `streamingContent`
La spec no menciona moverla al servicio, pero si `sendMessage()` vive en `AiService`, el servicio necesita actualizar el contenido en streaming que el componente muestra. La solución correcta en zoneless/signals es mover `streamingContent = signal<string>('')` al servicio también, para que el componente lo lea reactivamente. No usar callbacks ni Observables.

### `activeMode` vs `currentMode`
En el componente actual la señal se llama `activeMode`. En `AiService` se creará como `currentMode` (nombre de la spec). Al actualizar la plantilla, reemplazar todas las ocurrencias de `activeMode()` por `ai.currentMode()` y `activeMode.set(...)` por `ai.currentMode.set(...)`.

### `clearHistory()` existente vs `newConversation()` nuevo
El botón de papelera existente llama a `clearHistory()`, que hace `this.messages.set([])` local. Tras la refactorización, `clearHistory()` debe delegar a `this.ai.clearSession()` (que persiste el estado vacío) o simplemente a `this.ai.messages.set([]); this.ai.streamingContent.set(''); this.error.set(null)` sin persistir. La spec dice "botón Nueva conversación" sin eliminar el de limpiar; ambos pueden hacer la misma operación o diferenciarse semánticamente. Mantener ambos con la misma implementación es válido.

### `closeProject()` es síncrono
`ProjectService.closeProject()` es actualmente `void` (no `async`). Limpiar el estado de `AiService` en memoria (`messages.set([])`) es síncrono y no requiere cambiar la firma. No llamar a `clearSession()` (que es async) desde `closeProject()` porque requeriría hacerlo async o usar `.then()` sin `await`, dejando el fichero con estado stale. La spec dice explícitamente solo limpiar el estado en memoria en `closeProject()`.

### Leer fichero inexistente en Tauri
`TauriBridgeService.readJsonFile()` lanza un error de Rust cuando el fichero no existe. `loadSession()` debe capturar ese error con `try/catch` y tratar cualquier excepción como "sesión vacía". No hay API de "file exists" en `TauriBridgeService` para JSON — el patrón correcto es try/catch.

### Templates en ficheros separados
Recordar que la plantilla y los estilos del componente están en ficheros `.html` y `.css` separados. Las Tareas 6 y 7 son cambios en ficheros distintos que deben ejecutarse en orden (primero el `.ts`, luego el `.html`) para evitar errores de compilación temporales.

### `strict: true` — sin `any`
Al parsear el JSON de `ai_session.json`, tipar el resultado como `AiSession` explícitamente: `const session = JSON.parse(raw) as AiSession`. Verificar que los campos `messages` y `mode` existen antes de usarlos para evitar errores en ficheros corruptos o de versiones anteriores.
