import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import interact from 'interactjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { DeskBinderComponent } from './desk-binder.component';
import { TiptapEditorComponent } from '../tiptap/tiptap-editor.component';
import { SettingsService } from '../../../core/services/settings.service';
import { ProjectService } from '../../../core/services/project.service';
import { DocumentService } from '../../../core/services/document.service';
import { DeskService } from '../../../core/services/desk.service';
import { TreeNode } from '../../../core/models/project.model';
import { DocumentFile } from '../../../core/models/document.model';

@Component({
  selector: 'ink-desk-panel',
  standalone: true,
  imports: [DeskBinderComponent, TiptapEditorComponent, TranslocoPipe],
  templateUrl: './desk-panel.component.html',
  styleUrl: './desk-panel.component.css',
})
export class DeskPanelComponent implements OnInit, OnDestroy {
  private readonly settings = inject(SettingsService);
  private readonly project = inject(ProjectService);
  private readonly docService = inject(DocumentService);
  private readonly deskService = inject(DeskService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly handleEl = viewChild<ElementRef>('resizeHandle');
  private interactable: ReturnType<typeof interact> | null = null;

  readonly position = computed(() => this.settings.settings().deskPanel.position);
  readonly bottomHeight = computed(() => this.settings.settings().deskPanel.bottomHeight);
  readonly sideWidth = computed(() => this.settings.settings().deskPanel.sideWidth);

  readonly deskTree = signal<TreeNode[]>([]);
  readonly activeDocId = signal<string | null>(null);
  readonly activeDocContent = signal<object>({ type: 'doc', content: [] });

  readonly resizeHandleClass = computed(() => {
    switch (this.position()) {
      case 'bottom':
        return 'top-0 left-0 right-0 h-1 cursor-row-resize';
      case 'left':
        return 'top-0 right-0 bottom-0 w-2 cursor-col-resize';
      case 'right':
        return 'top-0 left-0 bottom-0 w-2 cursor-col-resize';
      default:
        return '';
    }
  });

  constructor() {
    this.deskService.newDocument$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async (name) => {
        await this.loadDeskTree();
        const node = this.deskTree().find((n) => n.title === name);
        if (node) this.activeDocId.set(node.id);
      });

    effect(() => {
      const id = this.activeDocId();
      if (id) {
        this.loadDocContent(id);
      } else {
        this.activeDocContent.set({ type: 'doc', content: [] });
      }
    });

    effect(() => {
      const handle = this.handleEl()?.nativeElement;
      if (!handle || this.interactable) return;
      this.interactable = interact(handle).draggable({
        listeners: {
          move: (event) => {
            const pos = this.position();
            if (pos === 'bottom') {
              this.settings.setDeskBottomHeight(this.bottomHeight() - event.dy);
            } else if (pos === 'left') {
              this.settings.setDeskSideWidth(this.sideWidth() + event.dx);
            } else if (pos === 'right') {
              this.settings.setDeskSideWidth(this.sideWidth() - event.dx);
            }
          },
        },
      });
    });
  }

  ngOnInit(): void {
    this.loadDeskTree();
  }

  ngOnDestroy(): void {
    this.interactable?.unset();
  }

  async loadDeskTree(): Promise<void> {
    const tree = await this.project.loadDeskNotesTree();
    this.deskTree.set(tree);
  }

  private async loadDocContent(id: string): Promise<void> {
    try {
      const doc = await this.docService.loadDeskDocument(id);
      this.activeDocContent.set(doc.content);
    } catch {
      this.activeDocContent.set({ type: 'doc', content: [] });
    }
  }

  onContentChanged(content: object): void {
    const id = this.activeDocId();
    if (!id) return;
    const node = this.deskTree().find((n) => n.id === id);
    const doc: DocumentFile = {
      id,
      title: node?.title ?? '',
      content,
      snapshots: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.docService.saveDeskDocument(doc).catch(() => {});
  }

  pinLeft(): void {
    this.settings.setDeskPosition('left');
  }

  pinRight(): void {
    this.settings.setDeskPosition('right');
  }

  pinBottom(): void {
    this.settings.setDeskPosition('bottom');
  }

  close(): void {
    this.settings.setDeskPosition('closed');
  }
}
