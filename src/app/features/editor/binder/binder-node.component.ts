import {
  Component, input, output, signal, computed,
  ViewChild, ElementRef, effect,
} from '@angular/core';
import { TreeNode } from '../../../core/models/project.model';

export interface NodeContextEvent {
  node: TreeNode;
  x: number;
  y: number;
}

@Component({
  selector: 'app-binder-node',
  standalone: true,
  imports: [BinderNodeComponent],
  templateUrl: './binder-node.component.html',
})
export class BinderNodeComponent {
  @ViewChild('renameInput') renameInputEl?: ElementRef<HTMLInputElement>;

  node       = input.required<TreeNode>();
  depth      = input<number>(0);
  activeId   = input<string | null>(null);
  renamingId = input<string | null>(null);

  nodeClicked  = output<TreeNode>();
  contextMenu  = output<NodeContextEvent>();
  renamed      = output<{ id: string; title: string }>();
  renameCancel = output<void>();

  expanded = signal<boolean>(true);
  isActive = computed(() => this.activeId() === this.node().id);
  renaming = computed(() => this.renamingId() === this.node().id);

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
}
