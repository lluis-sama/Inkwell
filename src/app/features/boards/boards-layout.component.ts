import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { ProjectService } from '../../core/services/project.service';
import { BoardService } from '../../core/services/board.service';
import { ToastService } from '../../shared/services/toast.service';
import { BoardFile, Card, CardType } from '../../core/models/board.model';

import { InkNavComponent } from '../../shared/components/ink-nav.component';
import { BoardSelectorComponent } from './board-selector/board-selector.component';
import { BoardCanvasComponent } from './canvas/board-canvas.component';
import { NewBoardModalComponent } from './modals/new-board-modal.component';
import { CardEditorModalComponent } from './modals/card-editor-modal.component';

@Component({
  selector: 'app-boards-layout',
  standalone: true,
  imports: [
    InkNavComponent,
    BoardSelectorComponent,
    BoardCanvasComponent,
    NewBoardModalComponent,
    CardEditorModalComponent,
    TranslocoPipe,
  ],
  templateUrl: './boards-layout.component.html',
})
export class BoardsLayoutComponent implements OnInit {
  private projectService = inject(ProjectService);
  private boardService   = inject(BoardService);
  private toast          = inject(ToastService);
  private router         = inject(Router);

  boards            = signal<BoardFile[]>([]);
  activeBoard       = signal<BoardFile | null>(null);
  showNewBoardModal = signal(false);
  editingCard       = signal<Card | null>(null);
  isNewCard         = signal(false);

  async ngOnInit(): Promise<void> {
    if (!this.projectService.isLoaded()) {
      this.router.navigate(['/']);
      return;
    }
    await this.loadBoards();
  }

  private async loadBoards(): Promise<void> {
    try {
      const ids    = await this.boardService.listBoardIds();
      const loaded = await Promise.all(ids.map(id => this.boardService.loadBoard(id)));
      this.boards.set(loaded);
    } catch {
      this.toast.error('Error al cargar los tableros');
    }
  }

  selectBoard(board: BoardFile): void {
    this.activeBoard.set(board);
  }

  async onBoardCreated(board: BoardFile): Promise<void> {
    this.boards.update(bs => [...bs, board]);
    this.activeBoard.set(board);
    this.showNewBoardModal.set(false);
  }

  async deleteBoard(id: string): Promise<void> {
    try {
      await this.boardService.deleteBoard(id);
      this.boards.update(bs => bs.filter(b => b.id !== id));
      if (this.activeBoard()?.id === id) {
        this.activeBoard.set(null);
      }
    } catch {
      this.toast.error('Error al eliminar el tablero');
    }
  }

  async onCardAdded(event: { x: number; y: number; type: CardType }): Promise<void> {
    const board = this.activeBoard();
    if (!board) return;
    const updated = this.boardService.addCard(board, { x: event.x, y: event.y }, event.type);
    await this.persistBoard(updated);
    const currentBoard = this.activeBoard();
    if (!currentBoard) return;
    const newCard = currentBoard.cards[currentBoard.cards.length - 1];
    if (newCard) {
      this.editingCard.set(newCard);
      this.isNewCard.set(true);
    }
  }

  onEditRequested(card: Card): void {
    this.isNewCard.set(false);
    this.editingCard.set(card);
  }

  async onCardSaved(card: Card): Promise<void> {
    const board = this.activeBoard();
    if (!board) return;
    const updated = this.boardService.updateCard(board, card);
    await this.persistBoard(updated);
    this.isNewCard.set(false);
    this.editingCard.set(null);
  }

  async onCardEditCancelled(): Promise<void> {
    if (this.isNewCard()) {
      const card = this.editingCard();
      if (card) {
        await this.onDeleteCard(card.id);
      }
    }
    this.isNewCard.set(false);
    this.editingCard.set(null);
  }

  async onDeleteCard(cardId: string): Promise<void> {
    const board = this.activeBoard();
    if (!board) return;
    const updated = this.boardService.deleteCard(board, cardId);
    await this.persistBoard(updated);
  }

  async onPositionChanged(pos: { id: string; x: number; y: number }): Promise<void> {
    const board = this.activeBoard();
    if (!board) return;
    const card = board.cards.find(c => c.id === pos.id);
    if (!card) return;
    const updated = this.boardService.updateCard(board, { ...card, x: pos.x, y: pos.y });
    await this.persistBoard(updated);
  }

  private async persistBoard(board: BoardFile): Promise<void> {
    try {
      const saved = await this.boardService.saveBoard(board);
      this.activeBoard.set(saved);
      this.boards.update(bs => bs.map(b => b.id === saved.id ? saved : b));
    } catch {
      this.toast.error('Error al guardar el tablero');
    }
  }
}
