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

export interface AppSettings {
  editor: EditorSettings;
  appearance: AppearanceSettings;
  aiPanel: AiPanelSettings;
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
};
