import { AppSettings, DEFAULT_APP_SETTINGS } from './app-settings.model';

export interface RecentProject {
  name:     string;
  basePath: string;
  openedAt: string; // ISO
}

export interface AppConfig {
  version:        number;
  apiKey:         string;
  theme:          'light' | 'dark';
  lang:           'es' | 'en';
  appSettings:    AppSettings;
  recentProjects: RecentProject[];
  ltPromptShown:  boolean;
  ltEnabled:      boolean;
  ltDisabledRules: string[];
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  version:        1,
  apiKey:         '',
  theme:          'dark',
  lang:           'es',
  appSettings:    DEFAULT_APP_SETTINGS,
  recentProjects: [],
  ltPromptShown:  false,
  ltEnabled:      false,
  ltDisabledRules: [],
};
