import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../core/services/theme.service';
import { ProjectService } from '../../core/services/project.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { NewProjectModalComponent } from './new-project-modal.component';
import { InkButtonComponent } from '../../shared/components/ink-button.component';

interface RecentProject {
  name: string;
  basePath: string;
  openedAt: string;
}

@Component({
  selector: 'app-project-manager',
  standalone: true,
  imports: [NewProjectModalComponent, InkButtonComponent, TranslocoPipe],
  templateUrl: './project-manager.component.html',
  styleUrl: './project-manager.component.css',
})
export class ProjectManagerComponent implements OnInit {
  theme                  = inject(ThemeService);
  readonly translocoService = inject(TranslocoService);
  private projectService = inject(ProjectService);
  private bridge         = inject(TauriBridgeService);
  private router         = inject(Router);
  private appConfig      = inject(AppConfigService);

  showNewProjectModal = signal(false);
  opening             = signal(false);
  openError           = signal<string | null>(null);
  recentProjects      = signal<RecentProject[]>([]);

  ngOnInit(): void {
    this.recentProjects.set(this.projectService.getRecentProjects());
  }

  // ─── Abrir proyecto ───────────────────────────────────────────────────────

  async openProject(): Promise<void> {
    this.openError.set(null);
    const basePath = await this.bridge.openFolderDialog();
    if (!basePath) return;

    this.opening.set(true);
    try {
      await this.projectService.openProject(basePath);
      await this.projectService.addRecentProject(
        this.projectService.project()!.name,
        basePath,
      );
      this.router.navigate(['/editor']);
    } catch {
      this.openError.set(
        this.translocoService.translate('PM.ERROR_NOT_FOUND')
      );
    } finally {
      this.opening.set(false);
    }
  }

  async openRecentProject(project: RecentProject): Promise<void> {
    this.openError.set(null);
    this.opening.set(true);
    try {
      await this.projectService.openProject(project.basePath);
      await this.projectService.addRecentProject(project.name, project.basePath);
      this.recentProjects.set(this.projectService.getRecentProjects());
      this.router.navigate(['/editor']);
    } catch {
      this.openError.set(
        this.translocoService.translate('PM.ERROR_OPEN', { name: project.name })
      );
      await this.projectService.removeRecentProject(project.basePath);
      this.recentProjects.set(this.projectService.getRecentProjects());
    } finally {
      this.opening.set(false);
    }
  }

  // ─── Nuevo proyecto ───────────────────────────────────────────────────────

  onProjectCreated(): void {
    this.showNewProjectModal.set(false);
    this.recentProjects.set(this.projectService.getRecentProjects());
    this.router.navigate(['/editor']);
  }

  // ─── Recientes ────────────────────────────────────────────────────────────

  async removeFromRecents(event: MouseEvent, basePath: string): Promise<void> {
    event.stopPropagation();
    await this.projectService.removeRecentProject(basePath);
    this.recentProjects.set(this.projectService.getRecentProjects());
  }

  // ─── Utils ────────────────────────────────────────────────────────────────

  formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now  = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const locale = this.translocoService.getActiveLang() === 'es' ? 'es-ES' : 'en-US';

    if (days === 0) return this.translocoService.translate('PM.DATE_TODAY');
    if (days === 1) return this.translocoService.translate('PM.DATE_YESTERDAY');
    if (days < 30)  return this.translocoService.translate('PM.DATE_DAYS_AGO', { count: days });
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }

  async toggleLanguage(): Promise<void> {
    const next = this.translocoService.getActiveLang() === 'es' ? 'en' : 'es';
    this.translocoService.setActiveLang(next);
    await this.appConfig.setLang(next);
  }
}
