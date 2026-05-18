# Plan de implementación — INK-19

### Resumen

Esta spec amplía el sistema de IA de Inkwell para soportar tres proveedores: Anthropic (existente), Ollama nativo y cualquier servidor OpenAI-compatible (llama.cpp, LM Studio, LocalAI, etc.). El proveedor se configura por proyecto en `ProjectSettings` y toda la UI de configuración de IA se reemplaza por una nueva sección con selector de proveedor. ConsistencyService se simplifica para delegar en `AiService.callOnce()`.

---

### Tareas

#### Tarea 1: Ampliar `ProjectSettings` con campos de proveedor
- **Fichero**: `src/app/core/models/project.model.ts` (modificar)
- **Qué hace**: Añadir el tipo exportado `AiProvider = 'anthropic' | 'openai-compatible' | 'ollama'` justo antes de la interfaz `ProjectSettings`. Añadir tres campos nuevos a `ProjectSettings`: `aiProvider: AiProvider`, `aiEndpoint?: string` y `aiApiKey?: string`. Añadir `aiProvider: 'anthropic'` a `DEFAULT_PROJECT_SETTINGS`. No tocar ningún otro campo ni interfaz del fichero.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: `DEFAULT_PROJECT_SETTINGS` no declara los campos opcionales; eso es correcto porque TypeScript los considera satisfechos con `undefined` implícito.

#### Tarea 2: Reescribir `AiService` con soporte multi-proveedor
- **Fichero**: `src/app/core/services/ai.service.ts` (reemplazar completamente)
- **Qué hace**: El nuevo servicio inyecta `ProjectService` para leer `settings` del proyecto activo. Expone los métodos públicos: `saveApiKey()`, `clearApiKey()`, `getActiveProvider()`, `isProviderReady()`, `providerStatusMessage()`, `streamMessage()` y `callOnce()`. Internamente, `streamMessage()` delega en `streamAnthropic()` o `streamOpenAICompatible()`. `callOnce()` delega en `callAnthropicOnce()` o `callOpenAICompatibleOnce()`. La lectura SSE se unifica en `readSSEStream()` + `extractChunkText()`.
- **Depende de**: Tarea 1
- **Riesgo (crítico — fetch de Tauri)**: Todas las llamadas `fetch` deben usar `import { fetch } from '@tauri-apps/plugin-http'`, no el `fetch` nativo del navegador. Esto aplica tanto a `streamAnthropic`, `callAnthropicOnce`, `streamOpenAICompatible` como a `callOpenAICompatibleOnce`. El `testConnection()` del modal también usa `fetch` — pero ese método vive en el componente, no aquí.
- **Riesgo (header Anthropic)**: El header correcto para Anthropic es `anthropic-dangerous-direct-browser-access: true` (con "direct-browser-access"), NO `anthropic-dangerous-allow-browser`. Preservar exactamente el nombre del header del código actual.
- **Riesgo (AiMode 'synopsis')**: El tipo `AiMode` debe seguir siendo `'analyze' | 'review' | 'brainstorm' | 'synopsis'`. La spec muestra solo 3 modos pero el código actual tiene 4. NO eliminar 'synopsis' — es una regresión. El `SYSTEM_PROMPTS` también debe incluir la entrada 'synopsis' del servicio actual.
- **Riesgo (URL Ollama nativo)**: Ollama nativo para chat usa `/api/chat`, no `/v1/chat/completions`. El endpoint OpenAI-compatible usa `/v1/chat/completions`. La lógica de selección de URL en `streamOpenAICompatible` y `callOpenAICompatibleOnce` depende del flag `isOllama`.
- **Riesgo (formato SSE Ollama)**: El formato de respuesta SSE de Ollama nativo es `{ message: { content: '...' }, done: bool }`, sin el campo `choices[]` de OpenAI. `extractChunkText` debe manejar el caso `'ollama'` por separado.

#### Tarea 3: Simplificar `callAiOnce` en `ConsistencyService`
- **Fichero**: `src/app/core/services/consistency.service.ts` (modificar)
- **Qué hace**: El método privado `callAiOnce(userContent, systemPrompt)` actualmente hace directamente la llamada HTTP a Anthropic con su propio `fetch`. Reemplazar el cuerpo completo de ese método privado para que simplemente retorne `this.ai.callOnce(userContent, systemPrompt)`. Eliminar el import de `fetch` de `@tauri-apps/plugin-http` si ya no se usa en ningún otro lugar del fichero. El resto del servicio no cambia.
- **Depende de**: Tarea 2
- **Riesgo**: Verificar que `this.ai` ya está declarado (línea 64: `private ai = inject(AiService)`). No añadir una segunda declaración. No cambiar los prompts `EXTRACTION_PROMPT` ni `ANALYSIS_PROMPT`. No cambiar el flujo `analyze()`.

