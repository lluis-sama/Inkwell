import { Component, inject, signal } from "@angular/core";
import { ThemeService } from "../../core/services/theme.service";
import { TauriBridgeService } from "../../core/services/tauri-bridge.service";

@Component({
  selector: "app-project-manager",
  standalone: true,
  template: `
    <div
      class="flex flex-col items-center justify-center h-screen bg-ink-bg gap-4"
    >
      <h1 class="text-ink-text text-3xl font-serif tracking-wide">Inkwell</h1>

      <div class="flex flex-col gap-2 w-80">
        <button
          (click)="testCreateStructure()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm border border-ink-border hover:border-ink-accent transition-colors"
        >
          Test: Crear estructura de proyecto
        </button>

        <button
          (click)="testWriteAndRead()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm border border-ink-border hover:border-ink-accent transition-colors"
        >
          Test: Escribir y leer JSON
        </button>

        <button
          (click)="testListFiles()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm border border-ink-border hover:border-ink-accent transition-colors"
        >
          Test: Listar archivos
        </button>

        <button
          (click)="testDeleteFile()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm border border-ink-border hover:border-ink-accent transition-colors"
        >
          Test: Eliminar archivo
        </button>

        <button
          (click)="theme.toggle()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-subtle text-sm border border-ink-border hover:border-ink-border transition-colors"
        >
          Tema: {{ theme.theme() }}
        </button>
      </div>

      @if (output()) {
        <pre
          class="mt-4 p-4 rounded bg-ink-surface text-ink-text text-xs w-80 max-h-48 overflow-auto border border-ink-border"
          >{{ output() }}</pre
        >
      }
    </div>
  `,
})
export class ProjectManagerComponent {
  theme = inject(ThemeService);
  bridge = inject(TauriBridgeService);
  output = signal("");

  private testPath = "/tmp/inkwell-test";

  async testCreateStructure() {
    try {
      await this.bridge.createProjectStructure(this.testPath);
      this.output.set(`✓ Estructura creada en ${this.testPath}`);
    } catch (e) {
      this.output.set(`✗ Error: ${e}`);
    }
  }

  async testWriteAndRead() {
    try {
      const filePath = `${this.testPath}/documents/test-doc.json`;
      const data = JSON.stringify(
        { id: "test-doc", title: "Prueba", content: {} },
        null,
        2,
      );
      await this.bridge.writeJsonFile(filePath, data);
      const read = await this.bridge.readJsonFile(filePath);
      this.output.set(`✓ Escrito y leído:\n${read}`);
    } catch (e) {
      this.output.set(`✗ Error: ${e}`);
    }
  }

  async testListFiles() {
    try {
      const ids = await this.bridge.listJsonFiles(`${this.testPath}/documents`);
      this.output.set(`✓ Archivos encontrados: ${JSON.stringify(ids)}`);
    } catch (e) {
      this.output.set(`✗ Error: ${e}`);
    }
  }

  async testDeleteFile() {
    try {
      const filePath = `${this.testPath}/documents/test-doc.json`;
      await this.bridge.deleteJsonFile(filePath);
      this.output.set(`✓ Archivo eliminado`);
    } catch (e) {
      this.output.set(`✗ Error: ${e}`);
    }
  }
}
