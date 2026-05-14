import { Component, inject, signal, computed, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import { InkModalComponent } from '../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../shared/components/ink-button.component';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { ProjectService } from '../../core/services/project.service';
import slugify from 'slugify';

@Component({
  selector: 'app-new-project-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule, TranslocoPipe],
  templateUrl: './new-project-modal.component.html',
})
export class NewProjectModalComponent {
  private bridge  = inject(TauriBridgeService);
  private projectService = inject(ProjectService);
  readonly translocoService = inject(TranslocoService);

  created   = output<void>();
  cancelled = output<void>();

  name        = signal('');
  description = '';
  folderPath  = signal<string | null>(null);
  creating    = signal(false);
  error       = signal<string | null>(null);

  readonly projectSlug = computed(() =>
    slugify(this.name(), { lower: true, strict: true, locale: 'es' }),
  );

  readonly fullPath = computed(() => {
    const base = this.folderPath();
    const slug = this.projectSlug();
    if (!base || !slug) return null;
    return `${base}/${slug}`;
  });

  canCreate(): boolean {
    return this.name().trim().length > 0 && this.folderPath() !== null;
  }

  async selectFolder(): Promise<void> {
    const path = await this.bridge.selectNewProjectFolder();
    if (path) this.folderPath.set(path);
  }

  async create(): Promise<void> {
    if (!this.canCreate()) return;
    const fullPath = this.fullPath();
    if (!fullPath) return;

    this.creating.set(true);
    this.error.set(null);

    try {
      await this.projectService.createProject(
        fullPath,
        this.name().trim(),
        this.description.trim(),
      );
      this.projectService.addRecentProject(this.name().trim(), fullPath);
      this.created.emit();
    } catch (e) {
      this.error.set(this.translocoService.translate('MODAL.ERROR_CREATE', { error: String(e) }));
    } finally {
      this.creating.set(false);
    }
  }
}
