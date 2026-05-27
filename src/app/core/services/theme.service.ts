import { Injectable, inject, computed, effect } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { SettingsService } from './settings.service';
import { UiFontScale } from '../models/app-settings.model';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private appConfig       = inject(AppConfigService);
  private settingsService = inject(SettingsService);

  readonly theme = computed(() => this.appConfig.config().theme as Theme);

  private readonly FONT_SCALE_MAP: Record<UiFontScale, string> = {
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '20px',
  };

  constructor() {
    // Aplica el tema al DOM cuando cambia el config
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
    });

    // Aplica la escala de fuente cuando cambia
    effect(() => {
      this.applyFontScale(this.settingsService.settings().appearance.uiFontScale);
    });
  }

  private applyFontScale(scale: UiFontScale): void {
    document.documentElement.style.fontSize = this.FONT_SCALE_MAP[scale];
  }

  async toggle(): Promise<void> {
    await this.appConfig.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  async setTheme(theme: Theme): Promise<void> {
    await this.appConfig.setTheme(theme);
  }
}
