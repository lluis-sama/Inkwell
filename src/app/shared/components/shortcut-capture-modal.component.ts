import { Component, HostListener, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { InkModalComponent } from './ink-modal.component';
import { formatShortcutLabel } from '../../features/editor/literary-punctuation/literary-punctuation.helpers';
import { LiteraryShortcutTrigger } from '../../features/editor/literary-punctuation/literary-punctuation.types';

const MODIFIER_CODES = [
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
];

function isModifierKey(code: string): boolean {
  return MODIFIER_CODES.includes(code);
}

function determineCtrl(event: KeyboardEvent): 'left' | 'right' | 'any' {
  if (event.metaKey === true) return 'any';
  if (event.ctrlKey === false) return 'any';
  if (event.location === 1) return 'left';
  if (event.location === 2) return 'right';
  return 'any';
}

@Component({
  selector: 'app-shortcut-capture-modal',
  standalone: true,
  imports: [InkModalComponent, TranslocoPipe],
  template: `
    <ink-modal
      [title]="title() | transloco"
      [hasActions]="false"
      [closeOnOverlay]="true"
      [showCloseButton]="true"
      [widthClass]="'max-w-sm'"
      (closed)="onClose()">
      <div class="flex flex-col gap-4">
        @if (initialTrigger(); as trigger) {
          <div class="text-xs text-ink-subtle">
            {{ 'SETTINGS.LITERARY.CAPTURE_CURRENT' | transloco }}:
            <span class="font-mono text-ink-text-primary">{{ formatShortcutLabel(trigger) }}</span>
          </div>
        }

        <div class="rounded border border-ink-border bg-ink-bg p-6 text-center">
          <div class="font-mono text-lg text-ink-text-primary min-h-[1.5rem]">
            @if (capturedTrigger(); as trigger) {
              {{ formatShortcutLabel(trigger) }}
            } @else {
              {{ 'SETTINGS.LITERARY.CAPTURE_PROMPT' | transloco }}
            }
          </div>
        </div>

        @if (capturedTrigger(); as trigger) {
          <div class="text-xs text-ink-subtle">
            @if (trigger.ctrl === 'left') {
              {{ 'SETTINGS.LITERARY.CAPTURE_LEFT_CTRL' | transloco }}
            } @else if (trigger.ctrl === 'right') {
              {{ 'SETTINGS.LITERARY.CAPTURE_RIGHT_CTRL' | transloco }}
            } @else {
              {{ 'SETTINGS.LITERARY.CAPTURE_ANY_CTRL' | transloco }}
            }
          </div>
        }

        <div class="flex justify-end gap-2">
          <button
            (click)="onClose()"
            class="text-xs text-ink-subtle hover:text-ink-text transition-colors px-3 py-1.5 rounded hover:bg-ink-hover">
            {{ 'SETTINGS.LITERARY.CAPTURE_CANCEL' | transloco }}
          </button>
          <button
            (click)="onSave()"
            [disabled]="!capturedTrigger()"
            class="text-xs text-ink-accent hover:text-ink-text transition-colors px-3 py-1.5 rounded hover:bg-ink-hover disabled:opacity-50 disabled:cursor-not-allowed">
            {{ 'SETTINGS.LITERARY.CAPTURE_SAVE' | transloco }}
          </button>
        </div>
      </div>
    </ink-modal>
  `,
})
export class ShortcutCaptureModalComponent {
  title = input.required<string>();
  initialTrigger = input<LiteraryShortcutTrigger | null>(null);

  saved = output<LiteraryShortcutTrigger>();
  closed = output<void>();

  capturedTrigger = signal<LiteraryShortcutTrigger | null>(null);
  readonly formatShortcutLabel = formatShortcutLabel;

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.code === 'Escape') {
      this.onClose();
      return;
    }

    if (isModifierKey(event.code)) {
      return;
    }

    const trigger: LiteraryShortcutTrigger = {
      code: event.code,
      ctrl: determineCtrl(event),
      meta: event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
    };

    this.capturedTrigger.set(trigger);
  }

  onSave(): void {
    const trigger = this.capturedTrigger();
    if (trigger) {
      this.saved.emit(trigger);
      this.closed.emit();
    }
  }

  onClose(): void {
    this.closed.emit();
  }
}
