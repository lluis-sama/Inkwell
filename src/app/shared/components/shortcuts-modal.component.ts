import { Component, output } from "@angular/core";
import { InkModalComponent } from "./ink-modal.component";
import { TranslocoPipe } from "@jsverse/transloco";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Navegación",
    shortcuts: [
      { keys: ["Alt", "1"], description: "Ir al editor" },
      { keys: ["Alt", "2"], description: "Ir a los tableros" },
      { keys: ["Ctrl", "B"], description: "Mostrar / ocultar binder" },
      {
        keys: ["Ctrl", "Shift", "F"],
        description: "Modo focus (sin distracciones)",
      },
      { keys: ["Ctrl", "F"], description: "Buscar en el proyecto" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: ["Ctrl", "S"], description: "Guardar documento" },
      { keys: ["Ctrl", "Z"], description: "Deshacer" },
      { keys: ["Ctrl", "Y"], description: "Rehacer" },
      { keys: ["Ctrl", "B"], description: "Negrita" },
      { keys: ["Ctrl", "I"], description: "Cursiva" },
      {
        keys: ["Ctrl", "Shift", "A"],
        description: "Abrir / cerrar asistente IA",
      },
      {
        keys: ["Ctrl", "H"],
        description: "Buscar y reemplazar en el documento",
      },
      { keys: ["Ctrl", "G"], description: "Buscar en el documento" },
    ],
  },
  {
    title: "Snapshots y versiones",
    shortcuts: [
      { keys: ["—"], description: "Crear snapshot (botón en top bar)" },
      { keys: ["—"], description: "Ver historial (botón reloj en top bar)" },
    ],
  },
  {
    title: "Modos de escritura",
    shortcuts: [
      {
        keys: ["Ctrl", "Shift", "F"],
        description: "Activar / desactivar modo focus",
      },
      {
        keys: ["—"],
        description: "Modo máquina de escribir (botón en top bar)",
      },
    ],
  },
  {
    title: "General",
    shortcuts: [
      {
        keys: ["Ctrl", "Shift", "?"],
        description: "Mostrar esta referencia de atajos",
      },
      { keys: ["Esc"], description: "Cerrar modal / menú contextual activo" },
    ],
  },
];

@Component({
  selector: "app-shortcuts-modal",
  standalone: true,
  imports: [InkModalComponent, TranslocoPipe],
  host: { "(document:keydown.escape)": "closed.emit()" },
  templateUrl: './shortcuts-modal.component.html',
})
export class ShortcutsModalComponent {
  closed = output<void>();

  readonly shortcuts: ShortcutGroup[] = SHORTCUTS;
}
