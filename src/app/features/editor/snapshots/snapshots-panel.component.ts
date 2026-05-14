import { Component, inject, input, output, signal, computed } from '@angular/core';
import { DocumentFile, Snapshot } from '../../../core/models/document.model';
import { DocumentService } from '../../../core/services/document.service';
import { ToastService } from '../../../shared/services/toast.service';
import { tiptapToText } from '../../../shared/utils/tiptap-to-text';

@Component({
  selector: 'app-snapshots-panel',
  standalone: true,
  imports: [],
  templateUrl: './snapshots-panel.component.html',
})
export class SnapshotsPanelComponent {
  private docService = inject(DocumentService);
  protected toastService = inject(ToastService);

  // Signal input REQUIRED — nunca null cuando el panel está visible
  document = input.required<DocumentFile>();
  maxSnapshots = input<number>(10);

  // Outputs
  closed = output<void>();
  documentChanged = output<DocumentFile>();

  // Signals internos
  expandedId = signal<string | null>(null);
  editingId = signal<string | null>(null);
  editingLabel = signal<string>('');

  // Computed: snapshots en orden inverso (más reciente primero)
  snapshots = computed(() => [...this.document().snapshots].reverse());

  // Toggle preview
  togglePreview(id: string): void {
    this.expandedId.update(current => current === id ? null : id);
  }

  // Preview text
  previewText(snapshot: Snapshot): string {
    return tiptapToText(snapshot.content) || '(Documento vacío)';
  }

  // Edición de label
  startEdit(snapshot: Snapshot): void {
    this.editingId.set(snapshot.id);
    this.editingLabel.set(snapshot.label ?? '');
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editingLabel.set('');
  }

  onLabelInput(event: Event): void {
    this.editingLabel.set((event.target as HTMLInputElement).value);
  }

  onLabelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') { this.confirmEdit(); }
    if (event.key === 'Escape') { this.cancelEdit(); }
  }

  async confirmEdit(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    const doc = this.document();
    const label = this.editingLabel().trim() || undefined;
    const updated: DocumentFile = {
      ...doc,
      snapshots: doc.snapshots.map(s => s.id === id ? { ...s, label } : s),
    };
    this.editingId.set(null);
    this.editingLabel.set('');
    try {
      const saved = await this.docService.saveDocument(updated);
      this.documentChanged.emit(saved);
    } catch (e) {
      this.toastService.error(`Error al guardar etiqueta: ${e}`);
    }
  }

  // Restaurar snapshot
  async restore(snapshotId: string): Promise<void> {
    const doc = this.document();
    try {
      const restored = this.docService.restoreSnapshot(doc, snapshotId);
      const saved = await this.docService.saveDocument(restored);
      this.documentChanged.emit(saved);
      this.toastService.success('Snapshot restaurado');
    } catch (e) {
      this.toastService.error(`Error al restaurar: ${e}`);
    }
  }

  // Eliminar snapshot
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const doc = this.document();
    try {
      const updated = this.docService.deleteSnapshot(doc, snapshotId);
      const saved = await this.docService.saveDocument(updated);
      if (this.expandedId() === snapshotId) this.expandedId.set(null);
      this.documentChanged.emit(saved);
    } catch (e) {
      this.toastService.error(`Error al eliminar snapshot: ${e}`);
    }
  }

  // Formatear fecha
  formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMs / 3600000);
    if (mins < 1) return 'Ahora mismo';
    if (mins < 60) return `Hace ${mins} min`;
    if (hrs < 24) return `Hace ${hrs}h · ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
