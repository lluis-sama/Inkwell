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
  focusMode      = input<boolean>(false);
  typewriterMode = input<boolean>(false);

  showSnapshots    = input<boolean>(false);
  showAiPanel      = input<boolean>(false);
  showFindReplace  = input<boolean>(false);

  binderToggled          = output<void>();
  focusToggled           = output<void>();
  typewriterToggled      = output<void>();
  snapshotRequested      = output<void>();
  snapshotsPanelToggled  = output<void>();
  aiPanelToggled         = output<void>();
  exportRequested        = output<void>();
  findReplaceToggled     = output<void>();
  titleChanged           = output<string>();

  onTitleChange(event: Event): void {
    this.titleChanged.emit((event.target as HTMLInputElement).value);
  }
}
