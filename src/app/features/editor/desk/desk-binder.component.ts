import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TreeNode } from '../../../core/models/project.model';
import { ProjectService } from '../../../core/services/project.service';
import { DocumentService } from '../../../core/services/document.service';

@Component({
  selector: 'ink-desk-binder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './desk-binder.component.html',
  styleUrl: './desk-binder.component.css',
})
export class DeskBinderComponent {
  private readonly project = inject(ProjectService);
  private readonly docService = inject(DocumentService);

  tree = input<TreeNode[]>([]);
  activeId = input<string | null>(null);

  documentSelected = output<string>();
  treeChanged = output<void>();

  selectDocument(id: string): void {
    this.documentSelected.emit(id);
  }

  async newDocument(): Promise<void> {
    const title = `Nota ${new Date().toLocaleDateString('es-ES')}`;
    await this.docService.createDocumentInDesk(title, '');
    this.treeChanged.emit();
  }

  async deleteNode(node: TreeNode): Promise<void> {
    if (node.type === 'document') {
      await this.docService.deleteDeskDocument(node.id);
    }
    this.treeChanged.emit();
  }
}
