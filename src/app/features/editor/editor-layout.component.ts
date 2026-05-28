import {
  Component, inject, signal, computed, ViewChild, viewChild, ElementRef,
  OnInit, OnDestroy, HostListener, effect,
} from '@angular/core';
import interact from 'interactjs';
import { slideUpAnimation, slideInLeftAnimation, slideInRightAnimation } from '../../shared/animations/desk.animations';
import { Router, ActivatedRoute } from '@angular/router';
import { findNode } from '../../core/services/project.service';
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
import { ToastService } from '../../shared/services/toast.service';
import { LanguageToolService } from '../../core/services/language-tool.service';
import { ExportModalComponent } from '../export/export-modal.component';
import { SynopsisModalComponent } from './synopsis/synopsis-modal.component';
import { FindReplaceBarComponent } from './find-replace-bar/find-replace-bar.component';
import { StatsService } from '../../core/services/stats.service';
import { SettingsService } from '../../core/services/settings.service';
import { DeskPanelComponent } from './desk/desk-panel.component';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-editor-layout',
  standalone: true,
  imports: [BinderComponent, TiptapEditorComponent, EditorTopBarComponent, SnapshotsPanelComponent, AiAssistantPanelComponent, InkNavComponent, ExportModalComponent, SynopsisModalComponent, FindReplaceBarComponent, DeskPanelComponent, TranslocoPipe],
  templateUrl: './editor-layout.component.html',
  styleUrl: './editor-layout.component.css',
  animations: [slideUpAnimation, slideInLeftAnimation, slideInRightAnimation],
})
export class EditorLayoutComponent implements OnInit, OnDestroy {
  @ViewChild(TiptapEditorComponent) tiptapEditor?: TiptapEditorComponent;
  @ViewChild(BinderComponent) binder?: BinderComponent;

  protected projectService = inject(ProjectService);
  private docService       = inject(DocumentService);
  private router           = inject(Router);
  private route            = inject(ActivatedRoute);
  private bridge           = inject(TauriBridgeService);
  private toast            = inject(ToastService);
  private statsService     = inject(StatsService);
  private settingsService  = inject(SettingsService);
  readonly ltService       = inject(LanguageToolService);

  showBinder          = signal(true);
  editorRebuildKey    = signal(0);
  focusMode           = signal(false);
  saveStatus          = signal<SaveStatus>('saved');
  activeDocumentId    = signal<string | null>(null);
  activeDocument      = signal<DocumentFile | null>(null);
  showSnapshotsPanel  = signal<boolean>(false);
  showAiPanel         = signal(false);
  showExportModal     = signal(false);
  synopsisDocument    = signal<DocumentFile | null>(null);
  showFindReplace     = signal(false);
  findReplaceWithReplace = signal(false);
  findReplaceCount    = signal<{ current: number; total: number }>({ current: 0, total: 0 });

  sessionGoal        = signal<number>(0);
  sessionWordsAdded  = signal<number>(0);
  sessionBaseCount   = signal<number>(0);
  typewriterMode     = signal(false);

  sessionProgress = computed(() => {
    const goal = this.sessionGoal();
    if (goal === 0) return 0;
    return Math.min(100, Math.round((this.sessionWordsAdded() / goal) * 100));
  });

  sessionGoalReached = computed(() =>
    this.sessionGoal() > 0 && this.sessionWordsAdded() >= this.sessionGoal()
  );

  readonly deskPos = computed(() => this.settingsService.settings().deskPanel.position);
  readonly deskSettings = computed(() => this.settingsService.settings().deskPanel);

  private readonly pillHandleEl = viewChild<ElementRef>('deskPillHandle');
  private pillInteractable: ReturnType<typeof interact> | null = null;
  private pillDragMoved = false;

  private sideResizing = false;
  private sideResizeStartX = 0;
  private sideResizeStartWidth = 0;

  private isDirty       = false;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private docCachedWordCount    = 0;
  private accumulatedSessionWords = 0;

  constructor() {
    effect(() => {
      const handle = this.pillHandleEl()?.nativeElement;
      if (!handle) {
        this.pillInteractable?.unset();
        this.pillInteractable = null;
        return;
      }
      if (this.pillInteractable) return;
      this.pillInteractable = interact(handle).draggable({
        listeners: {
          move: (event: { dy: number }) => {
            this.pillDragMoved = true;
            if (this.deskPos() === 'closed' && event.dy < 0) {
              this.settingsService.setDeskPosition('bottom');
            }
            this.settingsService.setDeskBottomHeight(this.deskSettings().bottomHeight - event.dy);
          },
          end: () => {
            setTimeout(() => { this.pillDragMoved = false; }, 0);
          },
        },
      });
    });

    // Efecto: cuando cambia el idioma de LanguageTool, guardar documento y recrear editor
    let prevLang: string | undefined;
    effect(() => {
      const lang = this.ltService.resolvedLanguage();
      if (prevLang === undefined) {
        prevLang = lang;
        return;
      }
      if (lang === prevLang) return;
      prevLang = lang;

      if (this.isDirty && this.activeDocument()) {
        this.saveCurrentDocument()
          .then(() => this.editorRebuildKey.update(k => k + 1))
          .catch(() => this.editorRebuildKey.update(k => k + 1));
      } else {
        this.editorRebuildKey.update(k => k + 1);
      }
    });
  }

