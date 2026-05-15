import { Component, computed, input, model } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface FlatDocument {
  id: string;
  title: string;
  depth: number;
  wordCount: number;
}

@Component({
  selector: 'app-step-document-selector',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="flex flex-col gap-4">
      <p class="text-ink-subtle text-sm">
        Selecciona los documentos a incluir en la exportación y ordénalos.
        Solo se incluyen documentos (no carpetas).
      </p>

      <div class="flex gap-3">
        <button (click)="selectAll()"
          class="text-ink-accent text-xs hover:underline">Seleccionar todo</button>
        <button (click)="deselectAll()"
          class="text-ink-subtle text-xs hover:underline">Deseleccionar todo</button>
      </div>

      <div class="flex flex-col gap-1 max-h-72 overflow-y-auto">
        @for (item of documents(); track item.id) {
          <label
            class="flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-ink-surface transition-colors"
            [style.paddingLeft.px]="(item.depth * 12) + 12">
            <input
              type="checkbox"
              [checked]="isSelected(item.id)"
              (change)="toggleDoc(item.id)"
              class="accent-ink-accent"/>
            <span class="text-ink-text text-sm truncate">{{ item.title }}</span>
            @if (item.wordCount > 0) {
              <span class="ml-auto text-ink-subtle text-xs shrink-0">
                {{ item.wordCount | number }} palabras
              </span>
            }
          </label>
        }
      </div>

      <div class="flex justify-between items-center pt-2 border-t border-ink-border">
        <span class="text-ink-subtle text-xs">
          {{ selectedCount() }} documentos seleccionados
        </span>
        <span class="text-ink-subtle text-xs">
          ~{{ totalWordCount() | number }} palabras
        </span>
      </div>
    </div>
  `,
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
