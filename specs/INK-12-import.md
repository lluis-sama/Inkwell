# INK-12 — Importación de documentos (TXT, Markdown, DOCX)

## Objetivo

Permitir al usuario importar documentos externos al proyecto activo. Se soportan tres formatos: texto plano (`.txt`), Markdown (`.md`) y Word/LibreOffice (`.docx`). El documento importado se crea en el binder como un documento nuevo y se abre en el editor.

---

## Nuevas dependencias

```bash
pnpm add mammoth marked
```

| Librería | Uso |
|---|---|
| `mammoth` | DOCX → HTML. Soporta Word y LibreOffice Writer. |
| `marked` | Markdown → HTML. |

`generateJSON` de `@tiptap/core` ya está disponible (complementario de `generateHTML` que usamos en INK-10).

---

## Nuevos comandos Tauri

### Añadir en `fs_commands.rs`

```rust
/// Abre un diálogo de selección de archivos (no carpetas).
/// extensions: lista de extensiones sin punto, p.ej. ["txt", "md", "docx"]
/// multiple: si true, permite seleccionar varios archivos
/// Retorna las rutas seleccionadas, o vec vacío si el usuario cancela.
#[tauri::command]
pub async fn open_files_dialog(
    app: AppHandle,
    extensions: Vec<String>,
    multiple: bool,
) -> Vec<String> {
    use tauri_plugin_dialog::DialogExt;
    use tokio::sync::oneshot;
    use tauri_plugin_dialog::FilePath;

    let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();

    let (tx, rx) = oneshot::channel::<Option<Vec<FilePath>>>();

    let mut builder = app.dialog().file().add_filter("Documentos", &ext_refs);

    if multiple {
        builder.pick_files(move |result| { let _ = tx.send(result); });
    } else {
        // pick_file retorna Option<FilePath>, adaptamos al mismo canal
        let (tx2, rx2) = oneshot::channel::<Option<FilePath>>();
        app.dialog()
            .file()
            .add_filter("Documentos", &ext_refs)
            .pick_file(move |result| { let _ = tx2.send(result); });
        let single = rx2.await.ok().flatten();
        return match single {
            Some(FilePath::Path(p)) => vec![p.to_string_lossy().to_string()],
            _ => vec![],
        };
    }

    match rx.await {
        Ok(Some(paths)) => paths.into_iter().filter_map(|p| {
            if let FilePath::Path(path) = p { Some(path.to_string_lossy().to_string()) }
            else { None }
        }).collect(),
        _ => vec![],
    }
}

/// Lee un archivo y retorna su contenido como bytes (Vec<u8>).
/// Necesario para leer DOCX (formato binario).
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path)
        .map_err(|e| format!("Error leyendo {}: {}", path, e))
}
```

Registrar en `main.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ...comandos existentes...
    open_files_dialog,
    read_file_bytes,
])
```

### Añadir en `TauriBridgeService`

```typescript
/**
 * Abre el diálogo de selección de archivos.
 * Retorna las rutas seleccionadas (array vacío si cancela).
 */
openFilesDialog(extensions: string[], multiple = false): Promise<string[]> {
  return invoke<string[]>('open_files_dialog', { extensions, multiple });
}

/**
 * Lee un archivo como bytes. Necesario para DOCX.
 * Retorna un array de números (0-255).
 */
readFileBytes(path: string): Promise<number[]> {
  return invoke<number[]>('read_file_bytes', { path });
}
```

---

## ImportService

### `src/app/core/services/import.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { marked } from 'marked';
import mammoth from 'mammoth';
import { TauriBridgeService } from './tauri-bridge.service';
import { DocumentService }   from './document.service';
import { ProjectService }    from './project.service';
import { ToastService }      from '../../../shared/services/toast.service';

export interface ImportResult {
  documentId: string;
  title:      string;
  warnings:   string[];
}

const SUPPORTED_EXTENSIONS = ['txt', 'md', 'docx'];

@Injectable({ providedIn: 'root' })
export class ImportService {
  private bridge  = inject(TauriBridgeService);
  private docSvc  = inject(DocumentService);
  private project = inject(ProjectService);
  private toast   = inject(ToastService);

  // ─── Entrada principal ───────────────────────────────────────────────────

