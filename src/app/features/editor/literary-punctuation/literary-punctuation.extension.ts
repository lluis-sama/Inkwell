import { Extension } from '@tiptap/core';
import { matchesTrigger, insertSmartQuote, insertEmDash } from './literary-punctuation.helpers';
import type { LiteraryPunctuationConfig } from './literary-punctuation.types';

export interface LiteraryPunctuationExtensionOptions {
  config: LiteraryPunctuationConfig;
}

export const LiteraryPunctuationExtension =
  Extension.create<LiteraryPunctuationExtensionOptions>({
    name: 'literaryPunctuation',

    onCreate() {
      const handler = (event: KeyboardEvent) => {
        if (!this.options.config.enabled) return;

        const { quoteShortcut, dashShortcut } = this.options.config;

        if (matchesTrigger(event, quoteShortcut)) {
          event.preventDefault();
          event.stopPropagation();
          insertSmartQuote(this.editor);
          return;
        }

        if (matchesTrigger(event, dashShortcut)) {
          event.preventDefault();
          event.stopPropagation();
          insertEmDash(this.editor);
        }
      };

      this.editor.view.dom.addEventListener('keydown', handler);
      (this as any)._literaryHandler = handler;
    },

    onDestroy() {
      const handler = (this as any)._literaryHandler;
      if (handler) {
        this.editor.view.dom.removeEventListener('keydown', handler);
      }
    },
  });
