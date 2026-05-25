import { Injectable, inject, signal } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { AppConfig, DEFAULT_APP_CONFIG, RecentProject } from '../models/app-config.model';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../models/app-settings.model';

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private bridge = inject(TauriBridgeService);

  readonly config = signal<AppConfig>({ ...DEFAULT_APP_CONFIG });

  async load(): Promise<void> {
    try {
      const raw = await this.bridge.readAppConfig();

      if (raw) {
        // config.json existe — parsear y fusionar con defaults
        const stored = JSON.parse(raw) as Partial<AppConfig>;
        this.config.set(this.mergeWithDefaults(stored));
      } else {
        // Primer arranque o fichero no existe — migrar desde localStorage
        const migrated = this.migrateFromLocalStorage();
        this.config.set(migrated);
        // Persistir inmediatamente para que las próximas sesiones lean desde el fichero
        await this.persist();
        // Limpiar localStorage tras migración exitosa
        this.clearLocalStorage();
      }
    } catch {
      // Error de parseo o I/O — arrancar con defaults, no bloquear la app
      this.config.set({ ...DEFAULT_APP_CONFIG });
    }
  }

  // ─── Métodos de escritura ─────────────────────────────────────────────────

  async setApiKey(key: string): Promise<void> {
    this.config.update(c => ({ ...c, apiKey: key.trim() }));
    await this.persist();
  }

  async clearApiKey(): Promise<void> {
    this.config.update(c => ({ ...c, apiKey: '' }));
    await this.persist();
  }

  async setTheme(theme: 'light' | 'dark'): Promise<void> {
    this.config.update(c => ({
      ...c,
      theme,
      appSettings: {
        ...c.appSettings,
        appearance: { ...c.appSettings.appearance, theme },
      },
    }));
    await this.persist();
  }

  async setLang(lang: 'es' | 'en'): Promise<void> {
    this.config.update(c => ({ ...c, lang }));
    await this.persist();
    // Mantener localStorage como cache rápida para el bootstrap de Transloco
    localStorage.setItem('inkwell-lang', lang);
  }

  async setAppSettings(settings: AppSettings): Promise<void> {
    this.config.update(c => ({ ...c, appSettings: settings }));
    await this.persist();
  }

  async addRecentProject(name: string, basePath: string): Promise<void> {
    this.config.update(c => {
      const recent = c.recentProjects
        .filter(p => p.basePath !== basePath)
        .slice(0, 9);
      recent.unshift({ name, basePath, openedAt: new Date().toISOString() });
      return { ...c, recentProjects: recent };
    });
    await this.persist();
  }

  async removeRecentProject(basePath: string): Promise<void> {
    this.config.update(c => ({
      ...c,
      recentProjects: c.recentProjects.filter(p => p.basePath !== basePath),
    }));
    await this.persist();
  }

  getRecentProjects(): RecentProject[] {
    return this.config().recentProjects;
  }

  // ─── Persistencia ─────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    await this.bridge.writeAppConfig(JSON.stringify(this.config(), null, 2));
  }

  // ─── Migración desde localStorage ────────────────────────────────────────

  private migrateFromLocalStorage(): AppConfig {
    const config: AppConfig = { ...DEFAULT_APP_CONFIG };

    // API key
    const apiKey = localStorage.getItem('inkwell-api-key');
    if (apiKey) config.apiKey = apiKey.trim();

    // Idioma
    const lang = localStorage.getItem('inkwell-lang');
    if (lang === 'es' || lang === 'en') config.lang = lang;

    // Tema (inkwell-theme tiene prioridad sobre appearance.theme dentro de appSettings)
    const theme = localStorage.getItem('inkwell-theme') as 'light' | 'dark' | null;

    // AppSettings
    try {
      const raw = localStorage.getItem('inkwell-app-settings');
      if (raw) {
        const stored = JSON.parse(raw) as Partial<AppSettings>;
        config.appSettings = {
          ...DEFAULT_APP_SETTINGS,
          ...stored,
          editor:     { ...DEFAULT_APP_SETTINGS.editor,     ...stored.editor },
          appearance: { ...DEFAULT_APP_SETTINGS.appearance, ...stored.appearance },
          aiPanel:    { ...DEFAULT_APP_SETTINGS.aiPanel,    ...stored.aiPanel },
          deskPanel:  { ...DEFAULT_APP_SETTINGS.deskPanel,  ...stored.deskPanel },
        };
      }
    } catch { /* ignorar */ }

    // Aplicar tema (fuente de verdad: inkwell-theme o appearance.theme)
    const resolvedTheme = (theme === 'light' || theme === 'dark')
      ? theme
      : (config.appSettings.appearance.theme ?? DEFAULT_APP_CONFIG.theme);
    config.theme = resolvedTheme;
    config.appSettings = {
      ...config.appSettings,
      appearance: { ...config.appSettings.appearance, theme: resolvedTheme },
    };

    // Proyectos recientes
    try {
      const raw = localStorage.getItem('inkwell-recent-projects');
      if (raw) {
        config.recentProjects = JSON.parse(raw) as RecentProject[];
      }
    } catch { /* ignorar */ }

    return config;
  }

  private clearLocalStorage(): void {
    localStorage.removeItem('inkwell-api-key');
    localStorage.removeItem('inkwell-app-settings');
    localStorage.removeItem('inkwell-theme');
    localStorage.removeItem('inkwell-recent-projects');
    // inkwell-lang se mantiene como cache rápida para el bootstrap de Transloco
  }

  // ─── Fusión con defaults ──────────────────────────────────────────────────

  private mergeWithDefaults(stored: Partial<AppConfig>): AppConfig {
    const appSettings: AppSettings = stored.appSettings
      ? {
          ...DEFAULT_APP_SETTINGS,
          ...stored.appSettings,
          editor:     { ...DEFAULT_APP_SETTINGS.editor,     ...stored.appSettings.editor },
          appearance: { ...DEFAULT_APP_SETTINGS.appearance, ...stored.appSettings.appearance },
          aiPanel:    { ...DEFAULT_APP_SETTINGS.aiPanel,    ...stored.appSettings.aiPanel },
          deskPanel:  { ...DEFAULT_APP_SETTINGS.deskPanel,  ...stored.appSettings.deskPanel },
        }
      : DEFAULT_APP_SETTINGS;

    return {
      version:        stored.version        ?? DEFAULT_APP_CONFIG.version,
      apiKey:         stored.apiKey         ?? DEFAULT_APP_CONFIG.apiKey,
      theme:          stored.theme          ?? DEFAULT_APP_CONFIG.theme,
      lang:           stored.lang           ?? DEFAULT_APP_CONFIG.lang,
      appSettings,
      recentProjects: stored.recentProjects ?? DEFAULT_APP_CONFIG.recentProjects,
    };
  }
}
