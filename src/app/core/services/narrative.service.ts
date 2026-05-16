import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { BoardService } from './board.service';
import { BoardFile, Card } from '../models/board.model';
import { DocumentFile } from '../models/document.model';
import { TreeNode } from '../models/project.model';
import { documentPath, boardPath } from '../../shared/utils/project-paths';

export interface NarrativeCard {
  id: string;
  title: string;
  synopsis: string;
  wordCount: number;
  characters: string[];
  isSection: boolean;
}

@Injectable({ providedIn: 'root' })
export class NarrativeService {
  private bridge         = inject(TauriBridgeService);
  private projectService = inject(ProjectService);
  private boardService   = inject(BoardService);

  async buildNarrativeCards(): Promise<NarrativeCard[]> {
    if (!this.projectService.isLoaded()) return [];

    const basePath = this.projectService.basePath();
    if (!basePath) return [];

    const project = this.projectService.project();
    if (!project) return [];

    // Load all boards, swallowing errors from listBoardIds
    let boardIds: string[] = [];
    try {
      boardIds = await this.boardService.listBoardIds();
    } catch {
      boardIds = [];
    }

    const boards: BoardFile[] = await Promise.all(
      boardIds.map(async id => {
        const raw = await this.bridge.readJsonFile(boardPath(basePath, id));
        return JSON.parse(raw) as BoardFile;
      }),
    );

    // Collect character cards that have characterData
    const characterCards: Card[] = boards.flatMap(board =>
      board.cards.filter(
        card => card.type === 'character' && card.characterData !== undefined,
      ),
    );

    // Flatten tree depth-first preorder
    const flatNodes = this.flattenTree(project.tree);

    // Build narrative cards in parallel for documents, folders are instant
    const narrativeCards = await Promise.all(
      flatNodes.map(async (node): Promise<NarrativeCard> => {
        if (node.type === 'folder') {
          return {
            id: node.id,
            title: node.title,
            synopsis: '',
            wordCount: 0,
            characters: [],
            isSection: true,
          };
        }

        // type === 'document'
        const wordCount = project.wordCountCache[node.id] ?? 0;
        const appearedCharacters = characterCards
          .filter(card => card.characterData!.appearsInChapters.includes(node.id))
          .map(card => card.title);

        let synopsis = '';
        try {
          const raw = await this.bridge.readJsonFile(documentPath(basePath, node.id));
          const doc = JSON.parse(raw) as DocumentFile;
          synopsis = doc.synopsis ?? '';
        } catch {
          synopsis = '';
        }

        return {
          id: node.id,
          title: node.title,
          synopsis,
          wordCount,
          characters: appearedCharacters,
          isSection: false,
        };
      }),
    );

    return narrativeCards;
  }

  private flattenTree(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...this.flattenTree(node.children));
      }
    }
    return result;
  }
}
