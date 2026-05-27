import { Injectable, inject, signal } from '@angular/core';
import { TauriBridgeService, UpdateInfo } from './tauri-bridge.service';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly bridge = inject(TauriBridgeService);

  readonly updateInfo = signal<UpdateInfo | null>(null);
  readonly checked = signal(false);

  async checkOnce(): Promise<void> {
    if (this.checked()) return;
    this.checked.set(true);

    try {
      const info = await this.bridge.checkForUpdate();
      if (info) {
        this.updateInfo.set(info);
      }
    } catch {
      // fallo silencioso — no interrumpir el arranque
    }
  }

  dismiss(): void {
    this.updateInfo.set(null);
  }

  async openReleasesPage(): Promise<void> {
    const info = this.updateInfo();
    if (!info) return;
    try {
      await this.bridge.openReleasesPage(info.url);
    } catch {
      // silencioso
    }
    this.dismiss();
  }
}
