import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NarrativeCard } from '../../core/services/narrative.service';

@Component({
  selector: 'app-narrative-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './narrative-card.component.html',
})
export class NarrativeCardComponent {
  card = input.required<NarrativeCard>();

  synopsisChanged = output<string>();
  openInEditor    = output<void>();

  editingSynopsis = signal<boolean>(false);
  draftSynopsis   = signal<string>('');

  startEditing(): void {
    this.draftSynopsis.set(this.card().synopsis);
    this.editingSynopsis.set(true);
  }

  commitEdit(): void {
    this.synopsisChanged.emit(this.draftSynopsis());
    this.editingSynopsis.set(false);
  }

  cancelEdit(): void {
    this.editingSynopsis.set(false);
  }

  formatWords(n: number): string {
    if (n === 0) return 'Sin palabras';
    if (n === 1) return '1 palabra';
    return `${n} palabras`;
  }
}
