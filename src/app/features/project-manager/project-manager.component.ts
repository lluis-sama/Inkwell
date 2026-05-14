import { Component, inject } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-project-manager',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center h-screen bg-ink-bg gap-6">
      <h1 class="text-ink-text text-3xl font-serif tracking-wide">Inkwell</h1>
      <p class="text-ink-subtle text-sm">Tu entorno de escritura</p>
      <button
        (click)="theme.toggle()"
        class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm
               border border-ink-border hover:border-ink-accent transition-colors">
        Tema: {{ theme.theme() }}
      </button>
    </div>
  `,
})
export class ProjectManagerComponent {
  theme = inject(ThemeService);
}
