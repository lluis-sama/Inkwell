# INK-19 — IA personalizada (Ollama local o servidor SLM externo)

## Objetivo

Permitir al usuario usar un modelo de lenguaje distinto a la API de Anthropic para el asistente de IA de Inkwell. Soportar dos modos adicionales:

1. **Ollama local** — modelo corriendo en la misma máquina del usuario
2. **Servidor OpenAI-compatible** — cualquier endpoint que implemente la API de OpenAI (`/v1/chat/completions`), incluyendo servidores de llama.cpp, LM Studio, LocalAI, vLLM, etc.

La integración con Anthropic de las specs anteriores no cambia. El usuario elige qué proveedor usar por proyecto en settings.

---

## Decisiones de diseño

- **Compatibilidad**: el modo "servidor OpenAI-compatible" cubre prácticamente todos los SLMs que se ejecutan localmente o en red. llama-server (llama.cpp), LM Studio, Jan, Ollama (también expone OpenAI API), LocalAI, etc. son todos compatibles.
- **Streaming**: ambos modos nuevos soportan streaming SSE igual que Anthropic.
- **Sin dependencias nuevas**: la API OpenAI-compatible se llama directamente con `fetch`, sin SDK.
- **Por proyecto**: el proveedor y modelo se configura en `ProjectSettings` y persiste en `project.json`. Distintos proyectos pueden usar distintos proveedores.

---

## Cambios en el modelo de datos

### `project.model.ts` — ampliar `ProjectSettings`

```typescript
export type AiProvider = 'anthropic' | 'openai-compatible' | 'ollama';

export interface ProjectSettings {
  autosaveInterval: number;
  maxSnapshots:     number;
  aiModel:          string;        // nombre del modelo para el proveedor activo
  spellcheck:       boolean;
  aiProvider:       AiProvider;    // NUEVO — default: 'anthropic'
  aiEndpoint?:      string;        // NUEVO — URL del servidor (para openai-compatible y ollama)
  aiApiKey?:        string;        // NUEVO — API key opcional para openai-compatible
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autosaveInterval: 30,
  maxSnapshots:     10,
  aiModel:          'claude-sonnet-4-20250514',
  spellcheck:       true,
  aiProvider:       'anthropic',
};
```

---

## Actualizar `AiService`

El `AiService` existente solo habla con Anthropic. Lo ampliamos para que despache al proveedor correcto según la configuración del proyecto activo.

### `src/app/core/services/ai.service.ts` (reemplazar)

```typescript
import { Injectable, signal, inject } from '@angular/core';
import { ProjectService } from './project.service';
import { AiProvider } from '../models/project.model';

export type AiMode = 'analyze' | 'review' | 'brainstorm';

export interface AiMessage {
  role:    'user' | 'assistant';
  content: string;
}

// ─── System prompts (sin cambios respecto a INK-08) ───────────────────────

const SYSTEM_PROMPTS: Record<AiMode, string> = {
  analyze: `Eres un asistente experto en escritura creativa y narrativa.
Tu función es analizar escenas literarias: estructura, ritmo, tensión dramática,
consistencia de personajes, point of view, y eficacia narrativa.
Responde siempre en el mismo idioma que el texto que se te proporcione.
Sé directo, constructivo y específico. Cita fragmentos del texto cuando sea relevante.`,

  review: `Eres un editor literario profesional.
Tu función es revisar textos: corrección gramatical, ortográfica y de estilo,
claridad, coherencia, fluidez y precisión del lenguaje.
Responde siempre en el mismo idioma que el texto que se te proporcione.
Organiza tus comentarios de mayor a menor importancia. Propón alternativas concretas.`,

  brainstorm: `Eres un compañero creativo para escritores.
