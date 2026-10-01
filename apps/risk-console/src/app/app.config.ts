import { type ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules, withViewTransitions } from '@angular/router';
import { provideRiskDataAccess } from '@pnc/risk/data-access';
import { routes } from './app.routes';

/** Zoneless + signals: change detection is driven by signal reads, not Zone.js patching. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules), withViewTransitions()),
    provideRiskDataAccess({ apiBaseUrl: '/api/v1' }),
    {
      provide: ErrorHandler,
      useClass: class implements ErrorHandler {
        handleError(e: unknown): void {
          console.error('[pnc] unhandled', e);
        }
      },
    },
  ],
};
