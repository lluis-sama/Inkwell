import { Component, inject, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { TreeNode } from '../../../core/models/project.model';
import { ProjectService, findNode, deleteNode, insertAfter, insertInside, isDescendant } from '../../../core/services/project.service';
import { DocumentService } from '../../../core/services/document.service';
import { BinderNodeComponent, NodeContextEvent, DropEvent } from '../binder/binder-node.component';
import { BinderContextMenuComponent } from '../binder/binder-context-menu.component';

@Component({
  selector: 'ink-desk-binder',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, BinderNodeComponent, BinderContextMenuComponent],
  templateUrl: './desk-binder.component.html',
  styleUrl: './desk-binder.component.css',
  host: {
    '(document:click)': 'closeContextMenu()',
    '(document:keydown.escape)': 'closeContextMenu()',
  },
})
export class DeskBinderComponent {
  private readonly project = inject(ProjectService);
  private readonly docService = inject(DocumentService);

  tree = input<TreeNode[]>([]);
  activeId = input<string | null>(null);

  documentSelected = output<string>();
  treeChanged = output<void>();

  renamingId = signal<string | null>(null);
  draggedNodeId = signal<string | null>(null);
  contextMenuEvent = signal<NodeContextEvent | null>(null);

  contextActions = computed(() => {
    const node = this.contextMenuEvent()?.node;
    if (!node) return [];
    return [
      { label: 'Renombrar', action: 'rename' },
      { label: 'Eliminar', action: 'delete', danger: true },
    ];
  });

  selectDocument(id: string): void {
    this.documentSelected.emit(id);
  }

  async newDocument(): Promise<void> {
    const title = `Nota ${new Date().toLocaleDateString('es-ES')}`;
    await this.docService.createDocumentInDesk(title, '');
    this.treeChanged.emit();
  }

  async newFolder(): Promise<void> {
    await this.project.addDeskNode('folder', 'Nueva carpeta');
    this.treeChanged.emit();
  }

  onNodeClicked(node: TreeNode): void {
    if (node.type === 'document') {
      this.documentSelected.emit(node.id);
    }
  }

  async onRenamed(event: { id: string; title: string }): Promise<void> {
    await this.project.renameDeskNode(event.id, event.title);
    this.renamingId.set(null);
    this.treeChanged.emit();
  }

  onRenameCancel(): void {
    this.renamingId.set(null);
  }

  onDragStarted(id: string): void {
    this.draggedNodeId.set(id);
  }

  async onDropped(event: DropEvent): Promise<void> {
    const tree = this.tree();
    const dragged = findNode(tree, event.draggedId);
    if (!dragged) return;
    if (event.position === 'inside' && isDescendant(tree, event.draggedId, event.targetId)) return;
    const treeWithoutDragged = deleteNode(tree, event.draggedId);
    const newTree = event.position === 'inside'
      ? insertInside(treeWithoutDragged, event.targetId, dragged)
      : insertAfter(treeWithoutDragged, event.targetId, dragged);
    await this.project.updateDeskTree(newTree);
    this.draggedNodeId.set(null);
    this.treeChanged.emit();
  }

  onContextMenu(event: NodeContextEvent): void {
    this.contextMenuEvent.set(event);
  }

  closeContextMenu(): void {
    this.contextMenuEvent.set(null);
  }

  async onContextAction(action: string): Promise<void> {
    const node = this.contextMenuEvent()?.node;
    if (!node) {
      this.closeContextMenu();
      return;
    }

    if (action === 'rename') {
      this.renamingId.set(node.id);
    } else if (action === 'delete') {
      if (node.type === 'document') {
        await this.docService.deleteDeskDocument(node.id);
      }
      await this.project.removeDeskNode(node.id);
      this.treeChanged.emit();
    }

    this.closeContextMenu();
  }
}
