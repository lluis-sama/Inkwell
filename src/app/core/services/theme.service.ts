import { Injectable, signal, effect, inject } from '@angular/core';
import { SettingsService } from './settings.service';
import { UiFontScale } from '../models/app-settings.model';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly settingsService = inject(SettingsService);

  readonly theme = signal<Theme>(this.getInitialTheme());

  private readonly FONT_SCALE_MAP: Record<UiFontScale, string> = {
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '20px',
  };

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
      localStorage.setItem('inkwell-theme', this.theme());
    });

    effect(() => {
      this.applyFontScale(this.settingsService.settings().appearance.uiFontScale);
    });
  }

  private applyFontScale(scale: UiFontScale): void {
    document.documentElement.style.fontSize = this.FONT_SCALE_MAP[scale];
  }

  toggle(): void {
    this.theme.update(t => t === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
  }

  private getInitialTheme(): Theme {
    const stored = localStorage.getItem('inkwell-theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
