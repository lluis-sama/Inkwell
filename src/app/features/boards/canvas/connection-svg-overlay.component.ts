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
    
    // Acortar la línea 8px antes de la tarjeta destino para que no se meta debajo de la flecha
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const shorten = 8;
    const toLineX = to.x - (dx / dist) * shorten;
    const toLineY = to.y - (dy / dist) * shorten;

    const controlDx = Math.abs(toLineX - from.x) * 0.5;
    return `M ${from.x} ${from.y} C ${from.x + controlDx} ${from.y}, ${toLineX - controlDx} ${toLineY}, ${toLineX} ${toLineY}`;
  }

  // ==================== CÁLCULO DE FLECHA ====================

  private sampleBezier(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number,
  ): { x: number; y: number } {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
    };
  }

  getArrowPoints(conn: CardConnection): string {
    const fromCard = this.getCardById(conn.fromCardId);
    const toCard = this.getCardById(conn.toCardId);
    if (!fromCard || !toCard) return '';

    // Anchor points
    const from = this.getAnchorPoint(conn.fromCardId, 'auto', toCard.x + toCard.width / 2, toCard.y + toCard.height / 2);
    const to = this.getAnchorPoint(conn.toCardId, 'auto', fromCard.x + fromCard.width / 2, fromCard.y + fromCard.height / 2);

    // Shorten endpoint by 8px for the line
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const shorten = 8;
    const lineEndX = to.x - (dx / dist) * shorten;
    const lineEndY = to.y - (dy / dist) * shorten;

    // Bézier control points (same logic as getPathD)
    const controlDx = Math.abs(lineEndX - from.x) * 0.5;
    const cp1 = { x: from.x + controlDx, y: from.y };
    const cp2 = { x: lineEndX - controlDx, y: lineEndY };
    const p0 = from;
    const p3 = { x: lineEndX, y: lineEndY };

    // Sample a point just before the end to get the true visual tangent
    const sampled = this.sampleBezier(p0, cp1, cp2, p3, 0.92);

    // Direction from sampled point toward line end = curve direction at endpoint
    const dirX = p3.x - sampled.x;
    const dirY = p3.y - sampled.y;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / dirLen; // normalized direction the curve is heading at the end
    const ny = dirY / dirLen;

    // Perpendicular
    const px = -ny;
    const py = nx;

    const tipLen = 9;
    const wingLen = 6;

    // Arrow tip at the actual anchor point (on card edge), slightly inset so it doesn't overlap
    const inset = 2;
    const tipX = to.x - nx * inset;
    const tipY = to.y - ny * inset;

    // Arrow base behind the tip, along the curve direction
    const baseX = tipX - nx * tipLen;
    const baseY = tipY - ny * tipLen;

    // Wings spread perpendicular from base
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