  /**
   * Abre el diálogo de selección de archivos e importa los seleccionados.
   * Retorna los resultados de cada importación.
   */
  async openAndImport(
    parentId: string | null = null,
  ): Promise<ImportResult[]> {
    const paths = await this.bridge.openFilesDialog(SUPPORTED_EXTENSIONS, true);
    if (paths.length === 0) return [];

    const results: ImportResult[] = [];

    for (const path of paths) {
      try {
        const result = await this.importFile(path, parentId);
        results.push(result);
      } catch (e) {
        this.toast.error(`Error importando ${this.basename(path)}: ${e}`);
      }
    }

    return results;
  }

  /**
   * Importa un único archivo a partir de su ruta absoluta.
   */
  async importFile(
    filePath: string,
    parentId: string | null = null,
  ): Promise<ImportResult> {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      throw new Error(`Formato no soportado: .${ext}`);
    }

    const title   = this.titleFromPath(filePath);
    const warnings: string[] = [];

    let tiptapContent: object;

    if (ext === 'txt') {
      tiptapContent = await this.importTxt(filePath);
    } else if (ext === 'md') {
      tiptapContent = await this.importMarkdown(filePath);
    } else {
      const result  = await this.importDocx(filePath);
      tiptapContent = result.content;
      warnings.push(...result.warnings);
    }

    const doc = await this.docSvc.createDocument(title, parentId);
    const saved = await this.docSvc.saveDocument({ ...doc, content: tiptapContent });

    return { documentId: saved.id, title: saved.title, warnings };
  }

  // ─── Conversores ─────────────────────────────────────────────────────────

  private async importTxt(filePath: string): Promise<object> {
    const raw  = await this.bridge.readJsonFile(filePath);  // lee como texto
    const paragraphs = raw
      .split(/\n{2,}/)              // separar por líneas en blanco
      .map(p => p.trim())
      .filter(p => p.length > 0);

    return {
      type: 'doc',
      content: paragraphs.map(text => ({
        type: 'paragraph',
        content: text
          // Convertir saltos de línea simples a hardBreak
          .split('\n')
          .flatMap((line, i, arr) => {
            const nodes: object[] = [{ type: 'text', text: line }];
            if (i < arr.length - 1) nodes.push({ type: 'hardBreak' });
            return nodes;
          })
          .filter((n: any) => n.type !== 'text' || n.text.length > 0),
      })),
    };
  }

  private async importMarkdown(filePath: string): Promise<object> {
    const raw  = await this.bridge.readJsonFile(filePath);
    const html = await marked(raw, { async: false }) as string;
    return generateJSON(html, [StarterKit]);
  }

  private async importDocx(
    filePath: string,
  ): Promise<{ content: object; warnings: string[] }> {
    const bytes  = await this.bridge.readFileBytes(filePath);
    const buffer = new Uint8Array(bytes).buffer;

    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });

    const warnings = result.messages
      .filter(m => m.type === 'warning')
      .map(m => m.message);

    const content = generateJSON(result.value, [StarterKit]);

    return { content, warnings };
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────

  private basename(path: string): string {
    return path.split('/').pop() ?? path;
  }

  /**
   * Convierte el nombre de archivo en un título legible.
   * "mi-capitulo-1.md" → "Mi capitulo 1"
   */
  private titleFromPath(filePath: string): string {
    const base    = this.basename(filePath);
    const noExt   = base.replace(/\.[^.]+$/, '');
    const cleaned = noExt.replace(/[-_]/g, ' ').trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
}
```

---

## Botón de importación en BinderComponent

### Modificar `BinderComponent`

Añadir `ImportService` y un nuevo método:

```typescript
private importService = inject(ImportService);

importing = signal(false);

