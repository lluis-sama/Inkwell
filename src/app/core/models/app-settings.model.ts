import type { LiteraryPunctuationConfig } from '../../features/editor/literary-punctuation/literary-punctuation.types';

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
}

export type UiFontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface AppearanceSettings {
  theme: 'light' | 'dark';
  uiFontScale: UiFontScale;
}

export interface AiPanelSettings {
  width: number;
}

export type DeskPosition = 'bottom' | 'left' | 'right' | 'closed';

export interface DeskPanelSettings {
  position: DeskPosition;
  bottomHeight: number;
  sideWidth: number;
}

export interface AppSettings {
  editor: EditorSettings;
  appearance: AppearanceSettings;
  aiPanel: AiPanelSettings;
  deskPanel: DeskPanelSettings;
  literaryPunctuation?: Partial<LiteraryPunctuationConfig>;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  editor: {
    fontFamily: 'Georgia, serif',
    fontSize: 18,
  },
  appearance: {
    theme: 'dark',
    uiFontScale: 'md',
  },
  aiPanel: {
    width: 320,
  },
  deskPanel: {
    position: 'closed',
    bottomHeight: 300,
    sideWidth: 320,
  },
  literaryPunctuation: undefined,
};
