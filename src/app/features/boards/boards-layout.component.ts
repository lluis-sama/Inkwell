import { Component, inject } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-boards-layout',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center h-screen bg-ink-bg gap-6">
      <h1 class="text-ink-text text-3xl font-serif tracking-wide">Boards</h1>
      <p class="text-ink-subtle text-sm">Boards Layout — coming in INK-07</p>
      <button
        (click)="theme.toggle()"
        class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm
               border border-ink-border hover:border-ink-accent transition-colors">
        Tema: {{ theme.theme() }}
      </button>
    </div>
  `,
})
export class BoardsLayoutComponent {
  theme = inject(ThemeService);
}
