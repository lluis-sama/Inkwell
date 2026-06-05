import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { BoardFile, Card, CardType, CardConnection, DEFAULT_COLORS_BY_TYPE } from '../models/board.model';
import { boardPath, boardsFolderPath } from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class BoardService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);
  private readonly translocoService = inject(TranslocoService);

  async loadBoard(id: string): Promise<BoardFile> {
    const basePath = this.requireBasePath();
    const raw = await this.bridge.readJsonFile(boardPath(basePath, id));
    const board = JSON.parse(raw) as BoardFile;
    board.cards = board.cards.map(c => ({ ...c, type: c.type ?? 'note' }));
    board.connections = board.connections ?? [];
    return board;
  }

  async saveBoard(board: BoardFile): Promise<BoardFile> {
    const basePath = this.requireBasePath();
    const updated = { ...board, updatedAt: new Date().toISOString() };
    await this.bridge.writeJsonFile(
      boardPath(basePath, updated.id),
      JSON.stringify(updated, null, 2),
    );
    return updated;
  }

  async createBoard(title: string): Promise<BoardFile> {
    const board: BoardFile = {
      id: crypto.randomUUID(),
      title,
      cards: [],
      connections: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.saveBoard(board);
  }

  async deleteBoard(id: string): Promise<void> {
    const basePath = this.requireBasePath();
    await this.bridge.deleteJsonFile(boardPath(basePath, id));
  }

  async listBoardIds(): Promise<string[]> {
    const basePath = this.requireBasePath();
    return this.bridge.listJsonFiles(boardsFolderPath(basePath));
  }

  addCard(
    board: BoardFile,
    position: { x: number; y: number },
    type: CardType = 'note',
    title = 'Nueva tarjeta',
  ): BoardFile {
    const color = DEFAULT_COLORS_BY_TYPE[type];

    const card: Card = {
      id: crypto.randomUUID(),
      title,
      body: '',
      color,
      type,
      x: position.x,
      y: position.y,
      width: 320,
      height: 160,
    };

    return { ...board, cards: [...board.cards, card] };
  }

  updateCard(board: BoardFile, updatedCard: Card): BoardFile {
    return {
      ...board,
      cards: board.cards.map(c => c.id === updatedCard.id ? updatedCard : c),
    };
  }

  deleteCard(board: BoardFile, cardId: string): BoardFile {
    return {
      ...board,
      cards: board.cards.filter(c => c.id !== cardId),
    };
  }

  addConnection(
    board: BoardFile,
    fromCardId: string,
    toCardId: string,
    label = '',
    color = '#a78bfa',
  ): BoardFile {
    const connection: CardConnection = {
      id: crypto.randomUUID(),
      fromCardId,
      toCardId,
      label: label || undefined,
      color,
    };
    return {
      ...board,
      connections: [...board.connections, connection],
    };
  }

  updateConnection(board: BoardFile, updated: CardConnection): BoardFile {
    return {
      ...board,
      connections: board.connections.map(c =>
        c.id === updated.id ? updated : c,
      ),
    };
  }

  deleteConnection(board: BoardFile, connectionId: string): BoardFile {
    return {
      ...board,
      connections: board.connections.filter(c => c.id !== connectionId),
    };
  }

  private requireBasePath(): string {
    const basePath = this.project.basePath();
    if (!basePath) throw new Error(this.translocoService.translate('COMMON.NO_PROJECT_OPEN'));
    return basePath;
  }
}
