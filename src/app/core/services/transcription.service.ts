import { Injectable, inject, signal } from '@angular/core';
import { fetch } from '@tauri-apps/plugin-http';
import { ProjectService }     from './project.service';
import { DocumentService }    from './document.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { TreeNode }           from '../models/project.model';

export interface TranscriptionResult {
  text:       string;
  sourceFile: string;
  provider:   string;
  language?:  string;
  durationMs: number;
}

const WHISPER_ENDPOINT: Record<string, string> = {
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  groq:   'https://api.groq.com/openai/v1/audio/transcriptions',
};

const TRANSCRIPTIONS_FOLDER_TITLE = 'Transcriptions';

interface WhisperResponse { text: string; }
interface WhisperError    { error?: { message?: string }; }

@Injectable({ providedIn: 'root' })
export class TranscriptionService {
  private project = inject(ProjectService);
  private docSvc  = inject(DocumentService);
  private bridge  = inject(TauriBridgeService);

  isTranscribing = signal(false);
  progress       = signal('');

  isConfigured(): boolean {
    const s = this.project.project()?.settings;
    if (!s?.transcriptionProvider) return false;
    switch (s.transcriptionProvider) {
      case 'openai':
      case 'groq':  return !!(s.transcriptionApiKey?.trim());
      case 'local': return !!(s.transcriptionEndpoint?.trim());
    }
  }

  providerStatusMessage(): string {
    const s = this.project.project()?.settings;
    if (!s?.transcriptionProvider) return 'Proveedor no configurado';
    switch (s.transcriptionProvider) {
      case 'openai': return s.transcriptionApiKey ? '✓ OpenAI Whisper' : 'API key de OpenAI no configurada';
      case 'groq':   return s.transcriptionApiKey ? '✓ Groq Whisper'   : 'API key de Groq no configurada';
      case 'local':  return s.transcriptionEndpoint ? `✓ Local: ${s.transcriptionEndpoint}` : 'URL del servidor no configurada';
    }
  }

  async transcribe(filePath: string): Promise<TranscriptionResult> {
    const settings = this.project.project()!.settings;
    const provider = settings.transcriptionProvider!;

    this.isTranscribing.set(true);
    this.progress.set('Leyendo archivo de audio...');

    const startMs = Date.now();

    try {
      const bytes    = await this.bridge.readFileBytes(filePath);
      const blob     = new Blob([new Uint8Array(bytes)]);
      const fileName = filePath.split('/').pop() ?? 'audio';
      const ext      = fileName.split('.').pop() ?? 'mp3';

      this.progress.set('Enviando al servicio de transcripción...');

      const formData = new FormData();
      formData.append('file',  new File([blob], fileName, { type: this.mimeType(ext) }));
      const defaultModel = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';
      formData.append('model', settings.transcriptionModel ?? defaultModel);

      if (settings.transcriptionLanguage) {
        formData.append('language', settings.transcriptionLanguage);
      }

      const url = provider === 'local'
        ? `${settings.transcriptionEndpoint!.replace(/\/$/, '')}/v1/audio/transcriptions`
        : WHISPER_ENDPOINT[provider];

      const apiKey = settings.transcriptionApiKey ?? '';

      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      this.progress.set('Transcribiendo...');

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as WhisperError;
        throw new Error(error.error?.message ?? `Error ${response.status}`);
      }

      const data = await response.json() as WhisperResponse;
      const text = data.text ?? '';

      return {
        text,
        sourceFile: fileName,
        provider,
        language:   settings.transcriptionLanguage,
        durationMs: Date.now() - startMs,
      };

    } finally {
      this.isTranscribing.set(false);
      this.progress.set('');
    }
  }

  async saveTranscriptionToProject(result: TranscriptionResult): Promise<TreeNode> {
    const folderId = await this.getOrCreateTranscriptionsFolder();

    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const baseName  = result.sourceFile.replace(/\.[^.]+$/, '');
    const docTitle  = `${baseName} — ${timestamp}`;

    const headerText  = this.buildHeaderText(result);
    const fullContent = this.buildTipTapContent(headerText, result.text);

    const doc   = await this.docSvc.createDocument(docTitle, folderId);
    const saved = await this.docSvc.saveDocument({ ...doc, content: fullContent });

    return {
      id:       saved.id,
      title:    saved.title,
      type:     'document',
      children: [],
    };
  }

  private async getOrCreateTranscriptionsFolder(): Promise<string> {
    const tree     = this.project.project()?.tree ?? [];
    const existing = tree.find(n => n.type === 'folder' && n.title === TRANSCRIPTIONS_FOLDER_TITLE);

    if (existing) return existing.id;

    const node = await this.project.addNode('folder', TRANSCRIPTIONS_FOLDER_TITLE, null);
    return node.id;
  }

  private buildHeaderText(result: TranscriptionResult): string {
    const lines = [
      `Fuente: ${result.sourceFile}`,
      `Proveedor: ${result.provider}`,
      `Fecha: ${new Date().toLocaleString('es-ES')}`,
      `Duración del proceso: ${(result.durationMs / 1000).toFixed(1)}s`,
    ];
    if (result.language) lines.push(`Idioma: ${result.language}`);
    return lines.join(' · ');
  }

  private buildTipTapContent(headerText: string, transcriptionText: string): object {
    const paragraphs = transcriptionText
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => ({
        type:    'paragraph',
        content: [{ type: 'text', text: p }],
      }));

    return {
      type:    'doc',
      content: [
        {
          type:    'paragraph',
          content: [{
            type:  'text',
            text:  headerText,
            marks: [{ type: 'italic' }],
          }],
        },
        { type: 'horizontalRule' },
        ...paragraphs,
      ],
    };
  }

  private mimeType(ext: string): string {
    const map: Record<string, string> = {
      mp3:  'audio/mpeg',
      mp4:  'audio/mp4',
      m4a:  'audio/mp4',
      wav:  'audio/wav',
      ogg:  'audio/ogg',
      webm: 'audio/webm',
      flac: 'audio/flac',
    };
    return map[ext.toLowerCase()] ?? 'audio/mpeg';
  }
}
