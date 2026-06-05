import { Component, ElementRef, input, output, viewChild, signal, effect } from '@angular/core';
import { CardConnection } from '../../../core/models/board.model';
import { ClickOutsideDirective } from '../../../shared/utils/click-outside.directive';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-connection-editor-popover',
  standalone: true,
  imports: [ClickOutsideDirective, TranslocoPipe],
  templateUrl: './connection-editor-popover.component.html',
  styleUrl: './connection-editor-popover.component.css',
})
export class ConnectionEditorPopoverComponent {
  connection = input.required<CardConnection>();
  left = input.required<number>();
  top = input.required<number>();

  labelChanged = output<string>();
  colorChanged = output<string>();
  deleteRequested = output<void>();
  closed = output<void>();

  private colorInput = viewChild.required<ElementRef<HTMLInputElement>>('colorInput');
  readonly currentLabel = signal('');

  constructor() {
    effect(() => {
      this.currentLabel.set(this.connection().label ?? '');
    });
  }

  readonly predefinedColors = [
    '#cba6f7', // mauve
    '#89b4fa', // blue
    '#a6e3a1', // green
    '#f38ba8', // red
    '#fab387', // peach
    '#f9e2af', // yellow
    '#94e2d5', // teal
    '#b4befe', // lavender
    '#6c7086', // overlay0
    '#f5c2e7', // pink
    '#eba0ac', // maroon
    '#74c7ec', // sapphire
  ];

  onLabelInput(event: Event): void {
    this.currentLabel.set((event.target as HTMLInputElement).value);
  }

  onColorSelect(color: string): void {
    this.colorChanged.emit(color);
  }

  onCustomColorTrigger(): void {
    this.colorInput().nativeElement.click();
  }

  onCustomColorChange(event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    this.colorChanged.emit(color);
  }

  onDelete(): void {
    this.deleteRequested.emit();
  }

  onClose(): void {
    const final = this.currentLabel().trim();
    const original = this.connection().label ?? '';
    if (final !== original) {
      this.labelChanged.emit(final);
    }
    this.closed.emit();
  }
}
