import { Component, computed, input, model } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

export interface FlatDocument {
  id: string;
  title: string;
  depth: number;
  wordCount: number;
}

@Component({
  selector: 'app-step-document-selector',
  standalone: true,
  imports: [DecimalPipe, TranslocoPipe],
  templateUrl: './step-document-selector.component.html',
})
export class StepDocumentSelectorComponent {
  documents = input.required<FlatDocument[]>();
  selectedIds = model<string[]>([]);

  selectedCount = computed(() => this.selectedIds().length);
  totalWordCount = computed(() =>
    this.documents()
      .filter(d => this.selectedIds().includes(d.id))
      .reduce((sum, d) => sum + d.wordCount, 0)
  );

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggleDoc(id: string): void {
    this.selectedIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  }

  selectAll(): void {
    this.selectedIds.set(this.documents().map(d => d.id));
  }

  deselectAll(): void {
    this.selectedIds.set([]);
  }
}
