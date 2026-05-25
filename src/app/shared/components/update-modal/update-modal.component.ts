import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { InkModalComponent } from '../ink-modal.component';
import { InkButtonComponent } from '../ink-button.component';
import { UpdateService } from '../../../core/services/update.service';

@Component({
  selector: 'app-update-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InkModalComponent, InkButtonComponent, TranslocoPipe],
  template: `
    @if (svc.updateInfo(); as info) {
      <ink-modal [title]="'UPDATE.TITLE' | transloco: { version: info.version }" (closed)="svc.dismiss()">
        <p class="text-sm text-ink-text mb-4">
          {{ 'UPDATE.BODY' | transloco }}
        </p>
        @if (info.release_notes) {
          <div class="rounded-lg bg-ink-bg border border-ink-border p-3 max-h-48 overflow-y-auto mb-4">
            <div class="text-xs font-semibold text-ink-subtle mb-2 uppercase tracking-wide">{{ 'UPDATE.RELEASE_NOTES' | transloco }}</div>
            <pre class="text-sm text-ink-text whitespace-pre-wrap font-sans leading-relaxed">{{ info.release_notes }}</pre>
          </div>
        }
        <div class="flex justify-end gap-2">
          <ink-button variant="ghost" (clicked)="svc.dismiss()">{{ 'UPDATE.DISMISS' | transloco }}</ink-button>
          <ink-button variant="primary" (clicked)="svc.openReleasesPage()">{{ 'UPDATE.VIEW_RELEASES' | transloco }}</ink-button>
        </div>
      </ink-modal>
    }
  `,
})
export class UpdateModalComponent {
  readonly svc = inject(UpdateService);
}
