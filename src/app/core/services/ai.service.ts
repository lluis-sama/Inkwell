import { Injectable, signal } from '@angular/core';
import { fetch } from '@tauri-apps/plugin-http';

export type AiMode = 'analyze' | 'review' | 'brainstorm' | 'synopsis';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL             = 'claude-sonnet-4-20250514';

@Injectable({ providedIn: 'root' })
export class AiService {
  readonly apiKey      = signal<string>(localStorage.getItem('inkwell-api-key') ?? '');
  readonly hasApiKey   = () => this.apiKey().trim().length > 0;

  saveApiKey(key: string): void {
    this.apiKey.set(key.trim());
    localStorage.setItem('inkwell-api-key', key.trim());
  }

  clearApiKey(): void {
    this.apiKey.set('');
    localStorage.removeItem('inkwell-api-key');
  }

  /**
   * Envía un mensaje al modelo y devuelve un AsyncGenerator que emite
   * chunks de texto a medida que llegan (streaming SSE).
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
    if (!this.hasApiKey()) throw new Error('API key no configurada');

    const key = this.apiKey();

    // Inyectar contexto en el primer mensaje de usuario si existe
    const messagesWithContext = this.injectContext(messages, context);

    const headers = new Headers();
    headers.set('content-type', 'application/json');
    headers.set('x-api-key', key);
    headers.set('anthropic-version', '2023-06-01');
    headers.set('anthropic-dangerous-direct-browser-access', 'true');

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 2048,
        stream:     true,
        system:     SYSTEM_PROMPTS[mode],
        messages:   messagesWithContext,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { error?: { message?: string } }).error?.message
        ?? `Error ${response.status} de la API`
      );
    }

    // Leer el stream SSE
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
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' &&
              parsed.delta?.type === 'text_delta') {
            yield parsed.delta.text as string;
          }
        } catch {
          // Ignorar líneas malformadas
        }
      }
    }
  }

  /**
   * Inyecta el contexto del proyecto/documento como prefijo
   * del primer mensaje de usuario en el historial.
   */
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
