import { Component, computed, inject, signal, OnInit, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { fetch } from '@tauri-apps/plugin-http';
import { AiService } from '../../core/services/ai.service';
import { BackupService } from '../../core/services/backup.service';
import { ProjectService } from '../../core/services/project.service';
import { SettingsService } from '../../core/services/settings.service';
import { ThemeService } from '../../core/services/theme.service';
import { AiProvider, ImageProvider, ImageSize, TranscriptionProvider } from '../../core/models/project.model';
import { UiFontScale } from '../../core/models/app-settings.model';
import { InkModalComponent } from './ink-modal.component';
import { InkButtonComponent } from './ink-button.component';
import { TranslocoPipe } from '@jsverse/transloco';

type SettingsSection = 'editor' | 'ai' | 'appearance';

const AI_MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (recomendado)' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4 (más capaz, más lento)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (más rápido)' },
];

@Component({
  selector: 'ink-settings-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule, TranslocoPipe],
  templateUrl: './ink-settings-modal.component.html',
  styleUrl: './ink-settings-modal.component.css',
})
export class InkSettingsModalComponent implements OnInit {
  aiService = inject(AiService);
  private backupService = inject(BackupService);
  projectService = inject(ProjectService);
  readonly settingsService = inject(SettingsService);
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
      label:       'SETTINGS.AI.PROVIDER_ANTHROPIC_LABEL',
      description: 'SETTINGS.AI.PROVIDER_ANTHROPIC_DESC',
    },
    {
      id:          'ollama' as AiProvider,
      label:       'SETTINGS.AI.PROVIDER_OLLAMA_LABEL',
      description: 'SETTINGS.AI.PROVIDER_OLLAMA_DESC',
    },
    {
      id:          'openai-compatible' as AiProvider,
      label:       'SETTINGS.AI.PROVIDER_LOCAL_LABEL',
      description: 'SETTINGS.AI.PROVIDER_LOCAL_DESC',
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
    { id: 'editor' as SettingsSection, label: 'SETTINGS.SECTION_EDITOR' },
    { id: 'ai' as SettingsSection, label: 'SETTINGS.SECTION_AI' },
    { id: 'appearance' as SettingsSection, label: 'SETTINGS.SECTION_APPEARANCE' },
  ];

  readonly aiModels = AI_MODELS;

  readonly themes = [
    {
      id: 'dark' as const,
      label: 'SETTINGS.APPEARANCE.THEME_DARK',
      bg: '#1e1e2e',
      surface: '#181825',
      accent: '#cba6f7',
      text: '#cdd6f4',
    },
    {
      id: 'light' as const,
      label: 'SETTINGS.APPEARANCE.THEME_LIGHT',
      bg: '#eff1f5',
      surface: '#e6e9ef',
      accent: '#8839ef',
      text: '#4c4f69',
    },
  ];

  readonly fontScaleOptions: { value: UiFontScale; label: string }[] = [
    { value: 'sm', label: 'SETTINGS.APPEARANCE.FONT_SM' },
    { value: 'md', label: 'SETTINGS.APPEARANCE.FONT_MD' },
    { value: 'lg', label: 'SETTINGS.APPEARANCE.FONT_LG' },
    { value: 'xl', label: 'SETTINGS.APPEARANCE.FONT_XL' },
  ];

  readonly currentFontScale = computed(() => this.settingsService.settings().appearance.uiFontScale);

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

  async saveAiSettings(): Promise<void> {
    if (this.apiKeyInput.trim()) {
      await this.aiService.saveApiKey(this.apiKeyInput);
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

  async clearApiKey(): Promise<void> {
    await this.aiService.clearApiKey();
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
