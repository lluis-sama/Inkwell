import { Component, OnInit, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { InkModalComponent } from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';
import { Card, DEFAULT_CARD_COLORS } from '../../../core/models/board.model';

@Component({
  selector: 'app-card-editor-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule, TranslocoPipe],
  templateUrl: './card-editor-modal.component.html',
})
export class CardEditorModalComponent implements OnInit {
  card = input.required<Card>();

  saved     = output<Card>();
  cancelled = output<void>();

  editTitle = '';
  editBody  = '';
  editColor = '';

  colors = DEFAULT_CARD_COLORS;

  ngOnInit(): void {
    this.editTitle = this.card().title;
    this.editBody  = this.card().body;
    this.editColor = this.card().color;
  }

  save(): void {
    this.saved.emit({
      ...this.card(),
      title: this.editTitle.trim() || 'Sin título',
      body:  this.editBody.trim(),
      color: this.editColor,
    });
  }
}
