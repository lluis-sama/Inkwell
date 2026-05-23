# INK-10 — Exportación (PDF manuscrito + EPUB)

## Objetivo

Implementar el flujo de exportación de Inkwell. El usuario puede seleccionar qué documentos incluir, introducir los metadatos de publicación y exportar en dos formatos:

- **PDF en formato manuscrito estándar** (Standard Manuscript Format) — listo para enviar a agentes y editores.
- **EPUB 3** — para distribución y lectura en ereaders.

---

## Investigación: Standard Manuscript Format (SMF)

El SMF es el formato esperado por agentes y editoriales. Sus reglas son:

| Elemento | Especificación |
|---|---|
| Tamaño de página | A4 (210×297mm) para España/Europa; Letter (8.5×11") como alternativa |
| Márgenes | 2.5cm (1") por todos los lados |
| Fuente | Times New Roman 12pt |
| Interlineado | Doble espaciado (2.0) |
| Alineación | Izquierda — margen derecho irregular (no justificado) |
| Sangría de párrafo | 1.25cm (0.5"); sin espacio extra entre párrafos |
| Encabezado (header) | Apellido / Título corto / Nº de página — esquina superior derecha |
| Página de título | Sin número de página ni header |
| Inicio de capítulo | Siempre en página nueva; título centrado a 1/3 de la página |
| Final del manuscrito | "# # #" o "FIN" centrado tras el último párrafo |

### Página de título (manuscrito)

```
┌─────────────────────────────────────────────┐
│ Nombre legal                    ~85.000 palabras │
│ Dirección                                         │
│ Teléfono                                          │
│ Email                                             │
│                                                   │
│                                                   │
│              TÍTULO DE LA OBRA                    │  ← 1/3 desde arriba
│                by Nombre Autor                    │
│              (Nombre de pluma)                    │  ← si es distinto
│                                                   │
│                  Género literario                 │
└─────────────────────────────────────────────────┘
```

---

## Datos de metadatos a solicitar al usuario

### Para PDF manuscrito
| Campo | Obligatorio | Notas |
|---|---|---|
| Nombre legal | ✓ | Aparece en el header y en la portada |
| Nombre de pluma | — | Si es distinto del nombre legal |
| Email | ✓ | En la portada |
| Teléfono | — | En la portada |
| Dirección postal | — | En la portada (ciudad, país es suficiente) |
| Nombre del agente | — | Si ya tiene representación |
| Género literario | ✓ | Novela, thriller, romántica, etc. |
| Tamaño de página | ✓ | A4 (default) o Letter |

### Campos calculados automáticamente
| Campo | Cálculo |
|---|---|
| Recuento de palabras | Suma de palabras de los documentos seleccionados, redondeado al millar |
| Título | Se toma del campo `name` del proyecto |

### Para EPUB (campos adicionales)
| Campo | Obligatorio | Notas |
|---|---|---|
| Idioma | ✓ | Default: `es` |
| ISBN | — | Opcional |
| Editorial | — | Opcional |
| Sinopsis | — | Para los metadatos del ebook |
| Año de copyright | ✓ | Default: año actual |

---

## Stack técnico

### PDF
Tauri permite abrir una `WebviewWindow` con HTML arbitrario y llamar a `window.print()`. El sistema operativo genera el PDF mediante el diálogo de impresión nativo con la opción "Guardar como PDF". El CSS `@page` y `@media print` controlan el formato.

No se necesita ninguna librería externa para PDF.

### EPUB
**`epub-gen-memory`** — genera EPUB 3 desde HTML en el browser y en Node.js. Produce un `ArrayBuffer` que se escribe en disco con el plugin `fs` de Tauri.

```bash
pnpm add epub-gen-memory
```

### TipTap → HTML
`generateHTML` de `@tiptap/core` convierte el JSON de TipTap a HTML sin necesidad de una instancia del editor.

```bash
pnpm add @tiptap/html   # si no está ya incluido en @tiptap/core
```

---

## Componentes y servicios a crear

```
src/app/
  features/
    export/
      export-modal.component.ts          ← wizard de exportación (3 pasos)
      steps/
        step-document-selector.component.ts  ← selección de documentos
        step-metadata.component.ts           ← metadatos del autor
        step-format.component.ts             ← formato y opciones
      export-preview/
        manuscript-preview.component.ts      ← ventana de previsualización/impresión
  core/
    services/
      export.service.ts                  ← orquestador de exportación
    models/
      export.model.ts                    ← interfaces de metadatos y opciones
```

El botón de exportación se añade en `EditorTopBarComponent` o en la `InkNavComponent`.

---

## Parte 1: Modelos

### `src/app/core/models/export.model.ts`

```typescript
export type ExportFormat = 'pdf-manuscript' | 'epub';
export type PageSize = 'a4' | 'letter';

export interface ExportMetadata {
  // Autor
  legalName: string;
  penName?: string;
  email: string;
  phone?: string;
  address?: string;
  agentName?: string;
  agentContact?: string;

  // Obra
  genre: string;
  pageSize: PageSize;
  language: string;         // BCP 47, default: 'es'
  copyrightYear: number;    // default: current year

  // EPUB adicional
  isbn?: string;
  publisher?: string;
  synopsis?: string;
}

export interface ExportOptions {
  format: ExportFormat;
  selectedDocumentIds: string[];   // IDs de los documentos a incluir, en orden
  metadata: ExportMetadata;
}

export const DEFAULT_EXPORT_METADATA: ExportMetadata = {
  legalName: '',
  email: '',
  genre: '',
  pageSize: 'a4',
  language: 'es',
  copyrightYear: new Date().getFullYear(),
};
```

---

## Parte 2: ExportService

### `src/app/core/services/export.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import epub from 'epub-gen-memory';
import { DocumentService } from './document.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ExportOptions, ExportMetadata } from '../models/export.model';
import { DocumentFile } from '../models/document.model';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private bridge = inject(TauriBridgeService);

  // ─── Entrada principal ───────────────────────────────────────────────────

  /**
   * Orquesta la exportación completa.
   * Carga los documentos, construye el contenido y delega al generador.
   */
  async export(
    options: ExportOptions,
    documents: DocumentFile[],
    projectTitle: string,
  ): Promise<void> {
    const ordered = options.selectedDocumentIds
      .map(id => documents.find(d => d.id === id))
      .filter((d): d is DocumentFile => !!d);

    if (options.format === 'pdf-manuscript') {
      await this.exportManuscriptPdf(ordered, options.metadata, projectTitle);
    } else {
      await this.exportEpub(ordered, options.metadata, projectTitle);
    }
  }

  // ─── PDF Manuscrito ───────────────────────────────────────────────────────

  private async exportManuscriptPdf(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
  ): Promise<void> {
    const wordCount = this.countWords(docs);
    const html = this.buildManuscriptHtml(docs, meta, title, wordCount);

    // Abrir ventana de impresión de Tauri
    await this.bridge.openPrintWindow(html);
  }

  /**
   * Construye el HTML completo del manuscrito con estilos SMF incrustados.
   */
  buildManuscriptHtml(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
    wordCount: number,
  ): string {
    const pageSize = meta.pageSize === 'a4' ? 'A4' : 'letter';
    const authorLine = meta.penName
      ? `${meta.penName} (${meta.legalName})`
      : meta.legalName;
    const wordCountFormatted = `~${Math.round(wordCount / 1000) * 1000}`.replace(
      /\B(?=(\d{3})+(?!\d))/g, '.',
    ) + ' palabras';

    const chaptersHtml = docs.map((doc, i) =>
      this.buildChapterHtml(doc, i === 0)
    ).join('\n');

    return `<!DOCTYPE html>
<html lang="${meta.language}">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: ${pageSize};
    margin: 2.5cm;
  }
  @page :first { /* Página de título sin header */
    @top-right { content: ''; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 2;
    color: #000;
    background: #fff;
    text-align: left;
  }

  /* Header en cada página (excepto portada) */
  @media print {
    body { counter-reset: page-num; }
  }

  /* Página de título */
  .title-page {
    page-break-after: always;
    height: 100vh;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .title-page .contact-block {
    font-size: 12pt;
    line-height: 1.5;
    position: absolute;
    top: 0; left: 0;
  }
  .title-page .wordcount-block {
    font-size: 12pt;
    position: absolute;
    top: 0; right: 0;
  }
  .title-page .center-block {
    position: absolute;
    top: 33%;
    left: 0; right: 0;
    text-align: center;
  }
  .title-page .center-block .book-title {
    font-size: 12pt;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .title-page .center-block .by-line {
    margin-top: 1em;
  }
  .title-page .genre-block {
    position: absolute;
    bottom: 0;
    left: 0; right: 0;
    text-align: center;
  }

  /* Capítulos */
  .chapter {
    page-break-before: always;
  }
  .chapter-title {
    text-align: center;
    padding-top: 33vh;
    padding-bottom: 2em;
    font-size: 12pt;
    font-weight: normal;
    text-transform: uppercase;
  }
  p {
    text-indent: 1.25cm;
    margin-bottom: 0;
  }
  /* Primer párrafo de capítulo: sin sangría */
  .chapter > p:first-of-type,
  .chapter-title + p {
    text-indent: 0;
  }
  blockquote {
    margin: 1em 2.5cm;
    text-indent: 0;
  }
  h1, h2, h3 {
    font-size: 12pt;
    font-weight: normal;
    text-align: center;
    text-transform: uppercase;
    margin: 2em 0 0 0;
    page-break-after: avoid;
  }

  /* Final del manuscrito */
  .manuscript-end {
    text-align: center;
    margin-top: 2em;
  }
</style>
</head>
<body>

<!-- Página de título -->
<div class="title-page">
  <div class="contact-block">
    ${meta.legalName}<br>
    ${meta.address ? meta.address + '<br>' : ''}
    ${meta.phone ? meta.phone + '<br>' : ''}
    ${meta.email}
    ${meta.agentName ? `<br><br>${meta.agentName}<br>${meta.agentContact ?? ''}` : ''}
  </div>
  <div class="wordcount-block">${wordCountFormatted}</div>
  <div class="center-block">
    <div class="book-title">${title}</div>
    <div class="by-line">by ${authorLine}</div>
  </div>
  <div class="genre-block">${meta.genre}</div>
</div>

<!-- Capítulos -->
${chaptersHtml}

<!-- Fin del manuscrito -->
<div class="manuscript-end"># # #</div>

</body>
</html>`;
  }

  private buildChapterHtml(doc: DocumentFile, isFirst: boolean): string {
    const html = generateHTML(doc.content as any, [StarterKit]);
    return `
<div class="chapter" ${isFirst ? 'style="page-break-before: avoid"' : ''}>
  <div class="chapter-title">${doc.title}</div>
  ${html}
</div>`;
  }

  // ─── EPUB ────────────────────────────────────────────────────────────────

  private async exportEpub(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
  ): Promise<void> {
    const savePath = await this.bridge.saveFileDialog(
      `${title}.epub`,
      [{ name: 'EPUB', extensions: ['epub'] }],
    );
    if (!savePath) return;

    const chapters = docs.map(doc => ({
      title: doc.title,
      content: generateHTML(doc.content as any, [StarterKit]),
    }));

    const buffer = await epub({
      title,
      author: meta.penName ?? meta.legalName,
      publisher: meta.publisher ?? '',
      description: meta.synopsis ?? '',
      lang: meta.language,
      isbn: meta.isbn,
      content: chapters,
    }, 'arraybuffer') as ArrayBuffer;

    await this.bridge.writeBinaryFile(savePath, buffer);
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

  /**
   * Cuenta las palabras de un conjunto de documentos.
   */
  countWords(docs: DocumentFile[]): number {
    return docs.reduce((total, doc) => {
      const text = generateHTML(doc.content as any, [StarterKit])
        .replace(/<[^>]+>/g, ' ')
        .trim();
      const words = text.split(/\s+/).filter(w => w.length > 0);
      return total + words.length;
    }, 0);
  }
}
```

---

## Parte 3: Nuevos comandos Tauri

### Añadir en `fs_commands.rs`

```rust
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Abre una ventana de previsualización/impresión con el HTML del manuscrito.
/// El usuario puede imprimir a PDF desde el diálogo del sistema.
#[tauri::command]
pub async fn open_print_window(app: AppHandle, html: String) -> Result<(), String> {
    // Escribir el HTML a un archivo temporal
    let temp_path = std::env::temp_dir().join("inkwell_manuscript_print.html");
    std::fs::write(&temp_path, html)
        .map_err(|e| e.to_string())?;

    // Abrir nueva ventana con el archivo temporal
    let url = format!("file://{}", temp_path.to_string_lossy());
    WebviewWindowBuilder::new(&app, "print", WebviewUrl::External(url.parse().unwrap()))
        .title("Inkwell — Exportar manuscrito")
        .inner_size(900.0, 1200.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Abre un diálogo de guardar archivo y retorna la ruta elegida.
#[tauri::command]
pub async fn save_file_dialog(
    app: AppHandle,
    default_name: String,
    extension: String,
) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    use tokio::sync::oneshot;

    let (tx, rx) = oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();

    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Archivo", &[extension.as_str()])
        .save_file(move |result| { let _ = tx.send(result); });

    match rx.await {
        Ok(Some(tauri_plugin_dialog::FilePath::Path(path))) =>
            Some(path.to_string_lossy().to_string()),
        _ => None,
    }
}

/// Escribe datos binarios en un archivo (para EPUB).
#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("Error creando {}: {}", path, e))?;
    file.write_all(&data)
        .map_err(|e| format!("Error escribiendo {}: {}", path, e))
}
```

Registrar en `main.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... comandos existentes ...
    open_print_window,
    save_file_dialog,
    write_binary_file,
])
```

### Añadir en `TauriBridgeService`

```typescript
openPrintWindow(html: string): Promise<void> {
  return invoke<void>('open_print_window', { html });
}

saveFileDialog(defaultName: string, extension: string): Promise<string | null> {
  return invoke<string | null>('save_file_dialog', { defaultName, extension });
}

writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
  return invoke<void>('write_binary_file', {
    path,
    data: Array.from(new Uint8Array(data)),
  });
}
```

---

## Parte 4: StepDocumentSelectorComponent

```typescript
@Component({
  selector: 'app-step-document-selector',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-col gap-4">
      <p class="text-ink-subtle text-sm">
        Selecciona los documentos a incluir en la exportación y ordénalos.
        Solo se incluyen documentos (no carpetas).
      </p>

      <!-- Controles rápidos -->
      <div class="flex gap-3">
        <button (click)="selectAll()"
          class="text-ink-accent text-xs hover:underline">Seleccionar todo</button>
        <button (click)="deselectAll()"
          class="text-ink-subtle text-xs hover:underline">Deseleccionar todo</button>
      </div>

      <!-- Lista de documentos -->
      <div class="flex flex-col gap-1 max-h-72 overflow-y-auto">
        @for (item of flatDocuments(); track item.id) {
          <label
            class="flex items-center gap-3 px-3 py-2 rounded cursor-pointer
                   hover:bg-ink-surface transition-colors"
            [style.paddingLeft.px]="(item.depth * 12) + 12">
            <input
              type="checkbox"
              [checked]="isSelected(item.id)"
              (change)="toggleDoc(item.id)"
              class="accent-ink-accent"/>
            <span class="text-ink-text text-sm truncate">{{ item.title }}</span>
            @if (item.wordCount > 0) {
              <span class="ml-auto text-ink-subtle text-xs shrink-0">
                {{ item.wordCount }} palabras
              </span>
            }
          </label>
        }
      </div>

      <!-- Recuento total -->
      <div class="flex justify-between items-center pt-2 border-t border-ink-border">
        <span class="text-ink-subtle text-xs">
          {{ selectedCount() }} documentos seleccionados
        </span>
        <span class="text-ink-subtle text-xs">
          ~{{ totalWordCount() | number }} palabras
        </span>
      </div>
    </div>
  `,
})
export class StepDocumentSelectorComponent {
  // Recibe el árbol aplanado de documentos con sus contenidos ya cargados
  documents = input.required<FlatDocument[]>();
  selectedIds = model<string[]>([]);  // two-way binding

  flatDocuments = computed(() => this.documents());
  selectedCount = computed(() => this.selectedIds().length);
  totalWordCount = computed(() => {
    return this.documents()
      .filter(d => this.selectedIds().includes(d.id))
      .reduce((sum, d) => sum + d.wordCount, 0);
  });

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggleDoc(id: string): void {
    this.selectedIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  }

  selectAll(): void {
    this.selectedIds.set(this.documents().map(d => d.id));
  }

  deselectAll(): void {
    this.selectedIds.set([]);
  }
}

export interface FlatDocument {
  id: string;
  title: string;
  depth: number;
  wordCount: number;
}
```

---

## Parte 5: StepMetadataComponent

```typescript
@Component({
  selector: 'app-step-metadata',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-col gap-4">

      <div class="grid grid-cols-2 gap-3">

        <!-- Nombre legal -->
        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Nombre legal *
          </label>
          <input [(ngModel)]="meta().legalName" (ngModelChange)="emitChange()"
            placeholder="Tu nombre completo"
            class="input-field"/>
        </div>

        <!-- Nombre de pluma -->
        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Nombre de pluma <span class="normal-case">(si es distinto)</span>
          </label>
          <input [(ngModel)]="penNameVal" (ngModelChange)="emitChange()"
            placeholder="Nombre de autor publicado"
            class="input-field"/>
        </div>

        <!-- Email -->
        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Email *
          </label>
          <input [(ngModel)]="meta().email" (ngModelChange)="emitChange()"
            type="email" placeholder="tu@email.com"
            class="input-field"/>
        </div>

        <!-- Teléfono -->
        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Teléfono
          </label>
          <input [(ngModel)]="phoneVal" (ngModelChange)="emitChange()"
            placeholder="+34 600 000 000"
            class="input-field"/>
        </div>

        <!-- Dirección -->
        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Ciudad, País
          </label>
          <input [(ngModel)]="addressVal" (ngModelChange)="emitChange()"
            placeholder="Madrid, España"
            class="input-field"/>
        </div>

        <!-- Agente -->
        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Agente literario <span class="normal-case">(si tienes representación)</span>
          </label>
          <input [(ngModel)]="agentVal" (ngModelChange)="emitChange()"
            placeholder="Nombre de la agencia / agente"
            class="input-field"/>
        </div>

        <!-- Género -->
        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Género literario *
          </label>
          <input [(ngModel)]="meta().genre" (ngModelChange)="emitChange()"
            placeholder="Novela de aventuras, Thriller..."
            class="input-field"/>
        </div>

        <!-- Año copyright -->
        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Año de copyright
          </label>
          <input [(ngModel)]="meta().copyrightYear" (ngModelChange)="emitChange()"
            type="number" [min]="2000" [max]="2100"
            class="input-field"/>
        </div>

      </div>

      <!-- Sinopsis (solo para EPUB) -->
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
})
export class StepMetadataComponent {
  meta   = model.required<ExportMetadata>();
  format = input<ExportFormat>('pdf-manuscript');

  // Campos opcionales como variables locales para ngModel
  penNameVal  = '';
  phoneVal    = '';
  addressVal  = '';
  agentVal    = '';
  synopsisVal = '';

  emitChange(): void {
    this.meta.update(m => ({
      ...m,
      penName:     this.penNameVal || undefined,
      phone:       this.phoneVal || undefined,
      address:     this.addressVal || undefined,
      agentName:   this.agentVal || undefined,
      synopsis:    this.synopsisVal || undefined,
    }));
  }
}
```

---

## Parte 6: StepFormatComponent

```typescript
@Component({
  selector: 'app-step-format',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-col gap-6">

      <!-- Selección de formato -->
      <div class="flex flex-col gap-2">
        <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
          Formato de exportación
        </label>
        <div class="flex gap-3">

          <button
            (click)="format.set('pdf-manuscript')"
            class="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2
                   transition-all text-left"
            [class]="format() === 'pdf-manuscript'
              ? 'border-ink-accent bg-ink-surface'
              : 'border-ink-border hover:border-ink-muted'">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5"
                 [class]="format() === 'pdf-manuscript' ? 'text-ink-accent' : 'text-ink-subtle'">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0
                       0 0 2-2V8z"/>
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
            class="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2
                   transition-all text-left"
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

      <!-- Opciones PDF -->
      @if (format() === 'pdf-manuscript') {
        <div class="flex flex-col gap-3">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Tamaño de página
          </label>
          <div class="flex gap-3">
            @for (size of pageSizes; track size.id) {
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" [value]="size.id"
                  [(ngModel)]="pageSize"
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
  format   = model<ExportFormat>('pdf-manuscript');
  pageSize = signal<PageSize>('a4');

  readonly pageSizes = [
    { id: 'a4' as PageSize,     label: 'A4',     desc: '210×297mm' },
    { id: 'letter' as PageSize, label: 'Letter', desc: '8.5×11"' },
  ];
}
```

---

## Parte 7: ExportModalComponent

Wizard de 3 pasos con navegación y validación.

```typescript
@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [
    InkModalComponent, InkButtonComponent,
    StepDocumentSelectorComponent,
    StepMetadataComponent,
    StepFormatComponent,
  ],
  template: `
    <ink-modal [title]="stepTitle()" [hasActions]="false" (closed)="closed.emit()">

      <!-- Indicador de pasos -->
      <div class="flex items-center gap-2 mb-6 -mt-2">
        @for (step of steps; track step.n) {
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs
                        font-medium transition-colors"
                 [class]="currentStep() >= step.n
                   ? 'bg-ink-accent text-ink-panel'
                   : 'bg-ink-border text-ink-subtle'">
              {{ step.n }}
            </div>
            <span class="text-xs"
                  [class]="currentStep() === step.n ? 'text-ink-text' : 'text-ink-subtle'">
              {{ step.label }}
            </span>
            @if (!$last) {
              <div class="w-8 h-px bg-ink-border mx-1"></div>
            }
          </div>
        }
      </div>

      <!-- Contenido del paso -->
      @switch (currentStep()) {
        @case (1) {
          <app-step-format
            [(format)]="selectedFormat"
            (pageSizeChange)="onPageSizeChange($event)"/>
        }
        @case (2) {
          <app-step-document-selector
            [documents]="flatDocuments()"
            [(selectedIds)]="selectedIds"/>
        }
        @case (3) {
          <app-step-metadata
            [(meta)]="metadata"
            [format]="selectedFormat()"/>
        }
      }

      <!-- Navegación entre pasos -->
      <div class="flex justify-between mt-6 pt-4 border-t border-ink-border">
        <ink-button
          variant="ghost"
          (clicked)="currentStep() === 1 ? closed.emit() : currentStep.update(s => s - 1)">
          {{ currentStep() === 1 ? 'Cancelar' : '← Anterior' }}
        </ink-button>

        @if (currentStep() < 3) {
          <ink-button
            variant="primary"
            [disabled]="!canAdvance()"
            (clicked)="currentStep.update(s => s + 1)">
            Siguiente →
          </ink-button>
        } @else {
          <ink-button
            variant="primary"
            [disabled]="!canExport()"
            [loading]="exporting()"
            (clicked)="doExport()">
            Exportar
          </ink-button>
        }
      </div>

    </ink-modal>
  `,
})
export class ExportModalComponent implements OnInit {
  private exportService  = inject(ExportService);
  private projectService = inject(ProjectService);
  private docService     = inject(DocumentService);
  private toast          = inject(ToastService);

  closed    = output<void>();
  exporting = signal(false);

  currentStep    = signal(1);
  selectedFormat = signal<ExportFormat>('pdf-manuscript');
  selectedIds    = signal<string[]>([]);
  metadata       = signal<ExportMetadata>({ ...DEFAULT_EXPORT_METADATA });
  flatDocuments  = signal<FlatDocument[]>([]);
  pageSizeChoice = signal<PageSize>('a4');

  readonly steps = [
    { n: 1, label: 'Formato' },
    { n: 2, label: 'Documentos' },
    { n: 3, label: 'Metadatos' },
  ];

  stepTitle = computed(() => {
    const titles = ['', 'Elegir formato', 'Seleccionar documentos', 'Información del autor'];
    return `Exportar — ${titles[this.currentStep()]}`;
  });

  async ngOnInit(): Promise<void> {
    await this.loadFlatDocuments();
    // Pre-seleccionar todos los documentos
    this.selectedIds.set(this.flatDocuments().map(d => d.id));
  }

  canAdvance(): boolean {
    if (this.currentStep() === 2) return this.selectedIds().length > 0;
    return true;
  }

  canExport(): boolean {
    const m = this.metadata();
    return !!(m.legalName.trim() && m.email.trim() && m.genre.trim());
  }

  onPageSizeChange(size: PageSize): void {
    this.pageSizeChoice.set(size);
    this.metadata.update(m => ({ ...m, pageSize: size }));
  }

  async doExport(): Promise<void> {
    this.exporting.set(true);
    try {
      const docs = await this.loadSelectedDocuments();
      await this.exportService.export(
        {
          format: this.selectedFormat(),
          selectedDocumentIds: this.selectedIds(),
          metadata: this.metadata(),
        },
        docs,
        this.projectService.project()!.name,
      );
      this.toast.success(
        this.selectedFormat() === 'epub'
          ? 'EPUB guardado correctamente.'
          : 'Ventana de impresión abierta. Usa "Guardar como PDF" en el diálogo.'
      );
      this.closed.emit();
    } catch (e) {
      this.toast.error(`Error al exportar: ${e}`);
    } finally {
      this.exporting.set(false);
    }
  }

  private async loadFlatDocuments(): Promise<void> {
    const project = this.projectService.project();
    if (!project) return;

    const flat = this.flattenTree(project.tree, 0);
    // Cargar word counts de forma paralela
    const withCounts = await Promise.all(
      flat.map(async item => {
        try {
          const doc = await this.docService.loadDocument(item.id);
          return { ...item, wordCount: this.exportService.countWords([doc]) };
        } catch {
          return { ...item, wordCount: 0 };
        }
      })
    );
    this.flatDocuments.set(withCounts);
  }

  private async loadSelectedDocuments(): Promise<DocumentFile[]> {
    return Promise.all(
      this.selectedIds().map(id => this.docService.loadDocument(id))
    );
  }

  private flattenTree(
    nodes: TreeNode[],
    depth: number,
  ): Array<{ id: string; title: string; depth: number; wordCount: number }> {
    return nodes.flatMap(n => {
      if (n.type === 'folder') return this.flattenTree(n.children, depth + 1);
      return [{ id: n.id, title: n.title, depth, wordCount: 0 }];
    });
  }
}
```

---

## Parte 8: Integración en EditorLayoutComponent

Añadir el botón de exportación en la top bar y el modal:

**En `EditorTopBarComponent`** — añadir botón de exportación:
```typescript
exportRequested = output<void>();
```

```html
<!-- Añadir en la top bar, antes del botón de modo focus -->
<button
  (click)="exportRequested.emit()"
  title="Exportar"
  class="p-1.5 rounded text-ink-subtle hover:text-ink-text
         hover:bg-ink-border transition-colors">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
</button>
```

**En `EditorLayoutComponent`**:
```typescript
showExportModal = signal(false);
```

```html
@if (showExportModal()) {
  <app-export-modal (closed)="showExportModal.set(false)"/>
}
```

---

## Criterios de aceptación

**Flujo general:**
- [ ] El botón de exportación en la top bar abre el modal
- [ ] El wizard tiene 3 pasos con indicador visual del paso actual
- [ ] Se puede navegar hacia atrás sin perder los datos introducidos

**Paso 1 — Formato:**
- [ ] Se muestran las dos opciones (PDF manuscrito y EPUB) con descripción
- [ ] Al seleccionar PDF aparece el selector de tamaño de página (A4 / Letter)
- [ ] A4 está seleccionado por defecto

**Paso 2 — Documentos:**
- [ ] La lista muestra todos los documentos del proyecto respetando la jerarquía del binder
- [ ] Las carpetas no aparecen, solo los documentos
- [ ] Cada documento muestra su recuento de palabras
- [ ] Se muestran todos los documentos preseleccionados por defecto
- [ ] "Seleccionar todo" y "Deseleccionar todo" funcionan
- [ ] El pie muestra el total de documentos seleccionados y la suma de palabras
- [ ] No se puede avanzar si no hay ningún documento seleccionado

**Paso 3 — Metadatos:**
- [ ] Los campos obligatorios (nombre legal, email, género) están marcados con *
- [ ] Al seleccionar EPUB aparece el campo de sinopsis
- [ ] El año de copyright muestra el año actual por defecto
- [ ] No se puede exportar con campos obligatorios vacíos

**Exportación PDF:**
- [ ] Al exportar, se abre una nueva ventana de Tauri con el manuscrito renderizado
- [ ] La ventana muestra la página de título con: datos de contacto (arriba izquierda), recuento de palabras (arriba derecha), título en MAYÚSCULAS centrado a 1/3 de la página, nombre del autor y género
- [ ] Cada capítulo comienza en página nueva con el título centrado a 1/3 de la página
- [ ] El texto está en Times New Roman 12pt, doble espaciado, margen derecho irregular
- [ ] Los párrafos tienen sangría de 1.25cm
- [ ] El primer párrafo de cada capítulo no tiene sangría
- [ ] Al final aparece "# # #" centrado
- [ ] El toast indica al usuario que use "Guardar como PDF" en el diálogo de impresión

**Exportación EPUB:**
- [ ] Se abre el diálogo de guardar con nombre sugerido `[título].epub`
- [ ] El archivo `.epub` se guarda en la ruta elegida
- [ ] Abrir el EPUB en un lector (Calibre, Foliate) muestra todos los capítulos seleccionados
- [ ] Los metadatos del EPUB (título, autor, idioma) son correctos
- [ ] El toast confirma que el archivo se guardó correctamente

---

## Testing manual (TESTING.md — añadir sección INK-10)

1. Abrir un proyecto con al menos 3 documentos en carpetas distintas
2. Pulsar el botón de exportación → se abre el modal en el Paso 1
3. Seleccionar "PDF Manuscrito" y tamaño "A4" → pulsar "Siguiente"
4. Verificar que los documentos aparecen con su conteo de palabras
5. Deseleccionar un documento → el total se actualiza
6. Intentar avanzar sin ningún documento → botón deshabilitado
7. Reseleccionar → avanzar al Paso 3
8. Dejar nombre legal vacío → botón "Exportar" deshabilitado
9. Rellenar todos los campos obligatorios → pulsar "Exportar"
10. Verificar que se abre la ventana de previsualización con el manuscrito formateado
11. Comprobar visualmente: página de título correcta, capítulos en páginas nuevas, doble espaciado, fuente Times New Roman
12. Usar "Imprimir → Guardar como PDF" del sistema → el PDF se guarda
13. Volver al modal → seleccionar EPUB → repetir el flujo
14. Abrir el `.epub` resultante en Calibre o Foliate → verificar capítulos y metadatos

---

## Lo que queda fuera de esta spec

- Exportación a `.docx` (Word) — backlog
- Portada personalizada para EPUB con imagen
- Previsualización del EPUB dentro de Inkwell
- Opciones de tipografía personalizadas para EPUB
- Notas al pie y notas al final en el manuscrito
