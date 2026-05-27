import { Component, input, output } from '@angular/core';

@Component({
  selector: 'ink-modal',
  standalone: true,
  templateUrl: './ink-modal.component.html',
})
export class InkModalComponent {
  title          = input<string>('');
  hasActions     = input<boolean>(true);
  closeOnOverlay = input<boolean>(true);
  showCloseButton = input<boolean>(true);
  widthClass     = input<string>('max-w-md');

  closed = output<void>();

  onOverlayClick(event: MouseEvent): void {
    if (this.closeOnOverlay()) this.closed.emit();
  }
}
