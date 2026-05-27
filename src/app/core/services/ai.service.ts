import { Injectable, signal, inject, computed } from '@angular/core';
import { fetch } from '@tauri-apps/plugin-http';
import { ProjectService } from './project.service';
import { AiProvider } from '../models/project.model';
import { TauriBridgeService } from './tauri-bridge.service';
import { AiSession } from '../models/ai-session.model';
import { aiSessionPath } from '../../shared/utils/project-paths';
import { AppConfigService } from './app-config.service';

export type AiMode = 'analyze' | 'review' | 'brainstorm' | 'synopsis';

export interface AiMessage {
  role:    'user' | 'assistant';
  content: string;
}

// ─── System prompts ───────────────────────────────────────────────────────────

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

  synopsis: `Eres un asistente especializado en generar sinopsis de capítulos literarios.
Tu función es producir sinopsis concisas (2-3 frases) que capturen los eventos principales,
el arco emocional y las consecuencias narrativas del texto proporcionado.
Responde ÚNICAMENTE con la sinopsis, sin introducción, título, ni explicación adicional.
Responde siempre en el mismo idioma que el texto que se te proporcione.`,
};

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

@Injectable({ providedIn: 'root' })
export class AiService {
  private projectService = inject(ProjectService);
  private bridge         = inject(TauriBridgeService);
  private appConfig      = inject(AppConfigService);

  // API key de Anthropic (global, delegada a AppConfigService)
  readonly apiKey    = computed(() => this.appConfig.config().apiKey);
  readonly hasApiKey = () => this.apiKey().trim().length > 0;

  // ─── Estado de conversación ──────────────────────────────────────────────
  readonly messages         = signal<AiMessage[]>([]);
  readonly currentMode      = signal<AiMode>('analyze');
  readonly isStreaming      = signal<boolean>(false);
  readonly streamingContent = signal<string>('');

  async saveApiKey(key: string): Promise<void> {
    await this.appConfig.setApiKey(key);
  }

  async clearApiKey(): Promise<void> {
    await this.appConfig.clearApiKey();
  }

  // ─── Persistencia de sesión ──────────────────────────────────────────────

  async loadSession(basePath: string, projectId: string): Promise<void> {
    try {
      const raw = await this.bridge.readJsonFile(aiSessionPath(basePath));
      const session = JSON.parse(raw) as AiSession;
      if (session?.projectId === projectId) {
        this.messages.set(session.messages ?? []);
        this.currentMode.set(session.mode ?? 'analyze');
      }
    } catch {
      // Fichero no existe o es inválido — estado inicial, sin error
    }
  }

  async clearSession(basePath: string, projectId: string): Promise<void> {
    this.messages.set([]);
    this.currentMode.set('analyze');
    this.streamingContent.set('');
    await this.persistSession(basePath, projectId);
  }

  private async persistSession(basePath: string, projectId: string): Promise<void> {
    const session: AiSession = {
      projectId,
      mode:      this.currentMode(),
      messages:  this.messages(),
      updatedAt: new Date().toISOString(),
    };
    await this.bridge.writeJsonFile(aiSessionPath(basePath), JSON.stringify(session, null, 2));
  }

  // ─── Envío de mensajes ───────────────────────────────────────────────────

  async sendMessage(userInput: string, context: string, basePath: string, projectId: string): Promise<void> {
    // Añadir mensaje del usuario
    this.messages.update(msgs => [...msgs, { role: 'user', content: userInput }]);
    this.isStreaming.set(true);
    this.streamingContent.set('');

    try {
      let fullResponse = '';

      for await (const chunk of this.streamMessage(
        this.messages(),
        this.currentMode(),
        context,
      )) {
        fullResponse += chunk;
        this.streamingContent.set(fullResponse);
      }

      // Mover streaming content al historial
      this.messages.update(msgs => [
        ...msgs,
        { role: 'assistant', content: fullResponse },
      ]);
      this.streamingContent.set('');

      // Persistir tras cada intercambio
      await this.persistSession(basePath, projectId);

    } catch (e: unknown) {
      // Eliminar el mensaje de usuario si falló
      this.messages.update(msgs => msgs.slice(0, -1));
      this.streamingContent.set('');
      throw e; // relanzar para que el componente pueda mostrar el error
    } finally {
      this.isStreaming.set(false);
    }
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
    const { provider, endpoint } = this.getActiveProvider();
    switch (provider) {
      case 'anthropic':         return this.hasApiKey();
      case 'ollama':            return !!(endpoint?.trim());
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
   *
   * @param messages  Historial de conversación (sin el system prompt)
   * @param mode      Modo de asistencia; determina el system prompt
   * @param context   Contexto adicional (título del proyecto + texto del documento)
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

  // ─── Proveedor Anthropic ──────────────────────────────────────────────────

  private async *streamAnthropic(
    messages: AiMessage[],
    systemPrompt: string,
  ): AsyncGenerator<string> {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':                            'application/json',
        'x-api-key':                               this.apiKey(),
        'anthropic-version':                       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
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
      throw new Error(
        (error as { error?: { message?: string } }).error?.message
        ?? `Error ${response.status} de la API`
      );
    }

    yield* this.readSSEStream(response, 'anthropic');
  }

  // ─── Proveedor OpenAI-compatible (Ollama, llama.cpp, LM Studio, etc.) ─────

  private async *streamOpenAICompatible(
    messages: AiMessage[],
    systemPrompt: string,
    isOllama: boolean,
  ): AsyncGenerator<string> {
    const { model, endpoint, apiKey } = this.getActiveProvider();

    // Construir la URL del endpoint
    const baseUrl = endpoint!.replace(/\/$/, '');
    const url     = isOllama
      ? `${baseUrl}/api/chat`            // Ollama nativo
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

  // ─── Lector de SSE unificado ──────────────────────────────────────────────

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
        'Content-Type':                            'application/json',
        'x-api-key':                               this.apiKey(),
        'anthropic-version':                       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model, max_tokens: maxTokens, system,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!response.ok) throw new Error(`Error Anthropic ${response.status}`);
    const data = await response.json();
    return (data as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '';
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
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content },
      ],
    });

    const response = await fetch(url, { method: 'POST', headers, body });
    if (!response.ok) throw new Error(`Error servidor ${response.status}`);
    const data = await response.json() as {
      message?: { content?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

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
