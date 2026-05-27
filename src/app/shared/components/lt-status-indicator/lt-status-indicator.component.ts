import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageToolService } from '../../../core/services/language-tool.service';

@Component({
  selector: 'app-lt-status-indicator',
  standalone: true,
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="flex items-center gap-1.5 px-2 py-1 rounded text-xs border border-ink-border hover:border-ink-accent transition-colors"
      [class]="indicatorClass()"
      [disabled]="ltSvc.installState() === 'downloading'"
      (click)="handleClick()"
      aria-label="LanguageTool status">
      <span>{{ indicatorIcon() }}</span>
      <span>{{ 'LT.INDICATOR_LABEL' | transloco }}</span>
    </button>
  `,
})
export class LtStatusIndicatorComponent {
  readonly ltSvc = inject(LanguageToolService);
  readonly clicked = output<string>();

  readonly indicatorIcon = computed(() => {
    if (this.ltSvc.installState() === 'downloading') return '⟳';
    if (this.ltSvc.serverReady()) return '✓';
    if (this.ltSvc.installState() === 'error') return '✗';
    if (this.ltSvc.installState() === 'not-installed') return '↓';
    return '⏸';
  });

  readonly indicatorClass = computed(() => {
    if (this.ltSvc.serverReady()) return 'text-green-400 border-green-400/30';
    if (this.ltSvc.installState() === 'error') return 'text-red-400 border-red-400/30';
    if (this.ltSvc.installState() === 'downloading') return 'text-yellow-400 border-yellow-400/30 cursor-wait';
    return 'text-ink-subtle';
  });

  handleClick(): void {
    if (this.ltSvc.installState() === 'downloading') return;
    if (this.ltSvc.serverReady()) {
      this.clicked.emit('running');
    } else if (this.ltSvc.installState() === 'not-installed') {
      this.clicked.emit('not-installed');
    } else if (this.ltSvc.installState() === 'error') {
      this.clicked.emit('error');
    } else {
      this.clicked.emit('stopped');
    }
  }
}
