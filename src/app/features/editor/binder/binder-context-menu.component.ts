import { Component, input, output } from '@angular/core';

export interface ContextMenuAction {
  label: string;
  action: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

@Component({
  selector: 'app-binder-context-menu',
  standalone: true,
  templateUrl: './binder-context-menu.component.html',
})
export class BinderContextMenuComponent {
  x       = input<number>(0);
  y       = input<number>(0);
  actions = input<ContextMenuAction[]>([]);

  actionSelected = output<string>();
}
