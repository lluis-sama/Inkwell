import { Component, input, output, viewChild, afterNextRender, effect, ElementRef, OnDestroy } from '@angular/core';
import { Card, CardConnection } from '../../../core/models/board.model';
import { prefersReducedMotion } from '../../../shared/utils/reduced-motion';

@Component({
  selector: 'app-connection-svg-overlay',
  standalone: true,
  imports: [],
  templateUrl: './connection-svg-overlay.component.html',
  styleUrl: './connection-svg-overlay.component.css',
})
export class ConnectionSvgOverlayComponent implements OnDestroy {
  protected readonly reducedMotion = prefersReducedMotion();

  connections = input.required<CardConnection[]>();
  cards = input.required<Card[]>();
  provisionalConnection = input<{ fromX: number; fromY: number; toX: number; toY: number; color: string } | null>(null);
  paused = input<boolean>(false);

  connectionSelected = output<CardConnection>();

  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svgRef');
  private readonly pathAnimations = new Map<SVGPathElement, Animation>();

  constructor() {
    afterNextRender(() => this.setupPillAnimations());

    effect(() => {
      // Track connection changes (add/remove/update)
      this.connections();
      // Wait for Angular to render the updated DOM before querying paths
      requestAnimationFrame(() => this.setupPillAnimations());
    });

    effect(() => {
      if (this.reducedMotion() || this.paused()) {
        this.pauseAllAnimations();
      } else {
        this.resumeAllAnimations();
      }
    });
  }

  ngOnDestroy(): void {
    this.cancelAllAnimations();
  }

  private setupPillAnimations(): void {
    this.cancelAllAnimations();
    if (this.reducedMotion()) return;

    const svg = this.svgRef().nativeElement;
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>('.connection-flow'));

    for (const path of paths) {
      const length = path.getTotalLength();
      const pillLen = 18;
      const gap = Math.max(length, pillLen);
      path.style.strokeDasharray = `${pillLen} ${gap}`;

      const anim = path.animate(
        [
          { strokeDashoffset: '0' },
          { strokeDashoffset: `-${length + pillLen}` },
        ],
        {
          duration: 2000,
          iterations: Infinity,
          easing: 'linear',
        }
      );

      this.pathAnimations.set(path, anim);
    }

    if (this.paused()) {
      this.pauseAllAnimations();
    }
  }

  private cancelAllAnimations(): void {
    this.pathAnimations.forEach(anim => anim.cancel());
    this.pathAnimations.clear();
  }

  private pauseAllAnimations(): void {
    this.pathAnimations.forEach(anim => anim.pause());
  }

  private resumeAllAnimations(): void {
    this.pathAnimations.forEach(anim => {
      if (anim.playState === 'paused') {
        anim.play();
      }
    });
  }

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

  private readonly labelCtx = (() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = '500 14px sans-serif';
    return ctx;
  })();

  getLabelWidth(label: string): number {
    return this.labelCtx.measureText(label).width;
  }

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
