import {
  Component, inject, signal, ViewChild,
  OnInit, OnDestroy, HostListener,
} from '@angular/core';
import { Router } from '@angular/router';
import { ProjectService }  from '../../core/services/project.service';
import { DocumentService } from '../../core/services/document.service';
import { DocumentFile }    from '../../core/models/document.model';
import { TreeNode }        from '../../core/models/project.model';
import { BinderComponent } from './binder/binder.component';
import { TiptapEditorComponent } from './tiptap/tiptap-editor.component';
import { EditorTopBarComponent, SaveStatus } from './top-bar/editor-top-bar.component';
import { SnapshotsPanelComponent } from './snapshots/snapshots-panel.component';
import { AiAssistantPanelComponent } from './ai-assistant/ai-assistant-panel.component';
import { InkNavComponent } from '../../shared/components/ink-nav.component';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { ExportModalComponent } from '../export/export-modal.component';
import { SynopsisModalComponent } from './synopsis/synopsis-modal.component';

@Component({
  selector: 'app-editor-layout',
  standalone: true,
  imports: [BinderComponent, TiptapEditorComponent, EditorTopBarComponent, SnapshotsPanelComponent, AiAssistantPanelComponent, InkNavComponent, ExportModalComponent, SynopsisModalComponent],
  templateUrl: './editor-layout.component.html',
})
export class EditorLayoutComponent implements OnInit, OnDestroy {
  @ViewChild(TiptapEditorComponent) tiptapEditor?: TiptapEditorComponent;
  @ViewChild(BinderComponent) binder?: BinderComponent;

  protected projectService = inject(ProjectService);
  private docService       = inject(DocumentService);
  private router           = inject(Router);
  private bridge           = inject(TauriBridgeService);

  showBinder          = signal(true);
  focusMode           = signal(false);
  saveStatus          = signal<SaveStatus>('saved');
  activeDocumentId    = signal<string | null>(null);
  activeDocument      = signal<DocumentFile | null>(null);
  showSnapshotsPanel  = signal<boolean>(false);
  showAiPanel         = signal(false);
  showExportModal     = signal(false);
  synopsisDocument    = signal<DocumentFile | null>(null);

  private isDirty       = false;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (!this.projectService.isLoaded()) {
      this.router.navigate(['/']);
      return;
    }
    this.startAutosave();
  }

  ngOnDestroy(): void {
    this.stopAutosave();
  }

  // ─── Documentos ───────────────────────────────────────────────────────────

  async openDocument(node: TreeNode): Promise<void> {
    if (node.type !== 'document') return;

    if (this.isDirty && this.activeDocument()) {
      await this.saveCurrentDocument();
    }

    try {
      const doc = await this.docService.loadDocument(node.id);
      this.activeDocumentId.set(doc.id);
      this.activeDocument.set(doc);
      this.isDirty = false;
      this.saveStatus.set('saved');
      this.updateWindowTitle();
    } catch (e) {
      console.error('Error cargando documento:', e);
    }
  }

  onContentChanged(content: object): void {
    if (!this.activeDocument()) return;
    this.activeDocument.update(doc => doc ? { ...doc, content } : doc);
    this.isDirty = true;
    this.saveStatus.set('unsaved');
  }

  onNodeRenamed(event: { id: string; title: string }): void {
    if (this.activeDocument()?.id === event.id) {
      this.activeDocument.update(doc => doc ? { ...doc, title: event.title } : doc);
    }
  }

  async onTitleChanged(title: string): Promise<void> {
    if (!this.activeDocument() || !title.trim()) return;
    this.activeDocument.update(doc => doc ? { ...doc, title: title.trim() } : doc);
    await this.projectService.renameNode(this.activeDocument()!.id, title.trim());
    this.isDirty = true;
    this.saveStatus.set('unsaved');
    this.updateWindowTitle();
  }

  async createSnapshot(): Promise<void> {
    const doc = this.activeDocument();
    if (!doc) return;

    const withSnapshot = this.docService.createSnapshot(doc);
    const saved = await this.docService.saveDocument(withSnapshot);
    this.activeDocument.set(saved);
    this.isDirty = false;
    this.saveStatus.set('saved');
  }

  // ─── Autosave ─────────────────────────────────────────────────────────────

  private startAutosave(): void {
    const interval = this.projectService.project()?.settings.autosaveInterval ?? 30;
    if (interval === 0) return;

    this.autosaveTimer = setInterval(() => {
      if (this.isDirty) this.saveCurrentDocument();
    }, interval * 1000);
  }

  private stopAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private updateWindowTitle(): void {
    const project = this.projectService.project()?.name ?? 'Inkwell';
    const doc = this.activeDocument()?.title;
    const title = doc ? `${doc} — ${project}` : project;
    this.bridge.setWindowTitle(title).catch(() => {});
  }

  private async saveCurrentDocument(): Promise<void> {
    const doc = this.activeDocument();
    if (!doc) return;

    this.saveStatus.set('saving');
    try {
      const saved = await this.docService.saveDocument(doc);
      this.activeDocument.set(saved);
      this.isDirty = false;
      this.saveStatus.set('saved');
    } catch {
      this.saveStatus.set('error');
    }
  }

  // ─── Atajos de teclado ────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'b') {
      event.preventDefault();
      this.showBinder.update(v => !v);
    }
    if (event.ctrlKey && !event.shiftKey && event.key === 'f') {
      event.preventDefault();
      this.binder?.showSearch.update(v => !v);
    }
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      this.toggleFocusMode();
    }
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault();
      this.saveCurrentDocument();
    }
    if (event.ctrlKey && event.shiftKey && event.key === 'A') {
      event.preventDefault();
      this.toggleAiPanel();
    }
  }

  async onSynopsisRequested(node: TreeNode): Promise<void> {
    const doc = await this.docService.loadDocument(node.id);
    this.synopsisDocument.set(doc);
  }

  onSynopsisSaved(doc: DocumentFile): void {
    if (this.activeDocument()?.id === doc.id) {
      this.activeDocument.set(doc);
    }
    this.synopsisDocument.set(null);
  }

  closeSynopsisModal(): void {
    this.synopsisDocument.set(null);
  }

  toggleBinder(): void {
    this.showBinder.update(v => !v);
  }

  toggleFocusMode(): void {
    this.focusMode.update(v => !v);
  }

  toggleSnapshotsPanel(): void {
    if (!this.showSnapshotsPanel()) {
      this.showAiPanel.set(false);
    }
    this.showSnapshotsPanel.update(v => !v);
  }

  toggleAiPanel(): void {
    if (!this.showAiPanel()) {
      this.showSnapshotsPanel.set(false);
    }
    this.showAiPanel.update(v => !v);
  }

  onInsertIntoEditor(text: string): void {
    this.tiptapEditor?.insertAtCursor(text);
  }

  onDocumentRestoredFromPanel(doc: DocumentFile): void {
    this.activeDocument.set(doc);
    this.isDirty = false;
    this.saveStatus.set('saved');
  }
}
