import { Component, ElementRef, OnDestroy, OnInit, AfterViewInit, ViewChild, computed, input, output, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import interact from 'interactjs';
import { Card, CardType, CARD_TYPE_LABELS } from '../../../core/models/board.model';
import { contrastTextColor } from '../utils/board-card.utils';
import { ProjectService, findNode } from '../../../core/services/project.service';

@Component({
  selector: 'app-board-card',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './board-card.component.html',
  styleUrl: './board-card.component.css',
})
export class BoardCardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cardEl', { static: true }) cardEl!: ElementRef<HTMLDivElement>;

  private readonly projectService = inject(ProjectService);

  card = input.required<Card>();
  zoom = input(1.0);

  positionChanged = output<{ id: string; x: number; y: number }>();
  editRequested = output<Card>();
  deleteRequested = output<string>();
  imageRequested = output<Card>();
  connectionStarted = output<{ cardId: string; side: 'n' | 's' | 'e' | 'w'; x: number; y: number }>();

  readonly typeLabels = CARD_TYPE_LABELS;

  chapterCount = computed(() =>
    this.card().characterData?.appearsInChapters.length ?? 0
  );

  hasImage = computed(() => !!this.card().imageData);

  protected readonly textColor = computed(() =>
    this.hasImage() ? '#f5f5f5' : contrastTextColor(this.card().color)
  );

  protected getDocumentTitle(docId: string): string {
    const tree = this.projectService.project()?.tree ?? [];
    const node = findNode(tree, docId);
    return node?.title ?? docId;
  }

  protected startConnection(side: 'n' | 's' | 'e' | 'w', event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();

    const card = this.card();

    let anchorX = card.x;
    let anchorY = card.y;

    switch (side) {
      case 'n':
        anchorX += card.width / 2;
        break;
      case 's':
        anchorX += card.width / 2;
        anchorY += card.height;
        break;
      case 'e':
        anchorX += card.width;
        anchorY += card.height / 2;
        break;
      case 'w':
        anchorY += card.height / 2;
        break;
    }

    this.connectionStarted.emit({ cardId: card.id, side, x: anchorX, y: anchorY });
  }

  private interactable: ReturnType<typeof interact> | null = null;
  private aspectObserver: ResizeObserver | null = null;

  ngOnInit(): void {
    this.interactable = interact(this.cardEl.nativeElement).draggable({
      ignoreFrom: '.anchor, .card-action-btn, .card-image-btn',
      listeners: {
        move: (event) => {
          const el = event.target as HTMLElement;
          const z = this.zoom();
          const x = (parseFloat(el.style.left) || 0) + event.dx / z;
          const y = (parseFloat(el.style.top) || 0) + event.dy / z;
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          this.positionChanged.emit({ id: this.card().id, x, y });
        },
        end: (event) => {
          const el = event.target as HTMLElement;
          this.positionChanged.emit({
            id: this.card().id,
            x: parseFloat(el.style.left) || 0,
            y: parseFloat(el.style.top) || 0,
          });
        },
      },

    });
  }

  ngAfterViewInit(): void {
    const el = this.cardEl?.nativeElement;
    if (!el) return;

    this.aspectObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const h = entry.contentRect.height;
      const w = entry.contentRect.width;
      if (h > w) {
        const newWidth = h + 40;
        if (Math.abs((el.style.width ? parseFloat(el.style.width) : w) - newWidth) > 2) {
          el.style.width = `${newWidth}px`;
        }
      }
    });
    this.aspectObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.aspectObserver?.disconnect();
    this.interactable?.unset();
  }
}
