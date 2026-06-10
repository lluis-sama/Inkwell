import { Injectable, inject, signal } from '@angular/core';
import { AppConfigService } from '../../../core/services/app-config.service';
import {
  getLiteraryPunctuationDefaults,
  type LiteraryPunctuationConfig,
  type LiteraryShortcutTrigger,
} from './literary-punctuation.types';

@Injectable({ providedIn: 'root' })
export class LiteraryPunctuationSettingsService {
  private readonly appConfig = inject(AppConfigService);

  private readonly _config = signal<LiteraryPunctuationConfig>(
    getLiteraryPunctuationDefaults()
  );

  readonly config = this._config.asReadonly();

  /** Se incrementa cuando cambian los atajos. El layout del editor observa esto para recrear el editor. */
  readonly needsRebuild = signal(0);

  /** Carga la config desde el almacén de settings de la app al arrancar */
  load(stored: Partial<LiteraryPunctuationConfig>): void {
    this._config.set({ ...getLiteraryPunctuationDefaults(), ...stored });
  }

  update(patch: Partial<LiteraryPunctuationConfig>): void {
    this._config.update(current => ({ ...current, ...patch }));
    // persistir en el almacén de settings de Inkwell
    this.appConfig.setLiteraryPunctuation(this._config());
    if ('enabled' in patch) {
      this.needsRebuild.update(v => v + 1);
    }
  }

  updateShortcut(
    key: 'quoteShortcut' | 'dashShortcut',
    trigger: Partial<LiteraryShortcutTrigger>
  ): void {
    this._config.update(current => ({
      ...current,
      [key]: { ...current[key], ...trigger },
    }));
    // persistir
    this.appConfig.setLiteraryPunctuation(this._config());
    // Notificar al layout del editor que debe recrear el editor
    this.needsRebuild.update(v => v + 1);
  }
}
