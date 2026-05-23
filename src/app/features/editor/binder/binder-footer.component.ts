import { Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-binder-footer',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './binder-footer.component.html',
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class BinderFooterComponent {
  readonly #transloco = inject(TranslocoService);

  // Inputs desde BinderComponent (pasa los valores de EditorLayoutComponent)
  searchActive       = input<boolean>(false);
  sessionGoal        = input<number>(0);
  sessionWordsAdded  = input<number>(0);
  sessionProgress    = input<number>(0);
  sessionGoalReached = input<boolean>(false);
  totalWordCount     = input<number>(0);

  // Outputs
  searchToggled = output<void>();
  goalChanged   = output<number>();  // 0 = sin objetivo

  showGoalPopover = signal(false);

  applyGoal(value: string): void {
    const n = parseInt(value, 10);
    this.goalChanged.emit(isNaN(n) || n <= 0 ? 0 : n);
    this.showGoalPopover.set(false);
  }

  clearGoal(): void {
    this.goalChanged.emit(0);
    this.showGoalPopover.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('app-binder-footer')) {
      this.showGoalPopover.set(false);
    }
  }

  formatCount(n: number): string {
    if (n === 0) return this.#transloco.translate('BINDER.FOOTER.EMPTY');
    if (n < 1000) return this.#transloco.translate('BINDER.FOOTER.WORDS', { count: n });
    return this.#transloco.translate('BINDER.FOOTER.WORDS_K', { count: (n / 1000).toFixed(1).replace('.', ',') });
  }
}
