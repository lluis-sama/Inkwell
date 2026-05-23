import { Injectable, signal } from '@angular/core';
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  DeskPosition,
  UiFontScale,
} from '../models/app-settings.model';

const STORAGE_KEY = 'inkwell-app-settings';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<AppSettings>(this.loadSettings());

  private loadSettings(): AppSettings {
    let stored: Partial<AppSettings> | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        stored = JSON.parse(raw) as Partial<AppSettings>;
      }
    } catch {
      // Corrupted storage — fall back to defaults
    }

    return {
      ...DEFAULT_APP_SETTINGS,
      ...stored,
      editor: { ...DEFAULT_APP_SETTINGS.editor, ...stored?.editor },
      appearance: { ...DEFAULT_APP_SETTINGS.appearance, ...stored?.appearance },
      aiPanel: { ...DEFAULT_APP_SETTINGS.aiPanel, ...stored?.aiPanel },
      deskPanel: { ...DEFAULT_APP_SETTINGS.deskPanel, ...stored?.deskPanel },
    };
  }

  private updateSettings(partial: Partial<AppSettings>): void {
    const current = this.settings();
    const next: AppSettings = { ...current, ...partial };
    this.settings.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  setEditorFontFamily(fontFamily: string): void {
    this.updateSettings({ editor: { ...this.settings().editor, fontFamily } });
  }

  setEditorFontSize(fontSize: number): void {
    const clamped = Math.min(Math.max(fontSize, 12), 32);
    this.updateSettings({ editor: { ...this.settings().editor, fontSize: clamped } });
  }

  setUiFontScale(uiFontScale: UiFontScale): void {
    this.updateSettings({ appearance: { ...this.settings().appearance, uiFontScale } });
  }

  setAiPanelWidth(width: number): void {
    const clamped = Math.min(Math.max(width, 240), 600);
    this.updateSettings({ aiPanel: { width: clamped } });
  }

  setDeskPosition(position: DeskPosition): void {
    this.updateSettings({ deskPanel: { ...this.settings().deskPanel, position } });
  }

  setDeskBottomHeight(height: number): void {
    const max = Math.floor(window.innerHeight * 0.70);
    const clamped = Math.min(Math.max(height, 150), max);
    this.updateSettings({ deskPanel: { ...this.settings().deskPanel, bottomHeight: clamped } });
  }

  setDeskSideWidth(width: number): void {
    const max = Math.floor(window.innerWidth * 0.60);
    const clamped = Math.min(Math.max(width, 240), max);
    this.updateSettings({ deskPanel: { ...this.settings().deskPanel, sideWidth: clamped } });
  }
}
