import { Component, input, model, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ExportFormat, ExportMetadata } from '../../../core/models/export.model';

@Component({
  selector: 'app-step-metadata',
  standalone: true,
  imports: [FormsModule],
  styles: [`
    .input-field {
      width: 100%; padding: 0.5rem 0.75rem;
      border-radius: 0.25rem;
      background: var(--ink-bg); border: 1px solid var(--ink-border);
      color: var(--ink-text); font-size: 0.875rem;
    }
    .input-field:focus { outline: none; border-color: var(--ink-accent); }
    .input-field::placeholder { color: var(--ink-muted); }
  `],
  template: `
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">

        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Nombre legal *
          </label>
          <input [(ngModel)]="legalNameVal" (ngModelChange)="emitChange()"
            placeholder="Tu nombre completo"
            class="input-field"/>
        </div>

        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Nombre de pluma <span class="normal-case">(si es distinto)</span>
          </label>
          <input [(ngModel)]="penNameVal" (ngModelChange)="emitChange()"
            placeholder="Nombre de autor publicado"
            class="input-field"/>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Email *
          </label>
          <input [(ngModel)]="emailVal" (ngModelChange)="emitChange()"
            type="email" placeholder="tu@email.com"
            class="input-field"/>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Teléfono
          </label>
          <input [(ngModel)]="phoneVal" (ngModelChange)="emitChange()"
            placeholder="+34 600 000 000"
            class="input-field"/>
        </div>

        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Ciudad, País
          </label>
          <input [(ngModel)]="addressVal" (ngModelChange)="emitChange()"
            placeholder="Madrid, España"
            class="input-field"/>
        </div>

        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Agente literario <span class="normal-case">(si tienes representación)</span>
          </label>
          <input [(ngModel)]="agentVal" (ngModelChange)="emitChange()"
            placeholder="Nombre de la agencia / agente"
            class="input-field"/>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Género literario *
          </label>
          <input [(ngModel)]="genreVal" (ngModelChange)="emitChange()"
            placeholder="Novela de aventuras, Thriller..."
            class="input-field"/>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Año de copyright
          </label>
          <input [(ngModel)]="copyrightYearVal" (ngModelChange)="emitChange()"
            type="number" [min]="2000" [max]="2100"
            class="input-field"/>
        </div>

      </div>

      @if (format() === 'epub') {
        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Sinopsis <span class="normal-case">(para los metadatos del ebook)</span>
          </label>
          <textarea [(ngModel)]="synopsisVal" (ngModelChange)="emitChange()"
            rows="4" placeholder="Breve descripción de la obra..."
            class="input-field resize-none">
          </textarea>
        </div>
      }
    </div>
  `,
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
