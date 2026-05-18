import { Component, inject, input, output, signal, computed } from '@angular/core';
import { TreeNode, DocumentStatus } from '../../../core/models/project.model';
import { ProjectService, findNode, deleteNode, insertAfter, insertInside, isDescendant } from '../../../core/services/project.service';
import { DocumentService } from '../../../core/services/document.service';
import { ImportService } from '../../../core/services/import.service';
import { ToastService } from '../../../shared/services/toast.service';
import { BinderNodeComponent, NodeContextEvent, DropEvent } from './binder-node.component';
import { BinderContextMenuComponent, ContextMenuAction } from './binder-context-menu.component';
import { BinderFooterComponent } from './binder-footer.component';
import { BinderSearchComponent } from './binder-search.component';

@Component({
  selector: 'app-binder',
  standalone: true,
  imports: [BinderNodeComponent, BinderContextMenuComponent, BinderFooterComponent, BinderSearchComponent],
  templateUrl: './binder.component.html',
  host: {
    '(document:click)': 'closeContextMenu()',
    '(document:keydown.escape)': 'closeContextMenu()',
  },
})
export class BinderComponent {
  projectService      = inject(ProjectService);
  private docService  = inject(DocumentService);
  private importService = inject(ImportService);
  private toast         = inject(ToastService);

  activeId = input<string | null>(null);

  sessionGoal        = input<number>(0);
  sessionWordsAdded  = input<number>(0);
  sessionProgress    = input<number>(0);
  sessionGoalReached = input<boolean>(false);
  totalWordCount     = input<number>(0);

  documentOpened    = output<TreeNode>();
  nodeRenamed       = output<{ id: string; title: string }>();
  synopsisRequested = output<TreeNode>();
  goalChanged       = output<number>();

  renamingId    = signal<string | null>(null);
  contextMenu   = signal<NodeContextEvent | null>(null);
  draggedNodeId = signal<string | null>(null);
  showSearch    = signal(false);
  importing     = signal(false);

  contextActions = computed<ContextMenuAction[]>(() => {
    const node = this.contextMenu()?.node;
    if (!node) return [];

    const actions: ContextMenuAction[] = [
      { label: 'Renombrar', action: 'rename' },
    ];

    if (node.type === 'document') {
      actions.push(
        { label: '', action: 'sep1', separator: true },
        { label: 'Estado', action: 'header-status', disabled: true },
        { label: '○  Sin estado',   action: 'status:clear' },
        { label: '○  Por escribir', action: 'status:todo' },
        { label: '○  Borrador',     action: 'status:draft' },
        { label: '○  En revisión',  action: 'status:revised' },
        { label: '●  Finalizado',   action: 'status:final' },
        { label: '◇  Solo notas',   action: 'status:notes' },
        { label: '', action: 'sep2', separator: true },
      );
    }

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

    if (action.startsWith('status:')) {
      const status = action === 'status:clear'
        ? undefined
        : action.replace('status:', '') as DocumentStatus;
      await this.projectService.updateNodeStatus(node.id, status);
      return;
    }

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

  onSearchToggled(): void {
    this.showSearch.update(v => !v);
  }

  onSearchDocumentSelected(id: string): void {
    this.showSearch.set(false);
    const project = this.projectService.project();
    if (!project) return;
    const node = findNode(project.tree, id);
    if (node) {
      this.documentOpened.emit(node);
    }
  }

  onSynopsisRequested(node: TreeNode): void {
    this.synopsisRequested.emit(node);
  }

  async importDocuments(): Promise<void> {
    this.importing.set(true);
    try {
      const results = await this.importService.openAndImport(null);
      if (results.length === 0) return;

      const allWarnings = results.flatMap(r => r.warnings);
      if (allWarnings.length > 0) {
        this.toast.success(
          `Importado con advertencias: ${allWarnings.join('; ')}`
        );
      } else {
        this.toast.success(
          results.length === 1
            ? `"${results[0].title}" importado correctamente.`
            : `${results.length} documentos importados correctamente.`
        );
      }

      const first = results[0];
      const node: TreeNode = {
        id: first.documentId,
        title: first.title,
        type: 'document',
        children: [],
      };
      this.documentOpened.emit(node);
    } finally {
      this.importing.set(false);
    }
  }
}
