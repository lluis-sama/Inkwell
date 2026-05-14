import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  success(message: string): void {
    this.show(message, 'success', 3000);
  }

  error(message: string): void {
    this.show(message, 'error', 5000);
  }

  dismiss(id: string): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  private show(message: string, type: Toast['type'], duration: number): void {
    const id = crypto.randomUUID();
    this.toasts.update(list => [...list, { id, message, type, duration }]);
    setTimeout(() => this.dismiss(id), duration);
  }
}
