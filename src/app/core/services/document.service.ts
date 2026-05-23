import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { parse as parseMarkdown } from 'marked';
import { generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { SearchService } from './search.service';
import { DocumentFile, Snapshot, EMPTY_TIPTAP_CONTENT } from '../models/document.model';
import { TreeNode } from '../models/project.model';
import { documentPath, deskNotePath } from '../../shared/utils/project-paths';
import { tiptapToText } from '../../shared/utils/tiptap-to-text';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private bridge         = inject(TauriBridgeService);
  private project        = inject(ProjectService);
  private searchService  = inject(SearchService);
  private readonly translocoService = inject(TranslocoService);

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
    this.project.updateWordCountCache(updated.id, this.countWords(updated)).catch(() => {});
    this.searchService.invalidate(updated.id);
    return updated;
  }

  private countWords(doc: DocumentFile): number {
    return tiptapToText(doc.content).trim().split(/\s+/).filter(w => w.length > 0).length;
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
    if (!snapshot) throw new Error(this.translocoService.translate('DOC.SNAPSHOT_NOT_FOUND', { id: snapshotId }));

    const withCurrentSnapshot = this.createSnapshot(doc, this.translocoService.translate('DOC.SNAPSHOT_LABEL'));

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

  async createDocumentInDesk(title: string, content: string): Promise<TreeNode> {
    const basePath = this.project.basePath();
    if (!basePath) throw new Error('No project open');
    const id = crypto.randomUUID();
    const html = parseMarkdown(content) as string;
    const tiptapContent = generateJSON(html, [StarterKit]);
    const doc: DocumentFile = {
      id,
      title,
      content: tiptapContent,
      snapshots: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.bridge.writeJsonFile(deskNotePath(basePath, id), JSON.stringify(doc, null, 2));
    return { id, title, type: 'document', children: [] };
  }

  async loadDeskDocument(id: string): Promise<DocumentFile> {
    const basePath = this.requireBasePath();
    const raw = await this.bridge.readJsonFile(deskNotePath(basePath, id));
    return JSON.parse(raw) as DocumentFile;
  }

  async saveDeskDocument(doc: DocumentFile): Promise<void> {
    const basePath = this.requireBasePath();
    const updated = { ...doc, updatedAt: new Date().toISOString() };
    await this.bridge.writeJsonFile(deskNotePath(basePath, updated.id), JSON.stringify(updated, null, 2));
  }

  async deleteDeskDocument(id: string): Promise<void> {
    const basePath = this.project.basePath();
    if (!basePath) throw new Error('No project open');
    await this.bridge.deleteJsonFile(deskNotePath(basePath, id));
  }

  private requireBasePath(): string {
    const basePath = this.project.basePath();
    if (!basePath) throw new Error(this.translocoService.translate('COMMON.NO_PROJECT_OPEN'));
    return basePath;
  }
}