#### Tarea 4: Ampliar propiedades y métodos del `InkSettingsModalComponent`
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (modificar)
- **Qué hace**: Añadir al componente las siguientes propiedades y métodos nuevos:
  - Importar `AiProvider` de `project.model.ts`
  - Importar `fetch` de `@tauri-apps/plugin-http`
  - Propiedad `readonly providers` (array de 3 objetos con id, label, description)
  - Propiedad `readonly anthropicModels` (reemplaza `AI_MODELS` / `aiModels` — mismas entradas, puede coexistir con `aiModels` renombrándolo internamente si hace falta; usar `anthropicModels` en el template nuevo)
  - Propiedad `selectedProvider = 'anthropic' as AiProvider`
  - Propiedad `ollamaEndpoint = 'http://localhost:11434'`
  - Propiedad `openAiEndpoint = ''`
  - Propiedad `openAiCustomKey = ''`
  - Signal `connectionStatus = signal<{ ok: boolean; message: string } | null>(null)`
  - Ampliar `ngOnInit()` existente añadiendo, dentro del bloque `if (settings)`, la inicialización de `selectedProvider`, `ollamaEndpoint`, `openAiEndpoint` y `openAiCustomKey` a partir de `settings`. No eliminar las líneas existentes que inicializan `autosaveInterval`, `maxSnapshots`, `selectedModel` y `spellcheck`.
  - Método `async testConnection(): Promise<void>` — hace una llamada GET al endpoint de salud del servidor (`/api/tags` para Ollama, `/v1/models` para OpenAI-compatible) con `AbortSignal.timeout(5000)`. Actualiza `connectionStatus` según el resultado. Usar `fetch` de `@tauri-apps/plugin-http`, no fetch nativo.
  - Ampliar `saveAiSettings()` existente: al final del método, antes de `this.closed.emit()`, añadir la llamada a `this.projectService.updateSettings({ aiProvider, aiModel, aiEndpoint, aiApiKey })`. Calcular `endpoint` como `ollamaEndpoint` o `openAiEndpoint` según `selectedProvider`. No eliminar la línea existente `this.aiService.saveApiKey(this.apiKeyInput)`.
- **Depende de**: Tarea 1, Tarea 2
- **Riesgo (fetch de Tauri)**: `testConnection()` también debe usar `import { fetch } from '@tauri-apps/plugin-http'`, no fetch nativo.
- **Riesgo (ngOnInit existente)**: El `ngOnInit` actual tiene lógica de otros campos. Añadir al final del `if (settings)` existente, no reemplazar el bloque completo.
- **Riesgo (saveAiSettings existente)**: La función actual llama `this.aiService.saveApiKey()` y `this.projectService.updateSettings({ aiModel })`. Añadir los campos nuevos a ese `updateSettings`, no crear una llamada separada. La guarda condicional `if (this.projectService.isLoaded())` existente se mantiene.

#### Tarea 5: Reemplazar la sección IA en el template del settings modal
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**: Reemplazar el bloque `@if (activeSection() === 'ai') { ... }` completo (líneas 106–160 del HTML actual) por la nueva sección de la spec. La nueva sección incluye: selector de proveedor con radio buttons, campos condicionales por proveedor (`@if (selectedProvider === 'anthropic')`, `@if (selectedProvider === 'ollama')`, `@if (selectedProvider === 'openai-compatible')`), bloque de estado de conexión `@if (connectionStatus())`, y botón "Guardar configuración de IA". Las clases CSS de inputs (`field-label`, `field-input`) no existen en el proyecto — usar las clases inline de TailwindCSS del estilo actual del modal (ver sección editor para referencia de clases: `text-ink-subtle text-xs font-medium uppercase tracking-wide` para labels, `w-full px-3 py-2 rounded bg-ink-bg border border-ink-border text-ink-text text-sm ...` para inputs). No usar `field-label` ni `field-input`.
- **Depende de**: Tarea 4
- **Riesgo (clases CSS inexistentes)**: La spec usa `field-label` y `field-input` como clases de conveniencia que NO están definidas en el proyecto. Sustituirlas por las clases Tailwind verbosas que ya usa el modal (ver sección Editor del template). El Explorer confirmó que estas clases no existen.
- **Riesgo (FormsModule)**: El `[(ngModel)]` en los radio buttons y los nuevos inputs requiere `FormsModule` que ya está importado en el componente.

