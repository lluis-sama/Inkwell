import { Component, inject, input, output, signal, computed } from '@angular/core';
import { TreeNode } from '../../../core/models/project.model';
import { ProjectService, findNode, deleteNode, insertAfter, insertInside, isDescendant } from '../../../core/services/project.service';
import { DocumentService } from '../../../core/services/document.service';
import { BinderNodeComponent, NodeContextEvent, DropEvent } from './binder-node.component';
import { BinderContextMenuComponent, ContextMenuAction } from './binder-context-menu.component';

@Component({
  selector: 'app-binder',
  standalone: true,
  imports: [BinderNodeComponent, BinderContextMenuComponent],
  templateUrl: './binder.component.html',
  host: {
    '(document:click)': 'closeContextMenu()',
    '(document:keydown.escape)': 'closeContextMenu()',
  },
})
export class BinderComponent {
  projectService  = inject(ProjectService);
  private docService = inject(DocumentService);

  activeId = input<string | null>(null);

  documentOpened = output<TreeNode>();
  nodeRenamed    = output<{ id: string; title: string }>();

  renamingId    = signal<string | null>(null);
  contextMenu   = signal<NodeContextEvent | null>(null);
  draggedNodeId = signal<string | null>(null);

  contextActions = computed<ContextMenuAction[]>(() => {
    const node = this.contextMenu()?.node;
    if (!node) return [];

    const actions: ContextMenuAction[] = [
      { label: 'Renombrar', action: 'rename' },
    ];

    if (node.type === 'folder') {
      actions.push(
        { label: 'Nuevo documento aquí', action: 'add-document' },
        { label: 'Nueva carpeta aquí',   action: 'add-folder' },
      );
    }

    actions.push({ label: 'Eliminar', action: 'delete', danger: true });
    return actions;
  });

  onDragStart(id: string): void {
    this.draggedNodeId.set(id);
  }

  onDrop(event: DropEvent): void {
    if (event.draggedId === event.targetId) return;
    this.applyDrop(event);
    this.draggedNodeId.set(null);
  }

  private async applyDrop(event: DropEvent): Promise<void> {
    const project = this.projectService.project();
    if (!project) return;
    const dragged = findNode(project.tree, event.draggedId);
    if (!dragged) return;
    if (event.position === 'inside' && isDescendant(project.tree, event.draggedId, event.targetId)) {
      return;
    }
    const treeWithoutDragged = deleteNode(project.tree, event.draggedId);
    const newTree = event.position === 'inside'
      ? insertInside(treeWithoutDragged, event.targetId, dragged)
      : insertAfter(treeWithoutDragged, event.targetId, dragged);
    await this.projectService.updateTree(newTree);
  }

  onContextMenu(event: NodeContextEvent): void {
    this.contextMenu.set(event);
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  async onContextAction(action: string): Promise<void> {
    const node = this.contextMenu()?.node;
    this.closeContextMenu();
    if (!node) return;

    if (action === 'rename') {
      this.renamingId.set(node.id);
    } else if (action === 'add-document') {
      await this.addDocument(node.id);
    } else if (action === 'add-folder') {
      await this.addFolder(node.id);
    } else if (action === 'delete') {
      await this.deleteNode(node);
    }
  }

  async onRenamed(event: { id: string; title: string }): Promise<void> {
    this.renamingId.set(null);
    await this.projectService.renameNode(event.id, event.title);
    this.nodeRenamed.emit(event);
  }

  async addDocument(parentId: string | null): Promise<void> {
    const doc = await this.docService.createDocument('Sin título', parentId);
    this.documentOpened.emit({
      id: doc.id, title: doc.title, type: 'document', children: [],
    });
  }

  async addFolder(parentId: string | null): Promise<void> {
    await this.projectService.addNode('folder', 'Nueva carpeta', parentId);
  }

  async deleteNode(node: TreeNode): Promise<void> {
    if (node.type === 'document') {
      await this.docService.deleteDocument(node.id);
    } else {
      await this.deleteDescendants(node.children);
      await this.projectService.removeNode(node.id);
    }
  }

  private async deleteDescendants(nodes: TreeNode[]): Promise<void> {
    for (const node of nodes) {
      if (node.type === 'document') {
        await this.docService.deleteDocument(node.id);
      } else {
        await this.deleteDescendants(node.children);
      }
    }
  }
}
