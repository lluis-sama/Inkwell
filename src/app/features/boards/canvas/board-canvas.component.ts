import { Component, ElementRef, ViewChild, input, output, signal } from '@angular/core';
import { BoardFile, Card, CardType, CARD_TYPE_LABELS, CARD_TYPE_ICONS } from '../../../core/models/board.model';
import { BoardCardComponent } from './board-card.component';

@Component({
  selector: 'app-board-canvas',
  standalone: true,
  imports: [BoardCardComponent],
  templateUrl: './board-canvas.component.html',
  host: {
    '(document:click)': 'contextMenu.set(null)',
    '(document:keydown.escape)': 'contextMenu.set(null)',
    class: 'flex flex-col flex-1 overflow-hidden',
  },
})
export class BoardCanvasComponent {
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLDivElement>;

  board = input.required<BoardFile>();

  readonly cardTypes: CardType[] = ['character', 'note', 'research', 'other'];
  readonly typeLabels = CARD_TYPE_LABELS;
  readonly typeIcons = CARD_TYPE_ICONS;

  positionChanged = output<{ id: string; x: number; y: number }>();
  cardAdded = output<{ x: number; y: number; type: CardType }>();
  editRequested = output<Card>();
  deleteRequested = output<string>();

  contextMenu = signal<{
    screenX: number;
    screenY: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  onCanvasRightClick(event: MouseEvent): void {
    event.preventDefault();
    const rect = this.canvasEl.nativeElement.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    this.contextMenu.set({
      screenX: event.clientX,
      screenY: event.clientY,
      canvasX,
      canvasY,
    });
  }

  onAddCard(type: CardType): void {
    const pos = this.contextMenu();
    this.contextMenu.set(null);
    if (pos) {
      this.cardAdded.emit({ x: pos.canvasX, y: pos.canvasY, type });
    }
  }

  onPositionChanged(pos: { id: string; x: number; y: number }): void {
    this.positionChanged.emit(pos);
  }
}
