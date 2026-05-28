import { Injectable, inject, signal, computed } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { AppConfigService } from './app-config.service';
import { ProjectService } from './project.service';

export type LtInstallState =
  | 'not-installed'
  | 'downloading'
  | 'ready'
  | 'error';

export interface LtProgress {
  phase: 'jre' | 'lt';
  percent: number;
  message: string;
}

/**
 * Mapa de códigos de idioma del perfil de autor a códigos LanguageTool.
 * LanguageTool usa códigos como ca-ES, pt-PT, etc.
 */
const AUTHOR_LANG_TO_LT: Record<string, string> = {
  es: 'es',
  en: 'en',
  ca: 'ca-ES',
  gl: 'gl',
  eu: 'eu',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'pt-PT',
};

@Injectable({ providedIn: 'root' })
export class LanguageToolService {
  private readonly bridge = inject(TauriBridgeService);
  private readonly appConfig = inject(AppConfigService);
  private readonly projectService = inject(ProjectService);

  readonly installState = signal<LtInstallState>('not-installed');
  readonly serverReady = signal(false);
  readonly progress = signal<LtProgress | null>(null);

  readonly apiUrl = 'http://localhost:8081/v2/check';

  /**
   * Idioma resuelto que se enviará a LanguageTool.
   * Cadena de fallback:
   *   1. Preferencia explícita del usuario (ltLanguage)
   *   2. Idioma del perfil de autor del proyecto
   *   3. Idioma de la interfaz de usuario (appConfig.lang)
   *   4. 'es' como último recurso
   */
  readonly resolvedLanguage = computed(() => {
    // 1. Preferencia explícita del usuario
    const userLang = this.appConfig.config().ltLanguage;
    if (userLang) return userLang;

    // 2. Idioma del perfil de autor del proyecto
    const authorLang = this.projectService.project()?.authorProfile?.language;
    if (authorLang) {
      const mapped = AUTHOR_LANG_TO_LT[authorLang];
      if (mapped) return mapped;
    }

    // 3. Idioma de la interfaz de usuario
    const uiLang = this.appConfig.config().lang;
    if (uiLang) {
      const mapped = AUTHOR_LANG_TO_LT[uiLang];
      if (mapped) return mapped;
    }

    // 4. Fallback final
    return 'es';
  });

  private _unlisteners: Array<() => void> = [];

  async initialize(autoStart = false): Promise<void> {
    const installed = await this.bridge.ltIsInstalled();
    if (!installed) {
      this.installState.set('not-installed');
      return;
    }

    this.installState.set('ready');

    if (autoStart) {
      try {
        await this.bridge.ltStartServer();
      } catch {
        // puede fallar si ya está corriendo — OK
      }

      this.installState.set('downloading'); // reutilizamos como "iniciando"
      await this.waitForServer();
      if (this.installState() !== 'error') {
        this.installState.set('ready');
        this.serverReady.set(true);
      }
    }
  }

  async install(): Promise<void> {
    // Limpiar listeners anteriores para evitar duplicados en caso de reintento
    this._unlisteners.forEach(fn => fn());
    this._unlisteners = [];

    this.installState.set('downloading');
    this.progress.set(null);

    const unlistenProgress = await this.bridge.ltOnProgress((payload) => {
      this.progress.set(payload as LtProgress);
    });
    this._unlisteners.push(unlistenProgress);

    const unlistenComplete = await this.bridge.ltOnInstallComplete(async () => {
      try {
        await this.bridge.ltStartServer();
        await this.waitForServer();
        if (this.installState() !== 'error') {
          this.installState.set('ready');
          this.serverReady.set(true);
        }
        this.progress.set(null);
      } catch {
        this.installState.set('error');
      }
    });
    this._unlisteners.push(unlistenComplete);

    try {
      await this.bridge.ltDownloadAndInstall();
    } catch {
      this.installState.set('error');
    }
  }

  async stopServer(): Promise<void> {
    await this.bridge.ltStopServer();
    this.serverReady.set(false);
  }

  async startServer(): Promise<void> {
    await this.bridge.ltStartServer();
    await this.waitForServer();
    if (this.installState() !== 'error') {
      this.installState.set('ready');
      this.serverReady.set(true);
    }
  }

  async uninstall(): Promise<void> {
    this._unlisteners.forEach(fn => fn());
    this._unlisteners = [];
    await this.bridge.ltUninstall();
    this.installState.set('not-installed');
    this.serverReady.set(false);
    this.progress.set(null);
  }

  private async waitForServer(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const ready = await this.bridge.ltServerReady();
      if (ready) return;
      await new Promise<void>(r => setTimeout(r, 1000));
    }
    this.installState.set('error');
  }
}
