import { DestroyRef, inject, signal, Signal } from '@angular/core';

export function prefersReducedMotion(): Signal<boolean> {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const value = signal(mediaQuery.matches);

  const listener = (event: MediaQueryListEvent) => {
    value.set(event.matches);
  };

  mediaQuery.addEventListener('change', listener);

  inject(DestroyRef).onDestroy(() => {
    mediaQuery.removeEventListener('change', listener);
  });

  return value.asReadonly();
}
