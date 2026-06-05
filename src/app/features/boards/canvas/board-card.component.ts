import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, input, output, inject } from '@angular/core';
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
export class BoardCardComponent implements OnInit, OnDestroy {
  @ViewChild('cardEl', { static: true }) cardEl!: ElementRef<HTMLDivElement>;

  private readonly projectService = inject(ProjectService);

  card = input.required<Card>();

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
    const el = this.cardEl.nativeElement;
    const actualWidth = el.offsetWidth;
    const actualHeight = el.offsetHeight;

    let anchorX = card.x;
    let anchorY = card.y;

    switch (side) {
      case 'n':
        anchorX += actualWidth / 2;
        break;
      case 's':
        anchorX += actualWidth / 2;
        anchorY += actualHeight;
        break;
      case 'e':
        anchorX += actualWidth;
        anchorY += actualHeight / 2;
        break;
      case 'w':
        anchorY += actualHeight / 2;
        break;
    }

    this.connectionStarted.emit({ cardId: card.id, side, x: anchorX, y: anchorY });
  }

  private interactable: ReturnType<typeof interact> | null = null;

  ngOnInit(): void {
    this.interactable = interact(this.cardEl.nativeElement).draggable({
      ignoreFrom: '.anchor, .card-action-btn, .card-image-btn',
      listeners: {
        move: (event) => {
          const el = event.target as HTMLElement;
          const x = (parseFloat(el.style.left) || 0) + event.dx;
          const y = (parseFloat(el.style.top) || 0) + event.dy;
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
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: 'parent',
          endOnly: true,
        }),
      ],
    });
  }

  ngOnDestroy(): void {
    this.interactable?.unset();
  }
}
