import { Component, computed, inject, input } from '@angular/core';
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
  templateUrl: './editor-toolbar.component.html',
  styles: [
    `
      :host {
        display: block;
      }

      .toolbar-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
        padding: 0 4px;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: var(--ink-subtle);
        cursor: pointer;
        transition:
          color 0.15s,
          background-color 0.15s;
      }
      .toolbar-btn:hover {
        color: var(--ink-text);
        background: var(--ink-border);
      }
      .toolbar-btn.active {
        color: var(--ink-accent);
        background: var(--ink-border);
      }

      .toolbar-sep {
        width: 1px;
        height: 18px;
        background: var(--ink-border);
        margin: 0 4px;
      }
    `,
  ],
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
