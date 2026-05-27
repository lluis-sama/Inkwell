import { Component, ChangeDetectionStrategy, inject, output, computed } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { InkModalComponent } from '../ink-modal.component';
import { InkButtonComponent } from '../ink-button.component';
import { LanguageToolService } from '../../../core/services/language-tool.service';

@Component({
  selector: 'app-lt-install-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InkModalComponent, InkButtonComponent, TranslocoPipe],
  templateUrl: './lt-install-modal.component.html',
})
export class LtInstallModalComponent {
  readonly ltSvc = inject(LanguageToolService);
  readonly closed = output<void>();

  readonly modalTitle = computed(() => {
    const state = this.ltSvc.installState();
    if (state === 'downloading') {
      return 'LT.DOWNLOADING_TITLE';
    }
    return 'LT.INSTALL_TITLE';
  });
}
