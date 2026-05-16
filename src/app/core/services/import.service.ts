import { Injectable, inject } from '@angular/core';
import { generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { marked } from 'marked';
import mammoth from 'mammoth';
import { TauriBridgeService } from './tauri-bridge.service';
import { DocumentService } from './document.service';
import { ToastService } from '../../shared/services/toast.service';

export interface ImportResult {
  documentId: string;
  title: string;
  warnings: string[];
}

const SUPPORTED_EXTENSIONS = ['txt', 'md', 'docx', 'odt'];

@Injectable({ providedIn: 'root' })
export class ImportService {
  private bridge = inject(TauriBridgeService);
  private docSvc = inject(DocumentService);
  private toast = inject(ToastService);

  async openAndImport(parentId: string | null = null): Promise<ImportResult[]> {
    const paths = await this.bridge.openFilesDialog(SUPPORTED_EXTENSIONS, true);
    if (paths.length === 0) return [];

    const results: ImportResult[] = [];
    for (const path of paths) {
      try {
        const result = await this.importFile(path, parentId);
        results.push(result);
      } catch (e) {
        this.toast.error(`Error importando ${this.basename(path)}: ${e}`);
      }
    }
    return results;
  }

  async importFile(filePath: string, parentId: string | null = null): Promise<ImportResult> {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      throw new Error(`Formato no soportado: .${ext}`);
    }

    const title = this.titleFromPath(filePath);
    const warnings: string[] = [];
    let tiptapContent: object;

    if (ext === 'txt') {
      tiptapContent = await this.importTxt(filePath);
    } else if (ext === 'md') {
      tiptapContent = await this.importMarkdown(filePath);
    } else if (ext === 'odt') {
      const result = await this.importOdt(filePath);
      tiptapContent = result.content;
      warnings.push(...result.warnings);
    } else {
      const result = await this.importDocx(filePath);
      tiptapContent = result.content;
      warnings.push(...result.warnings);
    }

    const doc = await this.docSvc.createDocument(title, parentId);
    const saved = await this.docSvc.saveDocument({ ...doc, content: tiptapContent });
    return { documentId: saved.id, title: saved.title, warnings };
  }

  private async importTxt(filePath: string): Promise<object> {
    const raw = await this.bridge.readJsonFile(filePath);
    const paragraphs = raw.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);

    if (paragraphs.length === 0) {
      return { type: 'doc', content: [{ type: 'paragraph' }] };
    }

    return {
      type: 'doc',
      content: paragraphs.map(text => ({
        type: 'paragraph',
        content: text
          .split('\n')
          .flatMap((line, i, arr): object[] => {
            const nodes: object[] = [];
            if (line.length > 0) nodes.push({ type: 'text', text: line });
            if (i < arr.length - 1) nodes.push({ type: 'hardBreak' });
            return nodes;
          }),
      })),
    };
  }

  private async importMarkdown(filePath: string): Promise<object> {
    const raw = await this.bridge.readJsonFile(filePath);
    const html = marked.parse(raw) as string;
    return generateJSON(html, [StarterKit]);
  }

  private async importDocx(filePath: string): Promise<{ content: object; warnings: string[] }> {
    const bytes = await this.bridge.readFileBytes(filePath);
    const buffer = new Uint8Array(bytes).buffer;
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const warnings = result.messages
      .filter(m => m.type === 'warning')
      .map(m => m.message);
    const content = generateJSON(result.value, [StarterKit]);
    return { content, warnings };
  }

  private async importOdt(filePath: string): Promise<{ content: object; warnings: string[] }> {
    let tempDocxPath: string | null = null;
    try {
      tempDocxPath = await this.bridge.convertOdtToDocx(filePath);
      return await this.importDocx(tempDocxPath);
    } finally {
      if (tempDocxPath) {
        this.bridge.deleteJsonFile(tempDocxPath).catch(() => {});
      }
    }
  }

  private basename(path: string): string {
    return path.split('/').pop() ?? path;
  }

  private titleFromPath(filePath: string): string {
    const base = this.basename(filePath);
    const noExt = base.replace(/\.[^.]+$/, '');
    const cleaned = noExt.replace(/[-_]/g, ' ').trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
}
