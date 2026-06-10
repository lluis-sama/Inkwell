import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Editor } from '@tiptap/core';
import { SettingsService } from '../../../core/services/settings.service';
import { LanguageToolService } from '../../../core/services/language-tool.service';
import { LiteraryPunctuationSettingsService } from '../literary-punctuation/literary-punctuation-settings.service';
import { formatShortcutLabel } from '../literary-punctuation/literary-punctuation.helpers';
import { LtStatusIndicatorComponent } from '../../../shared/components/lt-status-indicator/lt-status-indicator.component';
import { LtInstallModalComponent } from '../../../shared/components/lt-install-modal/lt-install-modal.component';
import { InkModalComponent } from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';

export interface FontOption {
  label: string;
  value: string;
}

export const EDITOR_FONT_OPTIONS: FontOption[] = [
  { label: 'Georgia',         value: 'Georgia, serif' },
  { label: 'Palatino',        value: '"Palatino Linotype", Palatino, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Inter',           value: '"Inter", system-ui, sans-serif' },
  { label: 'Helvetica',       value: '"Helvetica Neue", Arial, sans-serif' },
  { label: 'Courier Prime',   value: '"Courier New", Courier, monospace' },
];

@Component({
  selector: 'app-editor-toolbar',
  standalone: true,
  imports: [
    TranslocoPipe,
    LtStatusIndicatorComponent,
    LtInstallModalComponent,
    InkModalComponent,
    InkButtonComponent,
  ],
  templateUrl: './editor-toolbar.component.html',
  styleUrl: './editor-toolbar.component.css',
})
export class EditorToolbarComponent {
  editor = input<Editor | null>(null);

  private readonly settingsService = inject(SettingsService);
  readonly ltService = inject(LanguageToolService);
  private readonly literarySettings = inject(LiteraryPunctuationSettingsService);

  readonly fontOptions = EDITOR_FONT_OPTIONS;

  readonly editorFontFamily = computed(() => this.settingsService.settings().editor.fontFamily);
  readonly editorFontSize   = computed(() => this.settingsService.settings().editor.fontSize);

  readonly literaryEnabled = computed(() => this.literarySettings.config().enabled);

  readonly literaryTooltip = computed(() => {
    const config = this.literarySettings.config();
    const label = formatShortcutLabel(config.quoteShortcut);
    const state = config.enabled ? 'Activada' : 'Desactivada';
    return `Puntuación literaria española (${label})\n${state}`;
  });

  readonly showLtInstallModal = signal(false);
  readonly showLtRunningModal = signal(false);
  readonly showLtStoppedModal = signal(false);

  toggleLiterary(): void {
    this.literarySettings.update({ enabled: !this.literaryEnabled() });
  }

  toggleHeading(level: number): void {
    this.editor()?.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
  }

  isHeadingActive(level: number): boolean {
    return this.editor()?.isActive('heading', { level }) ?? false;
  }

  setFontFamily(value: string): void {
    this.settingsService.setEditorFontFamily(value);
  }

  incrementFontSize(): void {
    this.settingsService.setEditorFontSize(this.editorFontSize() + 1);
  }

  decrementFontSize(): void {
    this.settingsService.setEditorFontSize(this.editorFontSize() - 1);
  }

  onLtIndicatorClicked(state: string): void {
    if (state === 'running') {
      this.showLtRunningModal.set(true);
    } else if (state === 'not-installed' || state === 'error') {
      this.showLtInstallModal.set(true);
    } else if (state === 'stopped') {
      this.showLtStoppedModal.set(true);
    }
  }

  stopLt(): void {
    this.ltService.stopServer();
    this.showLtRunningModal.set(false);
  }

  startLt(): void {
    this.ltService.startServer();
    this.showLtStoppedModal.set(false);
  }
}
