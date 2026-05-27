import { Injectable, inject, computed } from '@angular/core';
import {
  AppSettings,
  DeskPosition,
  UiFontScale,
} from '../models/app-settings.model';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private appConfig = inject(AppConfigService);

  readonly settings = computed(() => this.appConfig.config().appSettings);

  async setEditorFontFamily(fontFamily: string): Promise<void> {
    await this.appConfig.setAppSettings({
      ...this.settings(),
      editor: { ...this.settings().editor, fontFamily },
    });
  }

  async setEditorFontSize(fontSize: number): Promise<void> {
    const clamped = Math.min(Math.max(fontSize, 12), 32);
    await this.appConfig.setAppSettings({
      ...this.settings(),
      editor: { ...this.settings().editor, fontSize: clamped },
    });
  }

  async setUiFontScale(uiFontScale: UiFontScale): Promise<void> {
    await this.appConfig.setAppSettings({
      ...this.settings(),
      appearance: { ...this.settings().appearance, uiFontScale },
    });
  }

  async setAiPanelWidth(width: number): Promise<void> {
    const clamped = Math.min(Math.max(width, 240), 600);
    await this.appConfig.setAppSettings({
      ...this.settings(),
      aiPanel: { width: clamped },
    });
  }

  async setDeskPosition(position: DeskPosition): Promise<void> {
    await this.appConfig.setAppSettings({
      ...this.settings(),
      deskPanel: { ...this.settings().deskPanel, position },
    });
  }

  async setDeskBottomHeight(height: number): Promise<void> {
    const max = Math.floor(window.innerHeight * 0.70);
    const clamped = Math.min(Math.max(height, 150), max);
    await this.appConfig.setAppSettings({
      ...this.settings(),
      deskPanel: { ...this.settings().deskPanel, bottomHeight: clamped },
    });
  }

  async setDeskSideWidth(width: number): Promise<void> {
    const max = Math.floor(window.innerWidth * 0.60);
    const clamped = Math.min(Math.max(width, 240), max);
    await this.appConfig.setAppSettings({
      ...this.settings(),
      deskPanel: { ...this.settings().deskPanel, sideWidth: clamped },
    });
  }
}
