import { Component, ElementRef, ViewChild, computed, input, output, signal } from '@angular/core';
import { BoardFile, Card, CardConnection, CardType, CARD_TYPE_LABELS } from '../../../core/models/board.model';
import { TranslocoPipe } from '@jsverse/transloco';
import { BoardCardComponent } from './board-card.component';
import { ConnectionSvgOverlayComponent } from './connection-svg-overlay.component';
import { ConnectionEditorPopoverComponent } from './connection-editor-popover.component';

@Component({
  selector: 'app-board-canvas',
  standalone: true,
  imports: [BoardCardComponent, ConnectionSvgOverlayComponent, ConnectionEditorPopoverComponent, TranslocoPipe],
  templateUrl: './board-canvas.component.html',
  host: {
    '(document:click)': 'contextMenu.set(null)',
    '(document:keydown.escape)': 'onDocumentEscape()',
    '(document:mousemove)': 'onDocumentMouseMove($event)',
    '(document:mouseup)': 'onDocumentMouseUp($event)',
    class: 'flex flex-col flex-1 overflow-hidden',
  },
})
export class BoardCanvasComponent {
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLDivElement>;

  board = input.required<BoardFile>();

  readonly cardTypes: CardType[] = ['character', 'note', 'research', 'other'];
  readonly typeLabels = CARD_TYPE_LABELS;

  positionChanged = output<{ id: string; x: number; y: number }>();
  cardAdded = output<{ x: number; y: number; type: CardType }>();
  editRequested = output<Card>();
  deleteRequested = output<string>();
  imageRequested = output<Card>();

  connectionAdded = output<CardConnection>();
  connectionUpdated = output<CardConnection>();
  connectionDeleted = output<string>();

  contextMenu = signal<{
    screenX: number;
    screenY: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  provisionalConnection = signal<{
    fromCardId: string;
    fromSide: 'n' | 's' | 'e' | 'w';
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    color: string;
  } | null>(null);

  selectedConnection = signal<CardConnection | null>(null);

  private movingPositions = signal<Record<string, { x: number; y: number }>>({});

  readonly cardsWithLivePositions = computed<Card[]>(() => {
    const board = this.board();
    const moves = this.movingPositions();
    return board.cards.map(card => {
      const move = moves[card.id];
      if (move) {
        return { ...card, x: move.x, y: move.y };
      }
      return card;
    });
  });

  private getCardById(id: string): Card | undefined {
    return this.cardsWithLivePositions().find(c => c.id === id);
  }

  readonly selectedConnectionLeft = computed(() => {
    const conn = this.selectedConnection();
    if (!conn) return 0;
    const from = this.getCardById(conn.fromCardId);
    const to = this.getCardById(conn.toCardId);
    if (!from || !to) return 0;
    return (from.x + from.width / 2 + to.x + to.width / 2) / 2;
  });

  readonly selectedConnectionTop = computed(() => {
    const conn = this.selectedConnection();
    if (!conn) return 0;
    const from = this.getCardById(conn.fromCardId);
    const to = this.getCardById(conn.toCardId);
    if (!from || !to) return 0;
    return (from.y + from.height / 2 + to.y + to.height / 2) / 2;
  });

  onConnectionLabelChanged(label: string): void {
    const conn = this.selectedConnection();
    if (!conn) return;
    const updated: CardConnection = { ...conn, label: label || undefined };
    this.selectedConnection.set(updated);
    this.connectionUpdated.emit(updated);
  }

  onConnectionColorChanged(color: string): void {
    const conn = this.selectedConnection();
    if (!conn) return;
    const updated: CardConnection = { ...conn, color };
    this.selectedConnection.set(updated);
    this.connectionUpdated.emit(updated);
  }

  onConnectionDeleteRequested(): void {
    const conn = this.selectedConnection();
    if (!conn) return;
    this.selectedConnection.set(null);
    this.connectionDeleted.emit(conn.id);
  }

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
    if (!this.provisionalConnection()) {
      this.movingPositions.update(m => ({ ...m, [pos.id]: { x: pos.x, y: pos.y } }));
    }
    this.positionChanged.emit(pos);
  }

  onDocumentEscape(): void {
    this.contextMenu.set(null);
    this.selectedConnection.set(null);
  }

  onImageRequested(card: Card): void {
    this.imageRequested.emit(card);
  }

  onConnectionStarted(event: { cardId: string; side: 'n' | 's' | 'e' | 'w'; x: number; y: number }): void {
    this.contextMenu.set(null);
    this.selectedConnection.set(null);
    this.provisionalConnection.set({
      fromCardId: event.cardId,
      fromSide: event.side,
      fromX: event.x,
      fromY: event.y,
      toX: event.x,
      toY: event.y,
      color: '#a78bfa',
    });
  }

  onConnectionSelected(conn: CardConnection): void {
    this.selectedConnection.set(conn);
  }

  onDocumentMouseMove(event: MouseEvent): void {
    const prov = this.provisionalConnection();
    if (!prov) return;

    const rect = this.canvasEl.nativeElement.getBoundingClientRect();
    this.provisionalConnection.set({
      ...prov,
      toX: event.clientX - rect.left,
      toY: event.clientY - rect.top,
      color: prov.color,
    });
  }

  onDocumentMouseUp(event: MouseEvent): void {
    this.movingPositions.set({});

    const prov = this.provisionalConnection();
    if (!prov) return;

    this.provisionalConnection.set(null);

    // Detectar si se soltó sobre otra tarjeta
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const cardEl = elements
      .map(el => el.closest('[data-card-id]'))
      .find((el): el is HTMLElement => el !== null) as HTMLElement | undefined;

    if (!cardEl) return;

    const toCardId = cardEl.getAttribute('data-card-id')!;
    if (toCardId === prov.fromCardId) return;

    // Verificar si ya existe una conexión A→B
    const existing = this.board().connections.find(
      c => c.fromCardId === prov.fromCardId && c.toCardId === toCardId
    );

    if (existing) {
      this.selectedConnection.set(existing);
    } else {
      const newConn: CardConnection = {
        id: crypto.randomUUID(),
        fromCardId: prov.fromCardId,
        toCardId,
        color: '#a78bfa',
      };
      this.connectionAdded.emit(newConn);
      this.selectedConnection.set(newConn);
    }
  }
}
