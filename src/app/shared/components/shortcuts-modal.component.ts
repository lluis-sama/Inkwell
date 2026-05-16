import { Component, output } from '@angular/core';
import { InkModalComponent } from './ink-modal.component';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Navegación',
    shortcuts: [
      { keys: ['Alt', '1'],           description: 'Ir al editor' },
      { keys: ['Alt', '2'],           description: 'Ir a los tableros' },
      { keys: ['Ctrl', 'B'],          description: 'Mostrar / ocultar binder' },
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Modo focus (sin distracciones)' },
      { keys: ['Ctrl', 'F'],          description: 'Buscar en el proyecto' },
    ],
  },
  {
    title: 'Editor',
    shortcuts: [
      { keys: ['Ctrl', 'S'],          description: 'Guardar documento' },
      { keys: ['Ctrl', 'Z'],          description: 'Deshacer' },
      { keys: ['Ctrl', 'Y'],          description: 'Rehacer' },
      { keys: ['Ctrl', 'B'],          description: 'Negrita' },
      { keys: ['Ctrl', 'I'],          description: 'Cursiva' },
      { keys: ['Ctrl', 'Shift', 'A'], description: 'Abrir / cerrar asistente IA' },
    ],
  },
  {
    title: 'Snapshots y versiones',
    shortcuts: [
      { keys: ['—'],                  description: 'Crear snapshot (botón en top bar)' },
      { keys: ['—'],                  description: 'Ver historial (botón reloj en top bar)' },
    ],
  },
  {
    title: 'Modos de escritura',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Activar / desactivar modo focus' },
      { keys: ['—'],                  description: 'Modo máquina de escribir (botón en top bar)' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'],                  description: 'Mostrar esta referencia de atajos' },
      { keys: ['Esc'],                description: 'Cerrar modal / menú contextual activo' },
    ],
  },
];

@Component({
  selector: 'app-shortcuts-modal',
  standalone: true,
  imports: [InkModalComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <ink-modal title="Atajos de teclado" [hasActions]="false" (closed)="closed.emit()">
      <div class="flex flex-col gap-6 max-h-[60vh] overflow-y-auto pr-1">
        @for (group of shortcuts; track group.title) {
          <div>
            <p class="text-ink-subtle text-xs font-medium uppercase tracking-widest mb-3">
              {{ group.title }}
            </p>
            <div class="flex flex-col gap-2">
              @for (shortcut of group.shortcuts; track shortcut.description) {
                <div class="flex items-center justify-between">
                  <span class="text-ink-text text-sm">{{ shortcut.description }}</span>
                  <span class="flex items-center gap-1">
                    @if (shortcut.keys.length === 1 && shortcut.keys[0] === '—') {
                      <kbd class="text-ink-subtle text-sm">—</kbd>
                    } @else {
                      @for (key of shortcut.keys; track key; let last = $last) {
                        <kbd class="inline-flex items-center justify-center rounded border border-ink-border
                                    bg-ink-surface px-1.5 py-0.5 text-ink-text text-xs font-mono
                                    shadow-sm min-w-[1.5rem]">{{ key }}</kbd>
                        @if (!last) {
                          <span class="text-ink-subtle text-xs">+</span>
                        }
                      }
                    }
                  </span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </ink-modal>
  `,
})
export class ShortcutsModalComponent {
  closed = output<void>();

  readonly shortcuts: ShortcutGroup[] = SHORTCUTS;
}
