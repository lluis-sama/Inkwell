import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { DocumentFile }       from '../models/document.model';
import { tiptapToText }       from '../../shared/utils/tiptap-to-text';
import { documentPath, documentsFolderPath } from '../../shared/utils/project-paths';

export interface ChapterAppearance {
  documentId:    string;
  documentTitle: string;
  matchCount:    number;
}

@Injectable({ providedIn: 'root' })
export class CharacterScanService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  /**
   * Escanea todos los documentos del proyecto buscando apariciones
   * del personaje por nombre (y aliases opcionales).
   * Usa coincidencia de palabra completa (\b) para evitar falsos positivos.
   */
  async scanCharacter(
    name: string,
    aliases: string[] = [],
  ): Promise<ChapterAppearance[]> {
    const basePath = this.project.basePath();
    if (!basePath || !name.trim()) return [];

    const terms   = [name, ...aliases].filter(t => t.trim().length > 0);
    const pattern = this.buildPattern(terms);
    const ids     = await this.bridge.listJsonFiles(documentsFolderPath(basePath));
    const results: ChapterAppearance[] = [];

    for (const id of ids) {
      try {
        const raw   = await this.bridge.readJsonFile(documentPath(basePath, id));
        const doc: DocumentFile = JSON.parse(raw);
        const text  = tiptapToText(doc.content);

        pattern.lastIndex = 0;
        const matches = text.match(pattern);

        if (matches && matches.length > 0) {
          results.push({
            documentId:    id,
            documentTitle: doc.title,
            matchCount:    matches.length,
          });
        }
      } catch { /* ignorar documentos que no se puedan leer */ }
    }

    return results;
  }

  private buildPattern(terms: string[]): RegExp {
    const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(
      escaped.map(t => `\\b${t}\\b`).join('|'),
      'gi',
    );
  }
}
