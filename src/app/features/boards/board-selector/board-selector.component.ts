import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { BoardFile } from '../../../core/models/board.model';

@Component({
  selector: 'app-board-selector',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './board-selector.component.html',
})
export class BoardSelectorComponent {
  boards = input<BoardFile[]>([]);
  activeBoard = input<BoardFile | null>(null);

  boardSelected = output<BoardFile>();
  createRequested = output<void>();
  deleteRequested = output<string>();
}
