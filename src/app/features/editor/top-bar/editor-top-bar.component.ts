import { Component, input, output } from '@angular/core';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

@Component({
  selector: 'app-editor-top-bar',
  standalone: true,
  templateUrl: './editor-top-bar.component.html',
})
export class EditorTopBarComponent {
  documentTitle = input<string | null>(null);
  saveStatus    = input<SaveStatus>('saved');
  focusMode     = input<boolean>(false);

  binderToggled     = output<void>();
  focusToggled      = output<void>();
  snapshotRequested = output<void>();
  titleChanged      = output<string>();

  onTitleChange(event: Event): void {
    this.titleChanged.emit((event.target as HTMLInputElement).value);
  }
}
