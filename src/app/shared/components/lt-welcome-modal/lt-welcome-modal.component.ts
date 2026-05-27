import { Component, ChangeDetectionStrategy, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { InkModalComponent } from '../ink-modal.component';
import { InkButtonComponent } from '../ink-button.component';

@Component({
  selector: 'app-lt-welcome-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InkModalComponent, InkButtonComponent, TranslocoPipe],
  template: `
    <ink-modal [title]="'LT.WELCOME_TITLE' | transloco" (closed)="onClose(false)">
      <div class="flex flex-col gap-4">
        <p class="text-ink-subtle text-sm">{{ 'LT.WELCOME_BODY' | transloco }}</p>
        <p class="text-xs text-ink-subtle">{{ 'LT.INSTALL_SIZE' | transloco }}</p>
        <div class="flex justify-end gap-2">
          <ink-button variant="ghost" (clicked)="onClose(false)">
            {{ 'LT.WELCOME_LATER' | transloco }}
          </ink-button>
          <ink-button variant="primary" (clicked)="onClose(true)">
            {{ 'LT.WELCOME_INSTALL' | transloco }}
          </ink-button>
        </div>
      </div>
    </ink-modal>
  `,
})
export class LtWelcomeModalComponent {
  readonly closed = output<boolean>();

  onClose(install: boolean): void {
    this.closed.emit(install);
  }
}
