import { Component, inject, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../core/services/theme.service';
import { ProjectService } from '../../core/services/project.service';
import { InkSettingsModalComponent } from './ink-settings-modal.component';
import { AuthorProfileModalComponent } from './author-profile-modal.component';
import { ShortcutsModalComponent } from './shortcuts-modal.component';
import { StatsModalComponent } from '../../features/editor/stats/stats-modal.component';

@Component({
  selector: 'ink-nav',
  standalone: true,
  imports: [RouterLink, TranslocoPipe, InkSettingsModalComponent, AuthorProfileModalComponent, ShortcutsModalComponent, StatsModalComponent],
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
  protected projectService = inject(ProjectService);
  private router = inject(Router);

  showSettings = signal(false);
  showAuthorProfile = signal(false);
  showShortcuts = signal(false);
  showStats = signal(false);

  isRoute(path: string): boolean {
    return this.router.url.startsWith(path);
  }

  closeProject(): void {
    this.projectService.closeProject();
    this.router.navigate(['/']);
  }

  closeAuthorProfile(): void {
    this.showAuthorProfile.set(false);
  }
}
