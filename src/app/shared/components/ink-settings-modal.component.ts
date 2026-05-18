import { Component, inject, signal, OnInit, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../core/services/ai.service';
import { BackupService } from '../../core/services/backup.service';
import { ProjectService } from '../../core/services/project.service';
import { ThemeService } from '../../core/services/theme.service';
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
    if (this.projectService.isLoaded()) {
      this.projectService.updateSettings({ aiModel: this.selectedModel });
    }
    this.closed.emit();
  }

  clearApiKey(): void {
    this.aiService.clearApiKey();
    this.apiKeyInput = '';
  }

  backup(): void {
    this.closed.emit();
    setTimeout(() => this.backupService.createBackup(), 100);
  }
}