async importDocuments(): Promise<void> {
  this.importing.set(true);
  try {
    const results = await this.importService.openAndImport(null);

    if (results.length === 0) return;

    // Mostrar warnings si los hay (común en DOCX con formato complejo)
    const allWarnings = results.flatMap(r => r.warnings);
    if (allWarnings.length > 0) {
      this.toast.show(
        `Importado con advertencias: puede que el formato complejo no se haya convertido perfectamente.`,
        'warning',
        6000,
      );
    } else {
      this.toast.success(
        results.length === 1
          ? `"${results[0].title}" importado correctamente.`
          : `${results.length} documentos importados correctamente.`
      );
    }

    // Navegar al primer documento importado
    const first = results[0];
    const node = this.findNode(
      this.projectService.project()?.tree ?? [],
      first.documentId,
    );
    if (node) this.documentOpened.emit(node);

  } finally {
    this.importing.set(false);
  }
}
```

### Añadir botón en el template del header del binder

```html
<!-- Junto a los botones de nuevo documento y nueva carpeta -->
<button
  (click)="importDocuments()"
  [disabled]="importing()"
  title="Importar documento (TXT, MD, DOCX)"
  class="p-1 rounded text-ink-subtle hover:text-ink-text
         hover:bg-ink-border transition-colors disabled:opacity-40">
  @if (importing()) {
    <span class="inline-block w-3.5 h-3.5 border border-current
                 border-t-transparent rounded-full animate-spin"></span>
  } @else {
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17,8 12,3 7,8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  }
</button>
```

---

## Comportamiento esperado por formato

### TXT
- Los párrafos se delimitan por **líneas en blanco** (una o más `\n` consecutivas)
- Los saltos de línea simples dentro de un párrafo se convierten en `hardBreak`
- Sin interpretación de formato — todo el texto como texto plano

### Markdown
- `# Título` → heading level 1
- `## Subtítulo` → heading level 2
- `**negrita**` → bold
- `*cursiva*` → italic
- `-` o `*` como lista → bulletList
- `1.` como lista → orderedList
- ` ``` ` → codeBlock
- `>` → blockquote
- El resto del marcado que TipTap no reconoce se convierte a texto plano

### DOCX
- Conversión vía `mammoth.js` → HTML → TipTap JSON
- Se preserva: headings, párrafos, negrita, cursiva, listas, hipervínculos
- Se pierde o simplifica: tablas (se aplana a texto), imágenes (se omiten), columnas, estilos personalizados, notas al pie
- Si hay advertencias de conversión, se muestra un toast de warning al usuario

---

## Criterios de aceptación

**Flujo general:**
- [ ] El botón de importación (↑) aparece en el header del binder
- [ ] Al pulsar, se abre el diálogo del sistema filtrado por `.txt`, `.md`, `.docx`
- [ ] Se pueden seleccionar varios archivos a la vez
- [ ] Cancelar el diálogo no produce ningún error ni toast
- [ ] Durante la importación el botón muestra un spinner y queda deshabilitado

**TXT:**
- [ ] Un archivo `.txt` con párrafos separados por líneas en blanco crea los párrafos correctamente en el editor
- [ ] Los saltos de línea simples dentro de un párrafo se respetan como `hardBreak`
- [ ] Un archivo vacío crea un documento vacío sin errores

**Markdown:**
- [ ] Los headings (`#`, `##`, `###`) se convierten correctamente
- [ ] Negrita, cursiva, listas y blockquotes funcionan
- [ ] Código inline y bloques de código funcionan
- [ ] Markdown sin formato especial se importa como texto plano

**DOCX:**
- [ ] Un `.docx` con párrafos y headings básicos se convierte correctamente
- [ ] La negrita y la cursiva se preservan
- [ ] Las listas numeradas y con viñetas se preservan
- [ ] Un DOCX con imágenes o tablas se importa sin errores (las imágenes se omiten, las tablas se aplanan)
- [ ] Si mammoth genera advertencias, aparece un toast de `warning` con el mensaje correspondiente

**Resultado:**
- [ ] El documento importado aparece en la raíz del binder con el nombre derivado del archivo
- [ ] El documento se abre automáticamente en el editor tras la importación
- [ ] Al importar varios archivos, todos aparecen en el binder y se abre el primero
- [ ] El contenido importado se puede editar con normalidad en TipTap
- [ ] El documento se puede mover a una carpeta con drag & drop (INK-09)

**Errores:**
- [ ] Intentar importar un formato no soportado muestra toast de error claro
- [ ] Un archivo corrupto o ilegible muestra toast de error sin crashear la app
- [ ] Si falla la importación de uno de varios archivos, los demás se importan igualmente

---

## Limitaciones documentadas (mostrar en tooltip del botón o en docs)

- Las **imágenes** en DOCX se omiten
- Las **tablas** en DOCX se aplanan a texto sin estructura
- El **formato personalizado** (estilos de Word, columnas, encabezados de página) se pierde
- Los **comentarios y revisiones** de Word se ignoran
- Los **campos de formulario** de Word se convierten a texto plano

---

## Lo que NO hacer en esta spec

- No importar RTF, EPUB, ODT ni PDF
- No implementar importación masiva de carpetas completas
- No preservar imágenes en ningún formato (backlog con TipTap Image extension)
- No implementar previsualización del contenido antes de importar
