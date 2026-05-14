import { Component, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'ink-nav',
  standalone: true,
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './ink-nav.component.html',
  styles: [`
    :host { display: flex; height: 100%; }
    .nav-icon { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; color: var(--ink-subtle); transition: color 0.15s, background-color 0.15s; cursor: pointer; text-decoration: none; }
    .nav-icon:hover { color: var(--ink-text); background: var(--ink-border); }
    .nav-icon.active { color: var(--ink-accent); background: var(--ink-border); }
  `],
})
export class InkNavComponent {
  protected theme = inject(ThemeService);
  private router = inject(Router);

  isRoute(path: string): boolean {
    return this.router.url.startsWith(path);
  }
}
