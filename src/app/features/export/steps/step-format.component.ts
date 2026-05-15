import { Component, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ExportFormat, PageSize } from '../../../core/models/export.model';

@Component({
  selector: 'app-step-format',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-col gap-6">

      <div class="flex flex-col gap-2">
        <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
          Formato de exportación
        </label>
        <div class="flex gap-3">

          <button
            (click)="format.set('pdf-manuscript')"
            class="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-left"
            [class]="format() === 'pdf-manuscript'
              ? 'border-ink-accent bg-ink-surface'
              : 'border-ink-border hover:border-ink-muted'">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5"
                 [class]="format() === 'pdf-manuscript' ? 'text-ink-accent' : 'text-ink-subtle'">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <div>
              <p class="text-ink-text text-sm font-medium">PDF Manuscrito</p>
              <p class="text-ink-subtle text-xs mt-0.5">
                Standard Manuscript Format.<br>Para enviar a agentes y editores.
              </p>
            </div>
          </button>

          <button
            (click)="format.set('epub')"
            class="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-left"
            [class]="format() === 'epub'
              ? 'border-ink-accent bg-ink-surface'
              : 'border-ink-border hover:border-ink-muted'">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5"
                 [class]="format() === 'epub' ? 'text-ink-accent' : 'text-ink-subtle'">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <div>
              <p class="text-ink-text text-sm font-medium">EPUB</p>
              <p class="text-ink-subtle text-xs mt-0.5">
                Para ereaders, Kindle<br>y distribución digital.
              </p>
            </div>
          </button>

        </div>
      </div>

      @if (format() === 'pdf-manuscript') {
        <div class="flex flex-col gap-3">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Tamaño de página
          </label>
          <div class="flex gap-3">
            @for (size of pageSizes; track size.id) {
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" [value]="size.id"
                  [(ngModel)]="pageSizeVal"
                  (ngModelChange)="pageSizeChange.emit($event)"
                  class="accent-ink-accent"/>
                <span class="text-ink-text text-sm">{{ size.label }}</span>
                <span class="text-ink-subtle text-xs">{{ size.desc }}</span>
              </label>
            }
          </div>
          <p class="text-ink-subtle text-xs leading-relaxed">
            A4 es el estándar en España y Europa. Letter es el estándar en EE.UU. y Canadá.
            Consulta las instrucciones de envío de la editorial o agencia antes de exportar.
          </p>
        </div>
      }

    </div>
  `,
})
export class StepFormatComponent {
  format        = model<ExportFormat>('pdf-manuscript');
  pageSizeChange = output<PageSize>();

  pageSizeVal: PageSize = 'a4';

  readonly pageSizes = [
    { id: 'a4' as PageSize,     label: 'A4',     desc: '210×297mm' },
    { id: 'letter' as PageSize, label: 'Letter', desc: '8.5×11"' },
  ];
}
