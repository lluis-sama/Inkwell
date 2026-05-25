import { ApplicationConfig, APP_INITIALIZER, inject } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideTransloco } from '@jsverse/transloco';
import { TranslocoService } from '@jsverse/transloco';

import { routes } from './app.routes';
import { TranslocoHttpLoader } from './core/services/transloco-http.loader';
import { AppConfigService } from './core/services/app-config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimationsAsync(),
    provideTransloco({
      config: {
        availableLangs: ['es', 'en'],
        // Cache rápida para bootstrap síncrono. APP_INITIALIZER corregirá el idioma
        // si config.json tiene un valor diferente al que había en localStorage.
        defaultLang: localStorage.getItem('inkwell-lang') ?? 'es',
        reRenderOnLangChange: true,
        prodMode: false,
      },
      loader: TranslocoHttpLoader,
    }),
    {
      provide:    APP_INITIALIZER,
      useFactory: () => {
        const appConfig   = inject(AppConfigService);
        const transloco   = inject(TranslocoService);
        return async () => {
          await appConfig.load();
          const lang = appConfig.config().lang;
          if (lang !== transloco.getActiveLang()) {
            transloco.setActiveLang(lang);
          }
        };
      },
      multi: true,
    },
  ],
};
