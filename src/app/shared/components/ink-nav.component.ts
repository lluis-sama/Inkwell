import { Component, inject, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ThemeService } from '../../core/services/theme.service';
import { ProjectService } from '../../core/services/project.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { InkSettingsModalComponent } from './ink-settings-modal.component';
import { AuthorProfileModalComponent } from './author-profile-modal.component';
import { ShortcutsModalComponent } from './shortcuts-modal.component';
import { StatsModalComponent } from '../../features/editor/stats/stats-modal.component';
import { ConsistencyModalComponent } from '../../features/editor/consistency/consistency-modal.component';
import { ConsistencyService } from '../../core/services/consistency.service';
import { TranscriptionModalComponent } from '../../features/transcription/transcription-modal.component';
import { TranscriptionService } from '../../core/services/transcription.service';

@Component({
  selector: 'ink-nav',
  standalone: true,
  imports: [RouterLink, TranslocoPipe, InkSettingsModalComponent, AuthorProfileModalComponent, ShortcutsModalComponent, StatsModalComponent, ConsistencyModalComponent, TranscriptionModalComponent],
  templateUrl: './ink-nav.component.html',
  styleUrl: './ink-nav.component.css',
})
export class InkNavComponent {
  protected theme = inject(ThemeService);
  protected projectService = inject(ProjectService);
  private router = inject(Router);

  protected consistencySvc   = inject(ConsistencyService);
  protected transcriptionSvc = inject(TranscriptionService);
  readonly #transloco = inject(TranslocoService);
  readonly #appConfig = inject(AppConfigService);
  readonly activeLang = signal(this.#transloco.getActiveLang());

  showSettings      = signal(false);
  showAuthorProfile = signal(false);
  showShortcuts     = signal(false);
  showStats         = signal(false);
  showConsistency   = signal(false);
  showTranscription = signal(false);

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

  async toggleLang(): Promise<void> {
    const next = this.activeLang() === 'es' ? 'en' : 'es';
    this.#transloco.setActiveLang(next);
    this.activeLang.set(next);
    await this.#appConfig.setLang(next);
  }
}
