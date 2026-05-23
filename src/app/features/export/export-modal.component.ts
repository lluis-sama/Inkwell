import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { ExportFormat, ExportMetadata, PageSize, DEFAULT_EXPORT_METADATA } from '../../core/models/export.model';
import { DocumentFile } from '../../core/models/document.model';
import { TreeNode } from '../../core/models/project.model';
import { ExportService } from '../../core/services/export.service';
import { ProjectService } from '../../core/services/project.service';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../shared/services/toast.service';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { InkModalComponent } from '../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../shared/components/ink-button.component';
import { StepDocumentSelectorComponent, FlatDocument } from './steps/step-document-selector.component';
import { StepMetadataComponent } from './steps/step-metadata.component';
import { StepFormatComponent } from './steps/step-format.component';

@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [
    TranslocoPipe,
    InkModalComponent,
    InkButtonComponent,
    StepDocumentSelectorComponent,
    StepMetadataComponent,
    StepFormatComponent,
  ],
  templateUrl: './export-modal.component.html',
})
export class ExportModalComponent implements OnInit {
  private exportService  = inject(ExportService);
  private projectService = inject(ProjectService);
  private docService     = inject(DocumentService);
  private toast          = inject(ToastService);
  readonly #transloco    = inject(TranslocoService);

  closed    = output<void>();
  exporting = signal(false);

  currentStep    = signal(1);
  selectedFormat = signal<ExportFormat>('pdf-manuscript');
  selectedIds    = signal<string[]>([]);
  metadata       = signal<ExportMetadata>({ ...DEFAULT_EXPORT_METADATA });
  flatDocuments  = signal<FlatDocument[]>([]);

  readonly steps = [
    { n: 1, label: 'EXPORT.STEP_FORMAT' },
    { n: 2, label: 'EXPORT.STEP_SELECTOR' },
    { n: 3, label: 'EXPORT.STEP_METADATA' },
  ];

  stepTitle = computed(() => {
    const keys = ['', 'EXPORT.STEP_TITLE_FORMAT', 'EXPORT.STEP_TITLE_SELECTOR', 'EXPORT.STEP_TITLE_METADATA'];
    return this.#transloco.translate(keys[this.currentStep()]);
  });

  async ngOnInit(): Promise<void> {
    await this.loadFlatDocuments();
    this.selectedIds.set(this.flatDocuments().map(d => d.id));

    const profile = this.projectService.project()?.authorProfile;
    if (profile) {
      const current = this.metadata();
      this.metadata.set({
        ...current,
        legalName:    profile.legalName    || current.legalName,
        penName:      profile.penName      ?? current.penName,
        email:        profile.email        || current.email,
        phone:        profile.phone        ?? current.phone,
        address:      profile.address      ?? current.address,
        agentName:    profile.agentName    ?? current.agentName,
        agentContact: profile.agentContact ?? current.agentContact,
        genre:        profile.genre        || current.genre,
        language:     profile.language     || current.language,
        copyrightYear: profile.copyrightYear || current.copyrightYear,
        publisher:    profile.publisher    ?? current.publisher,
      });
    }
  }

  goBack(): void {
    if (this.currentStep() === 1) {
      this.closed.emit();
    } else {
      this.currentStep.update(s => s - 1);
    }
  }

  goNext(): void {
    this.currentStep.update(s => s + 1);
  }

  canAdvance(): boolean {
    if (this.currentStep() === 2) return this.selectedIds().length > 0;
    return true;
  }

  canExport(): boolean {
    const m = this.metadata();
    return !!(m.legalName.trim() && m.email.trim() && m.genre.trim());
  }

  onPageSizeChange(size: PageSize): void {
    this.metadata.update(m => ({ ...m, pageSize: size }));
  }

  async doExport(): Promise<void> {
    this.exporting.set(true);
    try {
      const docs = await this.loadSelectedDocuments();
      await this.exportService.export(
        {
          format: this.selectedFormat(),
          selectedDocumentIds: this.selectedIds(),
          metadata: this.metadata(),
        },
        docs,
        this.projectService.project()!.name,
      );
      if (this.selectedFormat() === 'epub') {
        this.toast.success(this.#transloco.translate('EXPORT.SUCCESS_EPUB'));
      } else if (this.selectedFormat() === 'docx') {
        this.toast.success(this.#transloco.translate('EXPORT.SUCCESS_DOCX'));
      } else {
        this.toast.success(this.#transloco.translate('EXPORT.SUCCESS_PDF'));
      }
      this.closed.emit();
    } catch (e) {
      this.toast.error(this.#transloco.translate('EXPORT.ERROR_EXPORT', { error: String(e) }));
    } finally {
      this.exporting.set(false);
    }
  }

  private async loadFlatDocuments(): Promise<void> {
    const project = this.projectService.project();
    if (!project) return;

    const flat = this.flattenTree(project.tree, 0);
    const withCounts = await Promise.all(
      flat.map(async item => {
        try {
          const doc = await this.docService.loadDocument(item.id);
          return { ...item, wordCount: this.exportService.countWords([doc]) };
        } catch {
          return { ...item, wordCount: 0 };
        }
      })
    );
    this.flatDocuments.set(withCounts);
  }

  private async loadSelectedDocuments(): Promise<DocumentFile[]> {
    return Promise.all(
      this.selectedIds().map(id => this.docService.loadDocument(id))
    );
  }

  private flattenTree(
    nodes: TreeNode[],
    depth: number,
  ): Array<{ id: string; title: string; depth: number; wordCount: number }> {
    return nodes.flatMap(n => {
      if (n.type === 'folder') return this.flattenTree(n.children, depth + 1);
      return [{ id: n.id, title: n.title, depth, wordCount: 0 }];
    });
  }
}