  onSideHandleMouseDown(event: MouseEvent): void {
    this.sideResizing = true;
    this.sideResizeStartX = event.clientX;
    this.sideResizeStartWidth = this.deskSettings().sideWidth;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.sideResizing) return;
    const dx = event.clientX - this.sideResizeStartX;
    const pos = this.deskPos();
    if (pos === 'left') {
      this.settingsService.setDeskSideWidth(this.sideResizeStartWidth + dx);
    } else if (pos === 'right') {
      this.settingsService.setDeskSideWidth(this.sideResizeStartWidth - dx);
    }
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.sideResizing = false;
  }

  async ngOnInit(): Promise<void> {
    if (!this.projectService.isLoaded()) {
      this.router.navigate(['/']);
      return;
    }
    this.startAutosave();

    const docId = this.route.snapshot.queryParams['doc'] as string | undefined;
    if (docId) {
      const node = findNode(this.projectService.project()!.tree, docId);
      if (node) await this.openDocument(node);
    }
  }

  ngOnDestroy(): void {
    this.stopAutosave();
    this.statsService.resetSession();
    this.pillInteractable?.unset();
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
      if (this.sessionBaseCount() === 0) {
        this.sessionBaseCount.set(this.projectService.totalWordCount());
      }
      this.docCachedWordCount = this.projectService.project()?.wordCountCache?.[doc.id] ?? 0;
      this.isDirty = false;
      this.saveStatus.set('saved');
      this.updateWindowTitle();
      await this.statsService.trackSessionStart();
    } catch (e) {
      console.error('Error cargando documento:', e);
    }
  }

  onContentChanged(content: object): void {
    if (!this.activeDocument()) return;
    this.activeDocument.update(doc => doc ? { ...doc, content } : doc);
    this.isDirty = true;
    this.saveStatus.set('unsaved');

    if (this.sessionGoal() > 0 && this.sessionBaseCount() > 0) {
      const prevReached = this.sessionGoalReached();
      const editorWords = this.tiptapEditor?.wordCount() ?? 0;
      const delta = Math.max(0, editorWords - this.docCachedWordCount);
      this.sessionWordsAdded.set(this.accumulatedSessionWords + delta);
      if (!prevReached && this.sessionGoalReached()) {
        this.toast.success(`¡Objetivo de ${this.sessionGoal()} palabras alcanzado hoy! 🎉`);
      }
    }
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
      // Freeze accumulated words at the current editor count after save
      const editorWords = this.tiptapEditor?.wordCount() ?? 0;
      const delta = Math.max(0, editorWords - this.docCachedWordCount);
      this.accumulatedSessionWords += delta;
      this.docCachedWordCount = editorWords;
      this.sessionWordsAdded.set(this.accumulatedSessionWords);
      await this.statsService.updateTodayWords();
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
    if (event.ctrlKey && event.key === 'h') {
      event.preventDefault();
      this.findReplaceWithReplace.set(true);
      this.showFindReplace.set(true);
    }
    if (event.ctrlKey && event.key === 'g') {
      event.preventDefault();
      this.findReplaceWithReplace.set(false);
      this.showFindReplace.set(true);
    }
    if (event.key === 'Escape' && this.showFindReplace()) {
      this.onFindReplaceClosed();
    }
  }

  onFindQueryChanged(event: { query: string; caseSensitive: boolean }): void {
    this.tiptapEditor?.find(event.query, event.caseSensitive);
    setTimeout(() => {
      this.findReplaceCount.set(
        this.tiptapEditor?.getSearchResultCount() ?? { current: 0, total: 0 }
      );
    }, 50);
  }

  onFindNext(): void {
    this.tiptapEditor?.findNext();
    setTimeout(() => this.findReplaceCount.set(
      this.tiptapEditor?.getSearchResultCount() ?? { current: 0, total: 0 }
    ), 50);
  }

  onFindPrev(): void {
    this.tiptapEditor?.findPrev();
    setTimeout(() => this.findReplaceCount.set(
      this.tiptapEditor?.getSearchResultCount() ?? { current: 0, total: 0 }
    ), 50);
  }

  onReplace(replacement: string): void {
    this.tiptapEditor?.replace(replacement);
    setTimeout(() => this.findReplaceCount.set(
      this.tiptapEditor?.getSearchResultCount() ?? { current: 0, total: 0 }
    ), 50);
  }

  onReplaceAll(replacement: string): void {
    const count = this.tiptapEditor?.getSearchResultCount()?.total ?? 0;
    this.tiptapEditor?.replaceAll(replacement);
    this.findReplaceCount.set({ current: 0, total: 0 });
    if (count > 0) {
      this.toast.success(`${count} ocurrencia${count !== 1 ? 's' : ''} reemplazada${count !== 1 ? 's' : ''}.`);
    }
  }

  onFindReplaceClosed(): void {
    this.showFindReplace.set(false);
    this.findReplaceWithReplace.set(false);
    this.tiptapEditor?.clearSearch();
    this.findReplaceCount.set({ current: 0, total: 0 });
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

  onDeskHandleClick(): void {
    if (this.pillDragMoved) return;
    const pos = this.settingsService.settings().deskPanel.position;
    if (pos === 'closed') {
      this.settingsService.setDeskPosition('bottom');
    } else {
      this.settingsService.setDeskPosition('closed');
    }
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
