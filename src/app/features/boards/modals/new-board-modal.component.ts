import { Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { InkModalComponent } from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';
import { BoardService } from '../../../core/services/board.service';
import { BoardFile } from '../../../core/models/board.model';

@Component({
  selector: 'app-new-board-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule, TranslocoPipe],
  templateUrl: './new-board-modal.component.html',
})
export class NewBoardModalComponent {
  private boardService = inject(BoardService);

  created   = output<BoardFile>();
  cancelled = output<void>();

  title    = '';
  creating = signal(false);
  error    = signal<string | null>(null);

  async create(): Promise<void> {
    if (!this.title.trim()) return;

    this.creating.set(true);
    this.error.set(null);

    try {
      const board = await this.boardService.createBoard(this.title.trim());
      this.created.emit(board);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.creating.set(false);
    }
  }
}
