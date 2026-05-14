import { Component, ElementRef, OnDestroy, OnInit, ViewChild, input, output } from '@angular/core';
import interact from 'interactjs';
import { Card } from '../../../core/models/board.model';

@Component({
  selector: 'app-board-card',
  standalone: true,
  imports: [],
  templateUrl: './board-card.component.html',
  styles: [
    `
      :host {
        display: contents;
      }
      div:hover .card-delete {
        opacity: 1 !important;
      }
    `,
  ],
})
export class BoardCardComponent implements OnInit, OnDestroy {
  @ViewChild('cardEl', { static: true }) cardEl!: ElementRef<HTMLDivElement>;

  card = input.required<Card>();

  positionChanged = output<{ id: string; x: number; y: number }>();
  editRequested = output<Card>();
  deleteRequested = output<string>();

  private interactable: ReturnType<typeof interact> | null = null;

  ngOnInit(): void {
    this.interactable = interact(this.cardEl.nativeElement).draggable({
      listeners: {
        move: (event) => {
          const el = event.target as HTMLElement;
          const x = (parseFloat(el.style.left) || 0) + event.dx;
          const y = (parseFloat(el.style.top) || 0) + event.dy;
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
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
