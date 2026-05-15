import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { ExportFormat, ExportMetadata, PageSize, DEFAULT_EXPORT_METADATA } from '../../core/models/export.model';
import { DocumentFile } from '../../core/models/document.model';
import { TreeNode } from '../../core/models/project.model';
import { ExportService } from '../../core/services/export.service';
import { ProjectService } from '../../core/services/project.service';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../shared/services/toast.service';
import { InkModalComponent } from '../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../shared/components/ink-button.component';
import { StepDocumentSelectorComponent, FlatDocument } from './steps/step-document-selector.component';
import { StepMetadataComponent } from './steps/step-metadata.component';
import { StepFormatComponent } from './steps/step-format.component';

@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [
    InkModalComponent,
    InkButtonComponent,
    StepDocumentSelectorComponent,
    StepMetadataComponent,
    StepFormatComponent,
  ],
  template: `
    <ink-modal [title]="stepTitle()" [hasActions]="false" (closed)="closed.emit()">

      <div class="flex items-center gap-2 mb-6 -mt-2">
        @for (step of steps; track step.n) {
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors"
                 [class]="currentStep() >= step.n
                   ? 'bg-ink-accent text-ink-panel'
                   : 'bg-ink-border text-ink-subtle'">
              {{ step.n }}
            </div>
            <span class="text-xs"
                  [class]="currentStep() === step.n ? 'text-ink-text' : 'text-ink-subtle'">
              {{ step.label }}
            </span>
            @if (!$last) {
              <div class="w-8 h-px bg-ink-border mx-1"></div>
            }
          </div>
        }
      </div>

      @switch (currentStep()) {
        @case (1) {
          <app-step-format
            [format]="selectedFormat()"
            (formatChange)="selectedFormat.set($event)"
            (pageSizeChange)="onPageSizeChange($event)"/>
        }
        @case (2) {
          <app-step-document-selector
            [documents]="flatDocuments()"
            [selectedIds]="selectedIds()"
            (selectedIdsChange)="selectedIds.set($event)"/>
        }
        @case (3) {
          <app-step-metadata
            [meta]="metadata()"
            (metaChange)="metadata.set($event)"
            [format]="selectedFormat()"/>
        }
      }

      <div class="flex justify-between mt-6 pt-4 border-t border-ink-border">
        <ink-button
          variant="ghost"
          (clicked)="goBack()">
          {{ currentStep() === 1 ? 'Cancelar' : '← Anterior' }}
        </ink-button>

        @if (currentStep() < 3) {
          <ink-button
            variant="primary"
            [disabled]="!canAdvance()"
            (clicked)="goNext()">
            Siguiente →
          </ink-button>
        } @else {
          <ink-button
            variant="primary"
            [disabled]="!canExport()"
            [loading]="exporting()"
            (clicked)="doExport()">
            Exportar
          </ink-button>
        }
      </div>

    </ink-modal>
  `,
})
export class ExportModalComponent implements OnInit {
  private exportService  = inject(ExportService);
  private projectService = inject(ProjectService);
  private docService     = inject(DocumentService);
  private toast          = inject(ToastService);

  closed    = output<void>();
  exporting = signal(false);

  currentStep    = signal(1);
  selectedFormat = signal<ExportFormat>('pdf-manuscript');
  selectedIds    = signal<string[]>([]);
  metadata       = signal<ExportMetadata>({ ...DEFAULT_EXPORT_METADATA });
  flatDocuments  = signal<FlatDocument[]>([]);

  readonly steps = [
    { n: 1, label: 'Formato' },
    { n: 2, label: 'Documentos' },
    { n: 3, label: 'Metadatos' },
  ];

  stepTitle = computed(() => {
    const titles = ['', 'Elegir formato', 'Seleccionar documentos', 'Información del autor'];
    return `Exportar — ${titles[this.currentStep()]}`;
  });

  async ngOnInit(): Promise<void> {
    await this.loadFlatDocuments();
    this.selectedIds.set(this.flatDocuments().map(d => d.id));
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
      this.toast.success(
        this.selectedFormat() === 'epub'
          ? 'EPUB guardado correctamente.'
          : 'Manuscrito abierto. Pulsa "Guardar como PDF / Imprimir" en la ventana.'
      );
      this.closed.emit();
    } catch (e) {
      this.toast.error(`Error al exportar: ${e}`);
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
