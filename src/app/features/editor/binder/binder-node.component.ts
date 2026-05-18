import {
  Component, input, output, signal, computed,
  ViewChild, ElementRef, effect,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TreeNode, DocumentStatus, DOCUMENT_STATUS_CONFIG } from '../../../core/models/project.model';

export interface NodeContextEvent {
  node: TreeNode;
  x: number;
  y: number;
}

export interface DropEvent {
  draggedId: string;
  targetId: string;
  position: 'after' | 'inside';
}

@Component({
  selector: 'app-binder-node',
  standalone: true,
  imports: [BinderNodeComponent, TranslocoPipe],
  templateUrl: './binder-node.component.html',
})
export class BinderNodeComponent {
  @ViewChild('renameInput') renameInputEl?: ElementRef<HTMLInputElement>;

  node       = input.required<TreeNode>();
  depth      = input<number>(0);
  activeId   = input<string | null>(null);
  renamingId = input<string | null>(null);

  nodeClicked       = output<TreeNode>();
  contextMenu       = output<NodeContextEvent>();
  renamed           = output<{ id: string; title: string }>();
  renameCancel      = output<void>();
  dragStarted       = output<string>();
  dropped           = output<DropEvent>();
  synopsisRequested = output<TreeNode>();

  expanded       = signal<boolean>(true);
  isActive       = computed(() => this.activeId() === this.node().id);
  renaming       = computed(() => this.renamingId() === this.node().id);
  isDragOver     = signal(false);
  isDragOverInner = signal(false);

  constructor() {
    // Auto-focus the rename input when it appears
    effect(() => {
      if (this.renaming() && this.renameInputEl?.nativeElement) {
        setTimeout(() => this.renameInputEl?.nativeElement.focus(), 0);
      }
    });
  }

  onRowClick(): void {
    if (this.node().type === 'folder') {
      this.expanded.update(v => !v);
    } else {
      this.nodeClicked.emit(this.node());
    }
  }

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu.emit({ node: this.node(), x: event.clientX, y: event.clientY });
  }

  commitRename(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const title = inputEl.value.trim();
    if (title) this.renamed.emit({ id: this.node().id, title });
    else this.renameCancel.emit();
  }

  statusColor(status: DocumentStatus): string {
    return DOCUMENT_STATUS_CONFIG[status]?.color ?? 'transparent';
  }

  statusLabel(status: DocumentStatus): string {
    return DOCUMENT_STATUS_CONFIG[status]?.label ?? '';
  }

  onSynopsisRequested(event: MouseEvent): void {
    event.stopPropagation();
    this.synopsisRequested.emit(this.node());
  }

  onDragStart(event: DragEvent): void {
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', this.node().id);
    this.dragStarted.emit(this.node().id);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = 'move';
    if (this.node().type === 'folder') {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const relY = (event.clientY - rect.top) / rect.height;
      this.isDragOverInner.set(relY > 0.6);
      this.isDragOver.set(relY <= 0.6);
    } else {
      this.isDragOver.set(true);
      this.isDragOverInner.set(false);
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer!.getData('text/plain');
    if (!draggedId || draggedId === this.node().id) return;
    const position: 'after' | 'inside' =
      this.node().type === 'folder' && this.isDragOverInner()
        ? 'inside'
        : 'after';
    this.dropped.emit({ draggedId, targetId: this.node().id, position });
    this.isDragOver.set(false);
    this.isDragOverInner.set(false);
  }
}
