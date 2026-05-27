import { Component, inject, signal, computed, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import { InkModalComponent } from '../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../shared/components/ink-button.component';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { ProjectService } from '../../core/services/project.service';
import { DocumentService } from '../../core/services/document.service';
import { PROJECT_TEMPLATES } from '../../core/data/project-templates';
import { ProjectTemplate } from '../../core/models/project.model';
import { TemplateNode } from '../../core/models/project.model';
import slugify from 'slugify';

@Component({
  selector: 'app-new-project-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule, TranslocoPipe],
  templateUrl: './new-project-modal.component.html',
  styleUrl: './new-project-modal.component.css',
})
export class NewProjectModalComponent {
  private bridge          = inject(TauriBridgeService);
  private projectService  = inject(ProjectService);
  private docService      = inject(DocumentService);
  readonly translocoService = inject(TranslocoService);

  created   = output<void>();
  cancelled = output<void>();

  name        = signal('');
  description = '';
  folderPath  = signal<string | null>(null);
  creating    = signal(false);
  error       = signal<string | null>(null);

  readonly templates       = PROJECT_TEMPLATES;
  step                     = signal<1 | 2>(1);
  selectedTemplate         = signal<ProjectTemplate>(PROJECT_TEMPLATES[0]);
  customParts              = 3;
  customChapters           = 5;

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
      await this.projectService.addRecentProject(this.name().trim(), fullPath);

      // Aplicar la plantilla
      const template  = this.selectedTemplate();
      const structure = template.id === 'custom'
        ? this.buildCustomStructure(this.customParts, this.customChapters)
        : template.structure;

      if (structure.length > 0) {
        await this.applyTemplate(structure);
      }

      this.created.emit();
    } catch (e) {
      this.error.set(this.translocoService.translate('MODAL.ERROR_CREATE', { error: String(e) }));
    } finally {
      this.creating.set(false);
    }
  }

  private buildCustomStructure(parts: number, chaptersPerPart: number): TemplateNode[] {
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X',
                   'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
    return Array.from({ length: parts }, (_, i) => ({
      title:    `Parte ${roman[i] ?? i + 1}`,
      type:     'folder' as const,
      children: Array.from({ length: chaptersPerPart }, (_, j) => ({
        title:    `Capítulo ${i * chaptersPerPart + j + 1}`,
        type:     'document' as const,
        children: [],
      })),
    }));
  }

  private async applyTemplate(
    nodes: TemplateNode[],
    parentId: string | null = null,
  ): Promise<void> {
    for (const node of nodes) {
      if (node.type === 'folder') {
        const treeNode = await this.projectService.addNode('folder', node.title, parentId);
        if (node.children.length > 0) {
          await this.applyTemplate(node.children, treeNode.id);
        }
      } else {
        await this.docService.createDocument(node.title, parentId);
      }
    }
  }
}
