import { Component, inject, signal, OnInit, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { fetch } from '@tauri-apps/plugin-http';
import { AiService } from '../../core/services/ai.service';
import { BackupService } from '../../core/services/backup.service';
import { ProjectService } from '../../core/services/project.service';
import { ThemeService } from '../../core/services/theme.service';
import { AiProvider, ImageProvider, ImageSize, TranscriptionProvider } from '../../core/models/project.model';
import { InkModalComponent } from './ink-modal.component';
import { InkButtonComponent } from './ink-button.component';

type SettingsSection = 'editor' | 'ai' | 'appearance';

const AI_MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (recomendado)' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4 (más capaz, más lento)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (más rápido)' },
];

@Component({
  selector: 'ink-settings-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  templateUrl: './ink-settings-modal.component.html',
})
export class InkSettingsModalComponent implements OnInit {
  aiService = inject(AiService);
  private backupService = inject(BackupService);
  projectService = inject(ProjectService);
  themeService = inject(ThemeService);

  closed = output<void>();

  activeSection = signal<SettingsSection>('editor');

  // Editor settings
  autosaveInterval = 30;
  maxSnapshots = 10;
  spellcheck = true;

  // AI settings
  apiKeyInput = '';
  selectedModel = 'claude-sonnet-4-20250514';

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

  selectedProvider  = signal<AiProvider>('anthropic');
  ollamaEndpoint    = 'http://localhost:11434';
  openAiEndpoint    = '';
  openAiCustomKey   = '';
  connectionStatus  = signal<{ ok: boolean; message: string } | null>(null);

  // Image generation settings
  imageProvider: ImageProvider | '' = '';
  imageApiKey   = '';
  imageEndpoint = '';
  imageModel    = '';
  imageSize: ImageSize | '' = '';

  // Transcription settings
  transcriptionProvider: TranscriptionProvider | '' = '';
  transcriptionApiKey   = '';
  transcriptionEndpoint = '';
  transcriptionLanguage = '';

  readonly sections = [
    { id: 'editor' as SettingsSection, label: 'Editor' },
    { id: 'ai' as SettingsSection, label: 'Asistente IA' },
    { id: 'appearance' as SettingsSection, label: 'Apariencia' },
  ];

  readonly aiModels = AI_MODELS;

  readonly themes = [
    {
      id: 'dark' as const,
      label: 'Mocha (oscuro)',
      bg: '#1e1e2e',
      surface: '#181825',
      accent: '#cba6f7',
      text: '#cdd6f4',
    },
    {
      id: 'light' as const,
      label: 'Latte (claro)',
      bg: '#eff1f5',
      surface: '#e6e9ef',
      accent: '#8839ef',
      text: '#4c4f69',
    },
  ];

  ngOnInit(): void {
    const settings = this.projectService.project()?.settings;
    if (settings) {
      this.autosaveInterval = settings.autosaveInterval;
      this.maxSnapshots = settings.maxSnapshots;
      this.selectedModel = settings.aiModel;
      this.spellcheck = settings.spellcheck ?? true;
      this.selectedProvider.set(settings.aiProvider ?? 'anthropic');
      if (settings.aiProvider === 'ollama') {
        this.ollamaEndpoint = settings.aiEndpoint ?? 'http://localhost:11434';
      } else if (settings.aiProvider === 'openai-compatible') {
        this.openAiEndpoint = settings.aiEndpoint ?? '';
      }
      this.openAiCustomKey = settings.aiApiKey ?? '';
      this.imageProvider = settings.imageProvider ?? '';
      this.imageApiKey   = settings.imageApiKey   ?? '';
      this.imageEndpoint = settings.imageEndpoint ?? '';
      this.imageModel    = settings.imageModel    ?? '';
      this.imageSize     = settings.imageSize     ?? '';
      this.transcriptionProvider = settings.transcriptionProvider ?? '';
      this.transcriptionApiKey   = settings.transcriptionApiKey   ?? '';
      this.transcriptionEndpoint = settings.transcriptionEndpoint ?? '';
      this.transcriptionLanguage = settings.transcriptionLanguage ?? '';
    }
  }

  async saveEditorSettings(): Promise<void> {
    await this.projectService.updateSettings({
      autosaveInterval: this.autosaveInterval,
      maxSnapshots: this.maxSnapshots,
      spellcheck: this.spellcheck,
    });
    this.closed.emit();
  }

  saveAiSettings(): void {
    if (this.apiKeyInput.trim()) {
      this.aiService.saveApiKey(this.apiKeyInput);
    }

    const provider = this.selectedProvider();
    const endpoint = provider === 'ollama'
      ? this.ollamaEndpoint
      : this.openAiEndpoint;

    if (this.projectService.isLoaded()) {
      this.projectService.updateSettings({
        aiModel:       this.selectedModel,
        aiProvider:    provider,
        aiEndpoint:    endpoint || undefined,
        aiApiKey:      this.openAiCustomKey || undefined,
        imageProvider: (this.imageProvider || undefined) as ImageProvider | undefined,
        imageApiKey:   this.imageApiKey   || undefined,
        imageEndpoint: this.imageEndpoint || undefined,
        imageModel:    this.imageModel    || undefined,
        imageSize:     (this.imageSize    || undefined) as ImageSize | undefined,
        transcriptionProvider: (this.transcriptionProvider || undefined) as TranscriptionProvider | undefined,
        transcriptionApiKey:   this.transcriptionApiKey   || undefined,
        transcriptionEndpoint: this.transcriptionEndpoint || undefined,
        transcriptionLanguage: this.transcriptionLanguage || undefined,
      });
    }
    this.closed.emit();
  }

  clearApiKey(): void {
    this.aiService.clearApiKey();
    this.apiKeyInput = '';
  }

  async testConnection(): Promise<void> {
    this.connectionStatus.set(null);
    const provider = this.selectedProvider();
    const endpoint = provider === 'ollama'
      ? this.ollamaEndpoint
      : this.openAiEndpoint;

    if (!endpoint.trim()) {
      this.connectionStatus.set({ ok: false, message: 'Introduce una URL primero.' });
      return;
    }

    try {
      const base = endpoint.replace(/\/$/, '');
      const url  = provider === 'ollama'
        ? `${base}/api/tags`
        : `${base}/v1/models`;

      const headers: Record<string, string> = {};
      if (this.openAiCustomKey) {
        headers['Authorization'] = `Bearer ${this.openAiCustomKey}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        this.connectionStatus.set({ ok: true, message: 'Conexión exitosa.' });
      } else {
        this.connectionStatus.set({
          ok:      false,
          message: `El servidor respondió con error ${response.status}.`,
        });
      }
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : '';
      this.connectionStatus.set({
        ok:      false,
        message: name === 'AbortError'
          ? 'Tiempo de espera agotado. ¿Está el servidor en marcha?'
          : 'Sin respuesta del servidor. ¿Es correcta la URL?',
      });
    }
  }

  backup(): void {
    this.closed.emit();
    setTimeout(() => this.backupService.createBackup(), 100);
  }
}