Tu función es ayudar a explorar ideas: tramas, personajes, mundos, conflictos,
giros narrativos, motivaciones, y cualquier elemento de la historia.
Responde siempre en el mismo idioma en que te hablen.
Sé generoso con las ideas, propón variantes y haz preguntas que abran posibilidades.`,
};

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

@Injectable({ providedIn: 'root' })
export class AiService {
  private projectService = inject(ProjectService);

  // API key de Anthropic (global, en localStorage)
  readonly apiKey    = signal<string>(localStorage.getItem('inkwell-api-key') ?? '');
  readonly hasApiKey = () => this.apiKey().trim().length > 0;

  saveApiKey(key: string): void {
    this.apiKey.set(key.trim());
    localStorage.setItem('inkwell-api-key', key.trim());
  }

  clearApiKey(): void {
    this.apiKey.set('');
    localStorage.removeItem('inkwell-api-key');
  }

  // ─── Estado del proveedor activo ─────────────────────────────────────────

  /**
   * Retorna la configuración del proveedor activo para el proyecto actual.
   */
  getActiveProvider(): {
    provider: AiProvider;
    model:    string;
    endpoint: string | undefined;
    apiKey:   string | undefined;
  } {
    const settings = this.projectService.project()?.settings;
    return {
      provider: settings?.aiProvider  ?? 'anthropic',
      model:    settings?.aiModel     ?? 'claude-sonnet-4-20250514',
      endpoint: settings?.aiEndpoint,
      apiKey:   settings?.aiApiKey,
    };
  }

  /**
   * ¿Está listo el proveedor activo para recibir llamadas?
   */
  isProviderReady(): boolean {
    const { provider, endpoint, apiKey } = this.getActiveProvider();
    switch (provider) {
      case 'anthropic':        return this.hasApiKey();
      case 'ollama':           return !!(endpoint?.trim());
      case 'openai-compatible': return !!(endpoint?.trim());
    }
  }

  /**
   * Mensaje de estado del proveedor para la UI.
   */
  providerStatusMessage(): string {
    const { provider, endpoint } = this.getActiveProvider();
    switch (provider) {
      case 'anthropic':
        return this.hasApiKey() ? '✓ Anthropic configurado' : 'API key no configurada';
      case 'ollama':
        return endpoint ? `✓ Ollama: ${endpoint}` : 'URL de Ollama no configurada';
      case 'openai-compatible':
        return endpoint ? `✓ Servidor: ${endpoint}` : 'URL del servidor no configurada';
    }
  }

  // ─── Streaming unificado ─────────────────────────────────────────────────

  /**
   * Envía un mensaje y retorna un AsyncGenerator de chunks de texto.
   * Delega al proveedor configurado en el proyecto activo.
   */
  async *streamMessage(
    messages: AiMessage[],
    mode: AiMode,
    context: string,
  ): AsyncGenerator<string> {
    if (!this.isProviderReady()) {
      throw new Error('El proveedor de IA no está configurado correctamente.');
    }

    const { provider } = this.getActiveProvider();
    const messagesWithContext = this.injectContext(messages, context);
    const systemPrompt = mode;

    switch (provider) {
      case 'anthropic':
        yield* this.streamAnthropic(messagesWithContext, SYSTEM_PROMPTS[mode]);
        break;
      case 'ollama':
        yield* this.streamOpenAICompatible(messagesWithContext, SYSTEM_PROMPTS[mode], true);
        break;
      case 'openai-compatible':
        yield* this.streamOpenAICompatible(messagesWithContext, SYSTEM_PROMPTS[mode], false);
        break;
    }
  }

  // ─── Proveedor Anthropic (sin cambios respecto a INK-08) ─────────────────

  private async *streamAnthropic(
    messages: AiMessage[],
    systemPrompt: string,
  ): AsyncGenerator<string> {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':                    'application/json',
        'x-api-key':                        this.apiKey(),
        'anthropic-version':               '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify({
        model:      this.getActiveProvider().model,
        max_tokens: 2048,
        stream:     true,
        system:     systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as any).error?.message ?? `Error ${response.status}`);
    }

    yield* this.readSSEStream(response, 'anthropic');
  }

  // ─── Proveedor OpenAI-compatible (Ollama, llama.cpp, LM Studio, etc.) ────

  private async *streamOpenAICompatible(
    messages: AiMessage[],
    systemPrompt: string,
    isOllama: boolean,
  ): AsyncGenerator<string> {
    const { model, endpoint, apiKey } = this.getActiveProvider();

    // Construir la URL del endpoint
    const baseUrl = endpoint!.replace(/\/$/, '');
    const url     = isOllama
      ? `${baseUrl}/api/chat`           // Ollama nativo
      : `${baseUrl}/v1/chat/completions`; // OpenAI-compatible

    // Convertir al formato de mensajes OpenAI (añadir system como primer mensaje)
    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = isOllama
      ? JSON.stringify({ model, messages: openAiMessages, stream: true })
      : JSON.stringify({ model, messages: openAiMessages, stream: true, max_tokens: 2048 });

    const response = await fetch(url, { method: 'POST', headers, body });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Error del servidor (${response.status}): ${errorText.slice(0, 200) || 'Sin detalles'}`
      );
    }

    yield* this.readSSEStream(response, isOllama ? 'ollama' : 'openai');
  }

  // ─── Lector de SSE unificado ─────────────────────────────────────────────

  private async *readSSEStream(
    response: Response,
    format: 'anthropic' | 'openai' | 'ollama',
  ): AsyncGenerator<string> {
    const reader  = response.body!.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const text = this.extractChunkText(line.trim(), format);
        if (text) yield text;
      }
    }

    // Procesar lo que quede en el buffer
    if (buffer.trim()) {
      const text = this.extractChunkText(buffer.trim(), format);
      if (text) yield text;
    }
  }

  private extractChunkText(
    line: string,
    format: 'anthropic' | 'openai' | 'ollama',
  ): string {
    if (!line.startsWith('data: ')) return '';
    const data = line.slice(6).trim();
    if (data === '[DONE]') return '';

    try {
      const parsed = JSON.parse(data);

      switch (format) {
        case 'anthropic':
          if (parsed.type === 'content_block_delta' &&
              parsed.delta?.type === 'text_delta') {
            return parsed.delta.text ?? '';
          }
          return '';

        case 'openai':
          return parsed.choices?.[0]?.delta?.content ?? '';

        case 'ollama': {
          // Ollama nativo usa { message: { content: '...' }, done: bool }
          if (parsed.done) return '';
          return parsed.message?.content ?? '';
        }
      }
    } catch { return ''; }

    return '';
  }

  // ─── Llamada sin streaming (para ConsistencyService) ─────────────────────

  /**
   * Llamada directa sin streaming. Usada por ConsistencyService (INK-18).
   * Funciona con cualquier proveedor.
   */
  async callOnce(
    userContent: string,
    systemPrompt: string,
    maxTokens = 2048,
  ): Promise<string> {
    if (!this.isProviderReady()) {
      throw new Error('El proveedor de IA no está configurado correctamente.');
    }

    const { provider, model, endpoint, apiKey } = this.getActiveProvider();

    if (provider === 'anthropic') {
      return this.callAnthropicOnce(userContent, systemPrompt, model, maxTokens);
    } else {
      return this.callOpenAICompatibleOnce(
        userContent, systemPrompt, model, endpoint!, apiKey, provider === 'ollama', maxTokens,
      );
    }
  }

  private async callAnthropicOnce(
    content: string, system: string, model: string, maxTokens: number,
  ): Promise<string> {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':                    'application/json',
        'x-api-key':                        this.apiKey(),
        'anthropic-version':               '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify({
        model, max_tokens: maxTokens, system,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!response.ok) throw new Error(`Error Anthropic ${response.status}`);
    const data = await response.json();
    return data.content?.[0]?.text ?? '';
  }

  private async callOpenAICompatibleOnce(
    content: string, system: string, model: string,
    endpoint: string, apiKey: string | undefined,
    isOllama: boolean, maxTokens: number,
  ): Promise<string> {
    const baseUrl = endpoint.replace(/\/$/, '');
    const url     = isOllama
      ? `${baseUrl}/api/chat`
      : `${baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages:   [
        { role: 'system',  content: system },
        { role: 'user',    content },
      ],
    });

    const response = await fetch(url, { method: 'POST', headers, body });
    if (!response.ok) throw new Error(`Error servidor ${response.status}`);
    const data = await response.json();

    return isOllama
      ? data.message?.content ?? ''
      : data.choices?.[0]?.message?.content ?? '';
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────

  private injectContext(messages: AiMessage[], context: string): AiMessage[] {
    if (!context.trim() || messages.length === 0) return messages;
    const [first, ...rest] = messages;
    return [
      {
        role:    'user',
        content: `[CONTEXTO DEL DOCUMENTO]\n${context}\n\n[MENSAJE]\n${first.content}`,
      },
      ...rest,
    ];
  }
}
```

### Actualizar `ConsistencyService` (INK-18)

Reemplazar la llamada directa a `fetch` en `callAiOnce` por `this.ai.callOnce`:

```typescript
// En consistency.service.ts, cambiar el método callAiOnce:
private callAiOnce(userContent: string, systemPrompt: string): Promise<string> {
  return this.ai.callOnce(userContent, systemPrompt);
}

// Añadir inject:
private ai = inject(AiService);
```

---

## Sección de IA en `InkSettingsModalComponent` (ampliar)

Reemplazar la sección "IA" del modal de settings para incluir la configuración de proveedor.

```html
<!-- Sección IA — nueva versión -->
@if (activeSection() === 'ai') {
  <div class="flex flex-col gap-5">

    <!-- Selector de proveedor -->
    <div class="flex flex-col gap-1.5">
      <label class="field-label">Proveedor de IA</label>
      <div class="flex flex-col gap-2">
        @for (p of providers; track p.id) {
          <label class="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer
                        transition-all"
                 [class]="selectedProvider === p.id
                   ? 'border-ink-accent bg-ink-surface'
                   : 'border-ink-border hover:border-ink-muted'">
            <input type="radio" [value]="p.id" [(ngModel)]="selectedProvider"
                   class="mt-0.5 accent-ink-accent"/>
            <div class="flex flex-col gap-0.5">
              <span class="text-ink-text text-sm font-medium">{{ p.label }}</span>
              <span class="text-ink-subtle text-xs">{{ p.description }}</span>
            </div>
          </label>
        }
      </div>
    </div>

    <!-- Configuración según proveedor -->

    @if (selectedProvider === 'anthropic') {
      <!-- API key de Anthropic (sin cambios) -->
      <div class="flex flex-col gap-1.5">
        <label class="field-label">Anthropic API Key</label>
        <input [(ngModel)]="apiKeyInput" type="password" placeholder="sk-ant-..."
               class="field-input font-mono"/>
        @if (aiService.hasApiKey()) {
          <div class="flex items-center justify-between px-3 py-1.5 rounded
                      bg-ink-bg border border-ink-success/30 mt-1">
            <span class="text-ink-success text-xs">✓ API key configurada</span>
            <button (click)="clearApiKey()"
                    class="text-ink-subtle text-xs hover:text-ink-danger transition-colors">
              Eliminar
            </button>
          </div>
        }
      </div>

      <!-- Selector de modelo Anthropic -->
      <div class="flex flex-col gap-1.5">
        <label class="field-label">Modelo</label>
        <select [(ngModel)]="selectedModel" class="field-input">
          @for (m of anthropicModels; track m.id) {
            <option [value]="m.id">{{ m.label }}</option>
          }
        </select>
      </div>
    }

    @if (selectedProvider === 'ollama') {
      <div class="flex flex-col gap-1.5">
        <label class="field-label">URL de Ollama</label>
        <input [(ngModel)]="ollamaEndpoint" placeholder="http://localhost:11434"
               class="field-input font-mono"/>
        <p class="text-ink-muted text-xs leading-relaxed">
          URL base de tu instancia de Ollama. Por defecto: http://localhost:11434
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="field-label">Nombre del modelo</label>
        <input [(ngModel)]="selectedModel" placeholder="llama3.2, mistral, qwen2.5..."
               class="field-input font-mono"/>
        <p class="text-ink-muted text-xs">
          Debe estar descargado en tu instancia de Ollama.
          Ejecuta <code class="bg-ink-bg px-1 rounded">ollama list</code> para ver los disponibles.
        </p>
      </div>
      <ink-button variant="secondary" [fullWidth]="true" (clicked)="testConnection()">
        Probar conexión
      </ink-button>
    }

    @if (selectedProvider === 'openai-compatible') {
      <div class="flex flex-col gap-1.5">
        <label class="field-label">URL del servidor *</label>
        <input [(ngModel)]="openAiEndpoint" placeholder="http://localhost:1234"
               class="field-input font-mono"/>
        <p class="text-ink-muted text-xs leading-relaxed">
          Compatible con llama.cpp (llama-server), LM Studio, LocalAI, vLLM, Jan, etc.
          La app añade automáticamente <code class="bg-ink-bg px-1 rounded">/v1/chat/completions</code>.
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="field-label">Nombre del modelo</label>
        <input [(ngModel)]="selectedModel"
               placeholder="qwen2.5-7b-instruct, llama-3.2-3b..."
               class="field-input font-mono"/>
        <p class="text-ink-muted text-xs">
          El nombre exacto depende de tu servidor. Muchos aceptan cualquier cadena.
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="field-label">API key <span class="normal-case font-normal">(si tu servidor la requiere)</span></label>
        <input [(ngModel)]="openAiCustomKey" type="password" placeholder="opcional"
               class="field-input font-mono"/>
      </div>
      <ink-button variant="secondary" [fullWidth]="true" (clicked)="testConnection()">
        Probar conexión
      </ink-button>
    }

    <!-- Estado de la conexión tras el test -->
    @if (connectionStatus()) {
      <div class="flex items-center gap-2 px-3 py-2 rounded border text-xs"
           [class]="connectionStatus()!.ok
             ? 'border-ink-success/30 text-ink-success bg-ink-bg'
             : 'border-ink-danger/30 text-ink-danger bg-ink-bg'">
        {{ connectionStatus()!.ok ? '✓' : '✕' }} {{ connectionStatus()!.message }}
      </div>
    }

    <!-- Guardar -->
    <ink-button variant="primary" (clicked)="saveAiSettings()">
      Guardar configuración de IA
    </ink-button>

  </div>
}
```

**Nuevas propiedades en `InkSettingsModalComponent`:**

```typescript
// Providers disponibles
readonly providers = [
  {
    id:          'anthropic' as AiProvider,
    label:       'Anthropic (Claude)',
    description: 'API en la nube. Máxima calidad. Requiere API key y conexión a internet.',
  },
  {
    id:          'ollama' as AiProvider,
    label:       'Ollama (local)',
    description: 'Modelo ejecutándose en tu máquina. Sin coste por token, sin internet.',
  },
  {
    id:          'openai-compatible' as AiProvider,
    label:       'Servidor OpenAI-compatible',
    description: 'llama.cpp, LM Studio, LocalAI, vLLM, Jan, etc. Local o en red.',
  },
];

readonly anthropicModels = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (recomendado)' },
  { id: 'claude-opus-4-20250514',   label: 'Claude Opus 4 (más capaz)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (más rápido)' },
];

selectedProvider  = 'anthropic' as AiProvider;
ollamaEndpoint    = 'http://localhost:11434';
openAiEndpoint    = '';
openAiCustomKey   = '';
connectionStatus  = signal<{ ok: boolean; message: string } | null>(null);

ngOnInit(): void {
  const settings = this.projectService.project()?.settings;
  if (settings) {
    this.selectedProvider = settings.aiProvider   ?? 'anthropic';
    this.selectedModel    = settings.aiModel       ?? 'claude-sonnet-4-20250514';
    this.ollamaEndpoint   = settings.aiEndpoint    ?? 'http://localhost:11434';
    this.openAiEndpoint   = settings.aiEndpoint    ?? '';
    this.openAiCustomKey  = settings.aiApiKey      ?? '';
    // otros campos existentes...
  }
}

async testConnection(): Promise<void> {
  this.connectionStatus.set(null);
  const endpoint = this.selectedProvider === 'ollama'
    ? this.ollamaEndpoint
    : this.openAiEndpoint;

  if (!endpoint.trim()) {
    this.connectionStatus.set({ ok: false, message: 'Introduce una URL primero.' });
    return;
  }

  try {
    // Llamada mínima para verificar que el servidor responde
    const url = this.selectedProvider === 'ollama'
      ? `${endpoint.replace(/\/$/, '')}/api/tags`
      : `${endpoint.replace(/\/$/, '')}/v1/models`;

    const response = await fetch(url, {
      method:  'GET',
      headers: this.openAiCustomKey
        ? { 'Authorization': `Bearer ${this.openAiCustomKey}` }
        : {},
      signal: AbortSignal.timeout(5000),  // 5s timeout
    });

    if (response.ok) {
      this.connectionStatus.set({ ok: true, message: 'Conexión exitosa.' });
    } else {
      this.connectionStatus.set({
        ok:      false,
        message: `El servidor respondió con error ${response.status}.`,
      });
    }
  } catch (e: any) {
    this.connectionStatus.set({
      ok:      false,
      message: e.name === 'AbortError'
        ? 'Tiempo de espera agotado. ¿Está el servidor en marcha?'
        : `Sin respuesta del servidor. ¿Es correcta la URL?`,
    });
  }
}

saveAiSettings(): void {
  if (this.apiKeyInput.trim()) this.aiService.saveApiKey(this.apiKeyInput);

  const endpoint = this.selectedProvider === 'ollama'
    ? this.ollamaEndpoint
    : this.openAiEndpoint;

  this.projectService.updateSettings({
    aiProvider:  this.selectedProvider,
    aiModel:     this.selectedModel,
    aiEndpoint:  endpoint || undefined,
    aiApiKey:    this.openAiCustomKey || undefined,
  });

  this.closed.emit();
}
```

---

## Actualizar `AiAssistantPanelComponent` (INK-08)

Cambiar la referencia al estado del proveedor para usar el nuevo método de `AiService`:

```typescript
// En AiAssistantPanelComponent:
// Antes: @if (!ai.hasApiKey())
// Ahora: @if (!ai.isProviderReady())

// El mensaje del estado:
providerMessage = () => this.ai.providerStatusMessage();
```

En el template, reemplazar el aviso de "API key no configurada":

```html
@if (!ai.isProviderReady()) {
  <div class="flex flex-col items-center gap-3 m-4 p-4 rounded-lg
              border border-ink-warning/30 bg-ink-bg">
    <p class="text-ink-warning text-xs text-center leading-relaxed">
      {{ ai.providerStatusMessage() }}
    </p>
    <button (click)="showSettings.set(true)"
            class="text-ink-accent text-xs hover:underline">
      Abrir configuración →
    </button>
  </div>
}
```

---

## Criterios de aceptación

**Configuración general:**
- [ ] La sección "IA" de settings muestra los tres proveedores como opciones de radio
- [ ] Al seleccionar "Ollama", aparecen los campos de URL y nombre de modelo
- [ ] Al seleccionar "Servidor OpenAI-compatible", aparecen URL, nombre de modelo y API key opcional
- [ ] Al seleccionar "Anthropic", aparecen los campos existentes de INK-08
- [ ] La configuración del proveedor se persiste en `project.json`
- [ ] Distintos proyectos pueden tener distintos proveedores configurados

**Botón "Probar conexión":**
- [ ] Con Ollama/OpenAI-compatible, el botón comprueba que el servidor responde en < 5s
- [ ] Si el servidor responde correctamente, muestra un mensaje verde "Conexión exitosa"
- [ ] Si el servidor no responde o devuelve error, muestra el mensaje de error específico
- [ ] Si se agota el tiempo de espera, muestra "¿Está el servidor en marcha?"
- [ ] Sin URL introducida, el botón muestra "Introduce una URL primero"

**Anthropic (sin regresiones):**
- [ ] La funcionalidad existente de Anthropic de INK-08 sigue funcionando exactamente igual
- [ ] El streaming funciona igual que antes para Anthropic

**Ollama:**
- [ ] Con Ollama corriendo en `localhost:11434` y un modelo descargado, el asistente responde
- [ ] El streaming de texto funciona (el texto aparece progresivamente)
- [ ] Si Ollama no está corriendo, el error se muestra en el panel de IA de forma clara

**Servidor OpenAI-compatible:**
- [ ] Con llama-server (llama.cpp) corriendo localmente, el asistente responde
- [ ] Con LM Studio corriendo localmente, el asistente responde
- [ ] El streaming funciona correctamente
- [ ] Si se proporciona API key, se añade al header `Authorization: Bearer {key}`
- [ ] Si no se proporciona API key, la llamada se hace sin header de autorización

**Panel de IA:**
- [ ] El aviso de "sin configurar" usa `isProviderReady()` en lugar de `hasApiKey()`
- [ ] El mensaje de estado refleja el proveedor activo (no siempre "API key no configurada")
- [ ] `ConsistencyService` (INK-18) usa `AiService.callOnce()` y funciona con cualquier proveedor

---

## Guía rápida de configuración para Ollama

Añadir en `PREREQUISITES.md`:

```markdown
## Ollama (opcional — para IA local)

```bash
# Instalar Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Descargar un modelo (ejemplos)
ollama pull llama3.2       # 3B params, ~2GB, rápido
ollama pull qwen2.5:7b     # 7B params, ~4.7GB, mejor calidad
ollama pull mistral        # 7B params, ~4.1GB, buen equilibrio

# Verificar que está corriendo
ollama list
curl http://localhost:11434/api/tags
```

En Inkwell: Settings → IA → Ollama → URL: `http://localhost:11434` → Modelo: `llama3.2`
```

---

## Lo que NO hacer en esta spec

- No implementar gestión de modelos de Ollama desde Inkwell (descargar, eliminar)
- No añadir soporte para APIs propietarias adicionales (Gemini, Mistral AI, etc.)
- No implementar fallback automático entre proveedores si uno falla
- No cachear respuestas de la IA entre sesiones
