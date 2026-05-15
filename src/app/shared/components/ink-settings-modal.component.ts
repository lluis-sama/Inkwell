import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../core/services/ai.service';
import { InkModalComponent } from './ink-modal.component';
import { InkButtonComponent } from './ink-button.component';

@Component({
  selector: 'ink-settings-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Configuración de IA" (closed)="closed.emit()">

      <div class="flex flex-col gap-5">

        <div class="flex flex-col gap-1.5">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Anthropic API Key
          </label>
          <input
            [(ngModel)]="keyInput"
            type="password"
            placeholder="sk-ant-..."
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-sm placeholder:text-ink-muted font-mono
                   focus:outline-none focus:border-ink-accent transition-colors"/>
          <p class="text-ink-subtle text-xs leading-relaxed">
            La clave se guarda únicamente en tu dispositivo (localStorage).
            Nunca sale de la app salvo para llamar directamente a api.anthropic.com.
          </p>
        </div>

        @if (ai.hasApiKey()) {
          <div class="flex items-center gap-2 px-3 py-2 rounded
                      bg-ink-bg border border-ink-success/30">
            <span class="text-ink-success text-xs">✓ API key configurada</span>
            <button
              (click)="clearKey()"
              class="ml-auto text-ink-subtle text-xs hover:text-ink-danger
                     transition-colors">
              Eliminar
            </button>
          </div>
        }
      </div>

      <ng-container slot="actions">
        <ink-button variant="ghost" (clicked)="closed.emit()">Cancelar</ink-button>
        <ink-button
          variant="primary"
          [disabled]="!keyInput.trim()"
          (clicked)="save()">
          Guardar
        </ink-button>
      </ng-container>

    </ink-modal>
  `,
})
export class InkSettingsModalComponent {
  ai = inject(AiService);
  closed = output<void>();

  keyInput = '';

  save(): void {
    this.ai.saveApiKey(this.keyInput);
    this.closed.emit();
  }

  clearKey(): void {
    this.ai.clearApiKey();
    this.keyInput = '';
  }
}
