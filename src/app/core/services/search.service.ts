import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { DocumentFile } from '../models/document.model';
import { TreeNode } from '../models/project.model';
import { tiptapToText } from '../../shared/utils/tiptap-to-text';
import { documentPath, documentsFolderPath } from '../../shared/utils/project-paths';

export interface SearchMatch {
  context: string;
  matchIndex: number;
}

export interface SearchResult {
  documentId: string;
  documentTitle: string;
  matches: SearchMatch[];
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private bridge = inject(TauriBridgeService);
  private projectService = inject(ProjectService);

  private textCache = new Map<string, string>();

  private readonly CONTEXT_RADIUS = 60;
  private readonly MAX_MATCHES_PER_DOC = 5;

  invalidate(documentId: string): void {
    this.textCache.delete(documentId);
  }

  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async getDocumentText(basePath: string, id: string): Promise<string> {
    if (this.textCache.has(id)) {
      return this.textCache.get(id)!;
    }

    try {
      const raw = await this.bridge.readJsonFile(documentPath(basePath, id));
      const doc: DocumentFile = JSON.parse(raw);
      const text = tiptapToText(doc.content);
      this.textCache.set(id, text);
      return text;
    } catch {
      return '';
    }
  }

  private getDocumentTitle(id: string): string {
    const tree = this.projectService.project()?.tree ?? [];
    const node = this.findNode(tree, id);
    return node ? node.title : id;
  }

  private findNode(tree: TreeNode[], id: string): TreeNode | null {
    for (const node of tree) {
      if (node.id === id) return node;
      const found = this.findNode(node.children, id);
      if (found) return found;
    }
    return null;
  }

  private findMatches(text: string, pattern: RegExp): SearchMatch[] {
    const results: SearchMatch[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null && results.length < this.MAX_MATCHES_PER_DOC) {
      const start = match.index;
      const contextStart = Math.max(0, start - this.CONTEXT_RADIUS);
      const contextEnd = Math.min(text.length, start + match[0].length + this.CONTEXT_RADIUS);

      let context = text.slice(contextStart, contextEnd);
      if (contextStart > 0) context = '…' + context;
      if (contextEnd < text.length) context = context + '…';

      results.push({ context, matchIndex: start });
    }

    return results;
  }

  async search(query: string, wholeWord = true): Promise<SearchResult[]> {
    if (query.trim() === '') return [];

    const basePath = this.projectService.basePath();
    if (!basePath) return [];

    const files = await this.bridge.listJsonFiles(documentsFolderPath(basePath));
    const results: SearchResult[] = [];
    const escaped = this.escapeRegExp(query.trim());
    const pattern = wholeWord
      ? new RegExp(`\\b${escaped}\\b`, 'gi')
      : new RegExp(escaped, 'gi');

    for (const file of files) {
      const documentId = file.split('/').pop()!.replace('.json', '');
      pattern.lastIndex = 0;

      const text = await this.getDocumentText(basePath, documentId);
      const matches = this.findMatches(text, pattern);

      if (matches.length > 0) {
        results.push({
          documentId,
          documentTitle: this.getDocumentTitle(documentId),
          matches,
        });
      }
    }

    return results;
  }
}
