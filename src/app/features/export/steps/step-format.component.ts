import { Component, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ExportFormat, PageSize } from '../../../core/models/export.model';

@Component({
  selector: 'app-step-format',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './step-format.component.html',
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