#### Tarea 6: Actualizar `AiAssistantPanelComponent` para usar `isProviderReady()`
- **Fichero**: `src/app/features/editor/ai-assistant/ai-assistant-panel.component.ts` (modificar)
- **Qué hace**: Este componente tiene el template inline (no en fichero `.html` separado). Realizar tres cambios:
  1. En el template inline, cambiar la condición `@if (!ai.hasApiKey())` (línea 95) por `@if (!ai.isProviderReady())`.
  2. En el template inline, reemplazar el párrafo de texto fijo "Configura tu Anthropic API key para usar el asistente." por `{{ ai.providerStatusMessage() }}` para que refleje el proveedor activo.
  3. En el template inline, cambiar la clase del botón de settings que tiene `[class.text-ink-warning]="!ai.hasApiKey()"` por `[class.text-ink-warning]="!ai.isProviderReady()"`.
  4. En la propiedad `canSend()` (línea 270), cambiar `this.ai.hasApiKey()` por `this.ai.isProviderReady()`.
- **Depende de**: Tarea 2
- **Riesgo (template inline)**: Este componente tiene el template en el decorador `@Component`, no en un fichero `.html` separado. El Implementer debe editarlo directamente en el `.ts`. No crear un fichero `.html` nuevo.

#### Tarea 7: Actualizar `PREREQUISITES.md` con la guía de Ollama
- **Fichero**: `PREREQUISITES.md` (modificar)
- **Qué hace**: Añadir al final del fichero la sección "Ollama (opcional — para IA local)" con el contenido exacto de la spec: comandos de instalación, descarga de modelos y verificación, y la instrucción de configuración en Inkwell.
- **Depende de**: ninguna dependencia previa

---

### Orden de ejecución

1. Tarea 1 — Modelo: ampliar `ProjectSettings` con `AiProvider`, `aiEndpoint`, `aiApiKey`
2. Tarea 2 — Servicio: reescribir `AiService` multi-proveedor
3. Tarea 3 — Simplificar `ConsistencyService.callAiOnce()`
4. Tarea 4 — Ampliar `.ts` del settings modal (propiedades, métodos, ngOnInit, saveAiSettings)
5. Tarea 5 — Reemplazar sección IA en el template `.html` del settings modal
6. Tarea 6 — Actualizar `AiAssistantPanelComponent` para `isProviderReady()`
7. Tarea 7 — Añadir guía Ollama a `PREREQUISITES.md`

---

### Puntos de atención para el Implementer

**Fetch de Tauri — obligatorio en todas las llamadas HTTP:**
Todas las llamadas `fetch` dentro de `AiService` y `InkSettingsModalComponent.testConnection()` deben importar y usar `fetch` de `@tauri-apps/plugin-http`. El fetch nativo del navegador no funciona en el contexto de Tauri para llamadas a servidores externos. Esto incluye: `streamAnthropic`, `callAnthropicOnce`, `streamOpenAICompatible`, `callOpenAICompatibleOnce`, y `testConnection`.

**Header Anthropic correcto:**
El header es `anthropic-dangerous-direct-browser-access: true`. No usar `anthropic-dangerous-allow-browser` que aparece en la spec — el código actual usa el nombre correcto y debe preservarse.

**No eliminar AiMode 'synopsis':**
El tipo `AiMode` tiene 4 valores en el código actual: `'analyze' | 'review' | 'brainstorm' | 'synopsis'`. La spec muestra solo 3. Preservar 'synopsis' y su entrada en `SYSTEM_PROMPTS`. Si se pierde, se rompe la funcionalidad de sinopsis del editor.

**No reemplazar, ampliar:**
- `ngOnInit()` del settings modal: añadir dentro del `if (settings)` existente, no reemplazarlo.
- `saveAiSettings()` del settings modal: ampliar `updateSettings()` con los campos nuevos, no crear una llamada separada.
- `callAiOnce()` de ConsistencyService: solo reemplazar el cuerpo del método, no tocar el resto del servicio.

**Clases CSS `field-label` y `field-input` no existen:**
La spec usa estas clases pero no están definidas en el proyecto. Usar las clases Tailwind verbosas tal como están en la sección Editor del template actual. El patrón para labels es `text-ink-subtle text-xs font-medium uppercase tracking-wide`. El patrón para inputs es `w-full px-3 py-2 rounded bg-ink-bg border border-ink-border text-ink-text text-sm focus:outline-none focus:border-ink-accent transition-colors`.

**Template inline en AiAssistantPanelComponent:**
El componente tiene el template en el propio `.ts` mediante la propiedad `template:` del decorador. No crear un fichero `.html` externo.

**Ollama nativo vs OpenAI-compatible:**
- Ollama nativo (API propia): endpoint `{base}/api/chat`, formato SSE `{ message: { content }, done }`, test de conexión en `{base}/api/tags`
- OpenAI-compatible: endpoint `{base}/v1/chat/completions`, formato SSE `choices[0].delta.content`, test de conexión en `{base}/v1/models`

**Lo que NO hacer (de la spec):**
- No implementar gestión de modelos de Ollama desde Inkwell (descargar, eliminar modelos)
- No añadir soporte para APIs propietarias adicionales (Gemini, Mistral AI, etc.)
- No implementar fallback automático entre proveedores
- No cachear respuestas de IA entre sesiones
