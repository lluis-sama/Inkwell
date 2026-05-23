import { Component, input, model, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ExportFormat, ExportMetadata } from '../../../core/models/export.model';

@Component({
  selector: 'app-step-metadata',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  styleUrl: './step-metadata.component.css',
  templateUrl: './step-metadata.component.html',
})
export class StepMetadataComponent implements OnInit {
  meta   = model.required<ExportMetadata>();
  format = input<ExportFormat>('pdf-manuscript');

  legalNameVal     = '';
  penNameVal       = '';
  emailVal         = '';
  phoneVal         = '';
  addressVal       = '';
  agentVal         = '';
  genreVal         = '';
  copyrightYearVal = new Date().getFullYear();
  synopsisVal      = '';

  ngOnInit(): void {
    const m = this.meta();
    this.legalNameVal     = m.legalName;
    this.penNameVal       = m.penName ?? '';
    this.emailVal         = m.email;
    this.phoneVal         = m.phone ?? '';
    this.addressVal       = m.address ?? '';
    this.agentVal         = m.agentName ?? '';
    this.genreVal         = m.genre;
    this.copyrightYearVal = m.copyrightYear;
    this.synopsisVal      = m.synopsis ?? '';
  }

  emitChange(): void {
    this.meta.update(m => ({
      ...m,
      legalName:     this.legalNameVal,
      penName:       this.penNameVal || undefined,
      email:         this.emailVal,
      phone:         this.phoneVal || undefined,
      address:       this.addressVal || undefined,
      agentName:     this.agentVal || undefined,
      genre:         this.genreVal,
      copyrightYear: this.copyrightYearVal,
      synopsis:      this.synopsisVal || undefined,
    }));
  }
}
