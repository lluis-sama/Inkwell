import { Component, computed, input, output } from '@angular/core';
import { Card, CardConnection } from '../../../core/models/board.model';
import { prefersReducedMotion } from '../../../shared/utils/reduced-motion';

@Component({
  selector: 'app-connection-svg-overlay',
  standalone: true,
  imports: [],
  templateUrl: './connection-svg-overlay.component.html',
  styleUrl: './connection-svg-overlay.component.css',
})
export class ConnectionSvgOverlayComponent {
  protected readonly reducedMotion = prefersReducedMotion();

  connections = input.required<CardConnection[]>();
  cards = input.required<Card[]>();
  provisionalConnection = input<{ fromX: number; fromY: number; toX: number; toY: number; color: string } | null>(null);

  connectionSelected = output<CardConnection>();

  // ==================== CÁLCULO DE ANCLAJE ====================
  
  private getCardById(id: string): Card | undefined {
    return this.cards().find(c => c.id === id);
  }

  private getCardElement(cardId: string): HTMLElement | null {
    const host = document.querySelector(`[data-card-id="${cardId}"]`);
    if (!host) return null;
    return host.querySelector('.card-root') as HTMLElement | null;
  }

  private getCardDimensions(cardId: string): { width: number; height: number } | null {
    const el = this.getCardElement(cardId);
    if (!el) return null;
    return { width: el.offsetWidth, height: el.offsetHeight };
  }

  private getAnchorPoint(
    cardId: string,
    preferredSide: 'auto' | 'n' | 's' | 'e' | 'w',
    targetX: number,
    targetY: number,
  ): { x: number; y: number } {
    const card = this.getCardById(cardId);
    const dims = this.getCardDimensions(cardId);
    if (!card || !dims) return { x: targetX, y: targetY };

    const width = dims.width;
    const height = dims.height;
    const cx = card.x + width / 2;
    const cy = card.y + height / 2;

    let side: 'n' | 's' | 'e' | 'w';
    if (preferredSide !== 'auto') {
      side = preferredSide;
    } else {
      const distN = Math.hypot(cx - targetX, card.y - targetY);
      const distS = Math.hypot(cx - targetX, card.y + height - targetY);
      const distE = Math.hypot(card.x + width - targetX, cy - targetY);
      const distW = Math.hypot(card.x - targetX, cy - targetY);
      const min = Math.min(distN, distS, distE, distW);
      if (min === distN) side = 'n';
      else if (min === distS) side = 's';
      else if (min === distE) side = 'e';
      else side = 'w';
    }

    switch (side) {
      case 'n': return { x: cx, y: card.y };
      case 's': return { x: cx, y: card.y + height };
      case 'e': return { x: card.x + width, y: cy };
      case 'w': return { x: card.x, y: cy };
    }
  }

  // ==================== CÁLCULO DE RUTA SVG ====================

  getPathD(conn: CardConnection): string {
    const fromCard = this.getCardById(conn.fromCardId);
    const toCard = this.getCardById(conn.toCardId);
    if (!fromCard || !toCard) return '';

    const from = this.getAnchorPoint(conn.fromCardId, 'auto', toCard.x + toCard.width / 2, toCard.y + toCard.height / 2);
    const to = this.getAnchorPoint(conn.toCardId, 'auto', fromCard.x + fromCard.width / 2, fromCard.y + fromCard.height / 2);

    // Puntos de control: desplazamiento en la dirección DOMINANTE de la conexión
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      const controlDx = Math.abs(to.x - from.x) * 0.5;
      return `M ${from.x} ${from.y} C ${from.x + controlDx} ${from.y}, ${to.x - controlDx} ${to.y}, ${to.x} ${to.y}`;
    } else {
      const controlDy = Math.abs(to.y - from.y) * 0.5;
      return `M ${from.x} ${from.y} C ${from.x} ${from.y + controlDy}, ${to.x} ${to.y - controlDy}, ${to.x} ${to.y}`;
    }
  }

  // ==================== CÁLCULO DE FLECHA ====================

  getArrowPoints(conn: CardConnection): string {
    const toCard = this.getCardById(conn.toCardId);
    const toDims = this.getCardDimensions(conn.toCardId);
    if (!toCard || !toDims) return '';

    // Anchor point on destination card edge (using DOM dimensions)
    const to = this.getAnchorPoint(conn.toCardId, 'auto', 0, 0);
    // Center of destination card (using DOM dimensions)
    const cx = toCard.x + toDims.width / 2;
    const cy = toCard.y + toDims.height / 2;

    // Direction from anchor TOWARD card center
    const dirX = cx - to.x;
    const dirY = cy - to.y;
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / len;
    const ny = dirY / len;

    // Perpendicular
    const px = -ny;
    const py = nx;

    const tipLen = 10;
    const wingLen = 6;

    // Arrow BASE at the card edge (where the line ends)
    const baseX = to.x;
    const baseY = to.y;

    // Arrow TIP pointing inward toward center
    const tipX = to.x + nx * tipLen;
    const tipY = to.y + ny * tipLen;

    // Wings spread perpendicular from base (at card edge)
    const wing1X = baseX + px * wingLen;
    const wing1Y = baseY + py * wingLen;
    const wing2X = baseX - px * wingLen;
    const wing2Y = baseY - py * wingLen;

    return `${wing1X},${wing1Y} ${tipX},${tipY} ${wing2X},${wing2Y}`;
  }

  // ==================== CÁLCULO DE ETIQUETA ====================

  getLabelTransform(conn: CardConnection): string {
    const fromCard = this.getCardById(conn.fromCardId);
    const toCard = this.getCardById(conn.toCardId);
    if (!fromCard || !toCard) return '';

    const from = this.getAnchorPoint(conn.fromCardId, 'auto', toCard.x + toCard.width / 2, toCard.y + toCard.height / 2);
    const to = this.getAnchorPoint(conn.toCardId, 'auto', fromCard.x + fromCard.width / 2, fromCard.y + fromCard.height / 2);

    // Punto medio de la cuerda (aproximación del centro de la curva)
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;

    return `translate(${mx}, ${my})`;
  }

  // ==================== PROVISIONAL PATH ====================

  getProvisionalPathD(): string {
    const prov = this.provisionalConnection();
    if (!prov) return '';
    return `M ${prov.fromX} ${prov.fromY} L ${prov.toX} ${prov.toY}`;
  }

  // ==================== HANDLER DE CLICK ====================

  onConnectionClick(conn: CardConnection, event: MouseEvent): void {
    event.stopPropagation();
    this.connectionSelected.emit(conn);
  }
}
