import { Component, computed, effect, input, output, signal } from '@angular/core';
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
  board = input.required<BoardFile>();

  readonly cardTypes: CardType[] = ['character', 'note', 'research', 'other'];
  readonly typeLabels = CARD_TYPE_LABELS;
  readonly isMac = signal(false);
  readonly hintCollapsed = signal(false);
  private hintTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.isMac.set(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
    this.hintTimer = setTimeout(() => this.hintCollapsed.set(true), 5000);
  }

  onHintClick(): void {
    if (this.hintCollapsed()) {
      this.hintCollapsed.set(false);
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => this.hintCollapsed.set(true), 5000);
    }
  }

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
    worldX: number;
    worldY: number;
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

  // ==================== PANNING + ZOOM ====================

  panOffset = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  zoom = signal(1.0);
  private readonly ZOOM_MIN = 0.1;
  private readonly ZOOM_MAX = 3.0;

  private isPanning = false;
  private panStart = { x: 0, y: 0, clientX: 0, clientY: 0 };

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

  // Coordinates relative to the pan-layer (world coordinates)
  readonly selectedConnectionScreenLeft = computed(() => {
    const conn = this.selectedConnection();
    if (!conn) return 0;
    const from = this.getCardById(conn.fromCardId);
    const to = this.getCardById(conn.toCardId);
    if (!from || !to) return 0;
    return (from.x + from.width / 2 + to.x + to.width / 2) / 2;
  });

  readonly selectedConnectionScreenTop = computed(() => {
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
    const trimmed = label.trim();
    const updated: CardConnection = { ...conn, label: trimmed || undefined };
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

  // ==================== PANNING ====================

  onCanvasMouseDown(event: MouseEvent): void {
    // Middle mouse button (button 1) starts panning
    if (event.button === 1) {
      event.preventDefault();
      this.isPanning = true;
      const pan = this.panOffset();
      this.panStart = {
        x: pan.x,
        y: pan.y,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    }
  }

  onWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.min(this.ZOOM_MAX, Math.max(this.ZOOM_MIN, this.zoom() + delta));
    this.zoom.set(Math.round(newZoom * 10) / 10);
  }

  // ==================== RIGHT-CLICK CONTEXT MENU ====================

  onCanvasRightClick(event: MouseEvent): void {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const z = this.zoom();
    const worldX = (event.clientX - rect.left - this.panOffset().x) / z;
    const worldY = (event.clientY - rect.top - this.panOffset().y) / z;
    this.contextMenu.set({
      screenX: event.clientX,
      screenY: event.clientY,
      worldX,
      worldY,
    });
  }

  onAddCard(type: CardType): void {
    const pos = this.contextMenu();
    this.contextMenu.set(null);
    if (pos) {
      this.cardAdded.emit({ x: pos.worldX, y: pos.worldY, type });
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
    this.isPanning = false;
    this.provisionalConnection.set(null);
  }

  onImageRequested(card: Card): void {
    this.imageRequested.emit(card);
  }

  // ==================== CONNECTIONS ====================

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
    // Panning
    if (this.isPanning) {
      const dx = event.clientX - this.panStart.clientX;
      const dy = event.clientY - this.panStart.clientY;
      this.panOffset.set({
        x: this.panStart.x + dx,
        y: this.panStart.y + dy,
      });
      return;
    }

    // Provisional connection
    const prov = this.provisionalConnection();
    if (!prov) return;

    const viewport = document.querySelector('.viewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const z = this.zoom();
    const worldX = (event.clientX - rect.left - this.panOffset().x) / z;
    const worldY = (event.clientY - rect.top - this.panOffset().y) / z;

    this.provisionalConnection.set({
      ...prov,
      toX: worldX,
      toY: worldY,
      color: prov.color,
    });
  }

  onDocumentMouseUp(event: MouseEvent): void {
    // Stop panning
    if (this.isPanning) {
      this.isPanning = false;
    }

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
