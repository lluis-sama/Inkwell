import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Editor } from '@tiptap/core';
import { SettingsService } from '../../../core/services/settings.service';

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
  imports: [TranslocoPipe],
  templateUrl: './editor-toolbar.component.html',
  styleUrl: './editor-toolbar.component.css',
})
export class EditorToolbarComponent {
  editor = input<Editor | null>(null);

  private readonly settingsService = inject(SettingsService);

  readonly fontOptions = EDITOR_FONT_OPTIONS;

  readonly editorFontFamily = computed(() => this.settingsService.settings().editor.fontFamily);
  readonly editorFontSize   = computed(() => this.settingsService.settings().editor.fontSize);

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
}
