import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { DocumentFile, Snapshot, EMPTY_TIPTAP_CONTENT } from '../models/document.model';
import { documentPath } from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  async loadDocument(id: string): Promise<DocumentFile> {
    const basePath = this.requireBasePath();
    const raw = await this.bridge.readJsonFile(documentPath(basePath, id));
    return JSON.parse(raw) as DocumentFile;
  }

  async saveDocument(doc: DocumentFile): Promise<DocumentFile> {
    const basePath = this.requireBasePath();
    const updated = { ...doc, updatedAt: new Date().toISOString() };
    await this.bridge.writeJsonFile(
      documentPath(basePath, updated.id),
      JSON.stringify(updated, null, 2),
    );
    return updated;
  }

  async createDocument(title: string, parentId: string | null = null): Promise<DocumentFile> {
    const node = await this.project.addNode('document', title, parentId);

    const doc: DocumentFile = {
      id: node.id,
      title,
      content: EMPTY_TIPTAP_CONTENT,
      snapshots: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.saveDocument(doc);
  }

  async deleteDocument(id: string): Promise<void> {
    const basePath = this.requireBasePath();
    await this.bridge.deleteJsonFile(documentPath(basePath, id));
    await this.project.removeNode(id);
  }

  createSnapshot(doc: DocumentFile, label?: string): DocumentFile {
    const maxSnapshots = this.project.project()?.settings.maxSnapshots ?? 10;

    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      content: structuredClone(doc.content),
      createdAt: new Date().toISOString(),
      label,
    };

    let snapshots = [...doc.snapshots, snapshot];

    if (snapshots.length > maxSnapshots) {
      snapshots = snapshots.slice(snapshots.length - maxSnapshots);
    }

    return { ...doc, snapshots };
  }

  restoreSnapshot(doc: DocumentFile, snapshotId: string): DocumentFile {
    const snapshot = doc.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} no encontrado`);

    const withCurrentSnapshot = this.createSnapshot(doc, 'Antes de restaurar');

    return {
      ...withCurrentSnapshot,
      content: structuredClone(snapshot.content),
    };
  }

  deleteSnapshot(doc: DocumentFile, snapshotId: string): DocumentFile {
    return {
      ...doc,
      snapshots: doc.snapshots.filter(s => s.id !== snapshotId),
    };
  }

  private requireBasePath(): string {
    const basePath = this.project.basePath();
    if (!basePath) throw new Error('No hay ningún proyecto abierto');
    return basePath;
  }
}
