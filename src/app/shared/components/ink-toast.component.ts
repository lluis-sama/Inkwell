import { Component, inject } from '@angular/core';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-ink-toast',
  standalone: true,
  imports: [],
  templateUrl: './ink-toast.component.html',
})
export class InkToastComponent {
  protected toastService = inject(ToastService);

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }
}
