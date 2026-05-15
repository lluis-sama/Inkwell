# INK-16 — Polish final

## Objetivo

Cuatro mejoras independientes que cierran el MVP de Inkwell:

1. **Corrector ortográfico** — activar el spell check nativo del sistema en el editor
2. **Estado de documento en el binder** — etiquetar el progreso de cada capítulo
3. **Find & replace en el documento activo** — buscar y reemplazar dentro del editor TipTap
4. **Exportación a DOCX** — tercera opción en el wizard de exportación de INK-10

Ninguna de las cuatro tiene dependencias entre sí. El Implementer puede ejecutarlas en cualquier orden.

---

## Parte 1: Corrector ortográfico

### Dependencias
Ninguna. El WebView de Tauri hereda Hunspell del sistema a través de WebKit.

### Modificar `TiptapEditorComponent`

Añadir el atributo `spellcheck` al elemento del editor, controlado por un input:

```typescript
// Nuevo input
spellcheck = input<boolean>(true);
```

En el template:

```html
<div
  #editorEl
  [attr.spellcheck]="spellcheck()"
  class="flex-1 overflow-y-auto px-16 py-12 focus:outline-none">
</div>
```

Eso es todo para activarlo. WebKit renderizará los subrayados rojos de ortografía automáticamente.

### Toggle en settings

En `InkSettingsModalComponent`, sección "Editor", añadir la opción:

```typescript
// Nuevo campo en el componente, guardado en project.json settings
spellcheck = true;
```

Añadir a `ProjectSettings` en `project.model.ts`:

```typescript
export interface ProjectSettings {
  autosaveInterval: number;
  maxSnapshots:     number;
  aiModel:          string;
  spellcheck:       boolean;  // NUEVO — default: true
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autosaveInterval: 30,
  maxSnapshots:     10,
  aiModel:          'claude-sonnet-4-20250514',
  spellcheck:       true,   // NUEVO
};
```

En la sección Editor del modal de settings:

```html
<div class="flex items-center justify-between">
  <div class="flex flex-col gap-0.5">
    <span class="text-ink-text text-sm">Corrector ortográfico</span>
    <span class="text-ink-subtle text-xs">
      Usa el diccionario del idioma configurado en el sistema
    </span>
  </div>
  <label class="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" [(ngModel)]="spellcheck"
           class="sr-only peer"/>
    <div class="w-9 h-5 bg-ink-border peer-focus:ring-2 peer-focus:ring-ink-accent
                rounded-full peer peer-checked:bg-ink-accent
                peer-checked:after:translate-x-full after:content-['']
                after:absolute after:top-0.5 after:left-0.5
                after:bg-white after:rounded-full after:h-4 after:w-4
                after:transition-all"></div>
  </label>
</div>
```

En `saveEditorSettings()`:
```typescript
await this.projectService.updateSettings({
  autosaveInterval: this.autosaveInterval,
  maxSnapshots:     this.maxSnapshots,
  spellcheck:       this.spellcheck,
});
```

### Pasar el setting al editor

En `EditorLayoutComponent`, pasar el setting al editor:

```html
<app-tiptap-editor
  [content]="activeDocument()!.content"
  [typewriterMode]="typewriterMode()"
  [spellcheck]="projectService.project()?.settings.spellcheck ?? true"
  (contentChanged)="onContentChanged($event)"/>
```

---

## Parte 2: Estado de documento en el binder

### Modelo de datos

Añadir `status` a `TreeNode` en `project.model.ts`:

```typescript
export type DocumentStatus =
  | 'draft'      // Borrador
  | 'revised'    // En revisión
  | 'final'      // Finalizado
  | 'todo'       // Por escribir
  | 'notes';     // Solo notas

export interface TreeNode {
  id:       string;
  title:    string;
  type:     'folder' | 'document';
  children: TreeNode[];
  status?:  DocumentStatus;   // NUEVO — undefined = sin estado
}

export const DOCUMENT_STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; color: string }
> = {
  todo:     { label: 'Por escribir', color: '#6c7086' },  // overlay0
  draft:    { label: 'Borrador',     color: '#89b4fa' },  // blue
  revised:  { label: 'En revisión',  color: '#f9e2af' },  // yellow
  final:    { label: 'Finalizado',   color: '#a6e3a1' },  // green
  notes:    { label: 'Solo notas',   color: '#cba6f7' },  // mauve
};
```

### Nuevo método en `ProjectService`

```typescript
async updateNodeStatus(
  id: string,
  status: DocumentStatus | undefined,
): Promise<void> {
  this.project.update(p =>
    p ? { ...p, tree: setNodeStatus(p.tree, id, status) } : p
  );
  await this.saveProjectOnly();
}
```

Función pura (añadir junto a las demás de árbol):

```typescript
function setNodeStatus(
  tree: TreeNode[],
  id: string,
  status: DocumentStatus | undefined,
): TreeNode[] {
  return tree.map(n => {
    if (n.id === id) return { ...n, status };
    return { ...n, children: setNodeStatus(n.children, id, status) };
  });
}
```

### Indicador visual en `BinderNodeComponent`

Añadir un punto de color junto al icono del documento:

```html
<!-- Junto al icono del documento, antes del título -->
@if (node().type === 'document' && node().status) {
  <span
    class="w-1.5 h-1.5 rounded-full shrink-0"
    [style.background]="statusColor(node().status!)"
    [title]="statusLabel(node().status!)">
  </span>
}
```

Métodos en el componente:

```typescript
import { DOCUMENT_STATUS_CONFIG, DocumentStatus } from '../../../core/models/project.model';

statusColor(status: DocumentStatus): string {
  return DOCUMENT_STATUS_CONFIG[status]?.color ?? 'transparent';
}

statusLabel(status: DocumentStatus): string {
  return DOCUMENT_STATUS_CONFIG[status]?.label ?? '';
}
```

### Menú contextual del binder — añadir submenu de estado

En `BinderContextMenuComponent`, añadir las opciones de estado al menú contextual de documentos.

Actualizar `contextActions()` en `BinderComponent`:

```typescript
contextActions = (): ContextMenuAction[] => {
  const node = this.contextMenu()?.node;
  if (!node) return [];

  const actions: ContextMenuAction[] = [
    { label: 'Renombrar',  action: 'rename' },
  ];

  if (node.type === 'document') {
    // Separador visual + opciones de estado
    actions.push(
      { label: '─────────────', action: 'separator', disabled: true },
      { label: '○  Sin estado',        action: 'status:clear' },
      { label: '○  Por escribir',      action: 'status:todo' },
      { label: '○  Borrador',          action: 'status:draft' },
      { label: '○  En revisión',       action: 'status:revised' },
      { label: '●  Finalizado',        action: 'status:final' },
      { label: '◇  Solo notas',        action: 'status:notes' },
      { label: '─────────────', action: 'separator', disabled: true },
    );
  }

  if (node.type === 'folder') {
    actions.push(
      { label: 'Nuevo documento aquí', action: 'add-document' },
      { label: 'Nueva carpeta aquí',   action: 'add-folder' },
    );
  }

  actions.push({ label: 'Eliminar', action: 'delete', danger: true });
  return actions;
};
```

Actualizar `onContextAction()` en `BinderComponent`:

```typescript
async onContextAction(action: string): Promise<void> {
  const node = this.contextMenu()?.node;
  this.closeContextMenu();
  if (!node) return;

  if (action.startsWith('status:')) {
    const status = action === 'status:clear'
      ? undefined
      : action.replace('status:', '') as DocumentStatus;
    await this.projectService.updateNodeStatus(node.id, status);
    return;
  }

  // ...resto de acciones existentes...
}
```

Actualizar `ContextMenuAction` para soportar items deshabilitados:

```typescript
export interface ContextMenuAction {
  label:     string;
  action:    string;
  danger?:   boolean;
  disabled?: boolean;
}
```

En el template de `BinderContextMenuComponent`:

```html
@for (item of actions(); track item.action) {
  @if (item.disabled) {
    <div class="px-4 py-1 text-ink-border text-xs select-none">
      {{ item.label.replace(/─/g, '').trim() || '' }}
      <hr class="border-ink-border"/>
    </div>
  } @else {
    <button
      (click)="actionSelected.emit(item.action)"
      class="w-full text-left px-4 py-2 text-sm transition-colors"
      [class]="item.danger
        ? 'text-ink-danger hover:bg-ink-border'
        : 'text-ink-text hover:bg-ink-border'">
      {{ item.label }}
    </button>
  }
}
```

---

## Parte 3: Find & Replace en el documento activo

### Nueva dependencia

```bash
pnpm add @tiptap/extension-search-and-replace
```

### Modificar `TiptapEditorComponent`

```typescript
import SearchAndReplace from '@tiptap/extension-search-and-replace';

// En las extensiones del editor:
this.editor = new Editor({
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: this.placeholder() }),
    CharacterCount,
    SearchAndReplace.configure({
      searchResultClass: 'search-result',
      caseSensitive:     false,
      disableRegex:      true,
    }),
  ],
  // ...
});
```

Añadir estilos para los resultados resaltados en los estilos del componente:

```css
/* Resultado actual */
::ng-deep .tiptap-host .ProseMirror .search-result {
  background: var(--ink-warning);
  color: var(--ink-panel);
  border-radius: 2px;
}

/* Resultado activo (el seleccionado) */
::ng-deep .tiptap-host .ProseMirror .search-result-current {
  background: var(--ink-accent);
  color: var(--ink-panel);
  border-radius: 2px;
}
```

Exponer métodos de búsqueda al componente padre:

```typescript
find(query: string, caseSensitive = false): void {
  if (!this.editor) return;
  this.editor.commands.setSearchTerm(query);
  this.editor.commands.setCaseSensitive(caseSensitive);
}

findNext(): void {
  this.editor?.commands.nextSearchResult();
}

findPrev(): void {
  this.editor?.commands.previousSearchResult();
}

replace(replacement: string): void {
  this.editor?.commands.replace(replacement);
}

replaceAll(replacement: string): void {
  this.editor?.commands.replaceAll(replacement);
}

clearSearch(): void {
  this.editor?.commands.setSearchTerm('');
}

getSearchResultCount(): { current: number; total: number } {
  const results = (this.editor?.storage.searchAndReplace as any);
  return {
    current: (results?.resultIndex ?? 0) + 1,
    total:   results?.results?.length ?? 0,
  };
}
```

### `FindReplaceBarComponent`

### `src/app/features/editor/tiptap/find-replace-bar.component.ts`

```typescript
import {
  Component, output, signal, input,
  ViewChild, ElementRef, AfterViewInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-find-replace-bar',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-col border-b border-ink-border bg-ink-panel px-4 py-2 gap-2 shrink-0">

      <!-- Fila de búsqueda -->
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 flex-1 px-3 py-1.5 rounded
                    bg-ink-bg border border-ink-border
                    focus-within:border-ink-accent transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" class="text-ink-subtle shrink-0">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            #searchInput
            [(ngModel)]="searchQuery"
            (ngModelChange)="queryChanged.emit({ query: $event, caseSensitive: caseSensitive() })"
            placeholder="Buscar..."
            class="flex-1 bg-transparent text-ink-text text-sm focus:outline-none
                   placeholder:text-ink-muted"/>
          @if (resultCount().total > 0) {
            <span class="text-ink-subtle text-xs shrink-0 font-mono">
              {{ resultCount().current }}/{{ resultCount().total }}
            </span>
          } @else if (searchQuery) {
            <span class="text-ink-danger text-xs shrink-0">Sin resultados</span>
          }
        </div>

        <!-- Navegación -->
        <button (click)="prevRequested.emit()"
          [disabled]="!searchQuery"
          title="Anterior (Shift+Enter)"
          class="p-1.5 rounded text-ink-subtle hover:text-ink-text hover:bg-ink-border
                 transition-colors disabled:opacity-30">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <polyline points="18,15 12,9 6,15"/>
          </svg>
        </button>
        <button (click)="nextRequested.emit()"
          [disabled]="!searchQuery"
          title="Siguiente (Enter)"
          class="p-1.5 rounded text-ink-subtle hover:text-ink-text hover:bg-ink-border
                 transition-colors disabled:opacity-30">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>

        <!-- Toggle mayúsculas -->
        <button
          (click)="caseSensitive.update(v => !v);
                   queryChanged.emit({ query: searchQuery, caseSensitive: caseSensitive() })"
          title="Distinguir mayúsculas"
          class="p-1.5 rounded text-xs font-mono transition-colors"
          [class]="caseSensitive()
            ? 'bg-ink-border text-ink-accent'
            : 'text-ink-subtle hover:text-ink-text hover:bg-ink-border'">
          Aa
        </button>

        <!-- Toggle show replace -->
        <button
          (click)="showReplace.update(v => !v)"
          title="Mostrar reemplazo"
          class="p-1.5 rounded text-ink-subtle hover:text-ink-text
                 hover:bg-ink-border transition-colors text-xs">
          ±
        </button>

        <!-- Cerrar -->
        <button (click)="closed.emit()"
          class="p-1.5 rounded text-ink-subtle hover:text-ink-text
                 hover:bg-ink-border transition-colors">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586 5.207
                     2.793a1 1 0 0 0-1.414 1.414L6.586 7l-2.793 2.793a1
                     1 0 1 0 1.414 1.414L8 8.414l2.793 2.793a1 1 0 0 0
                     1.414-1.414L9.414 7l2.793-2.793z"/>
          </svg>
        </button>
      </div>

      <!-- Fila de reemplazo (opcional) -->
      @if (showReplace()) {
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5 flex-1 px-3 py-1.5 rounded
                      bg-ink-bg border border-ink-border transition-colors
                      focus-within:border-ink-accent">
            <input
              [(ngModel)]="replaceQuery"
              placeholder="Reemplazar por..."
              class="flex-1 bg-transparent text-ink-text text-sm focus:outline-none
                     placeholder:text-ink-muted"/>
          </div>
          <button
            (click)="replaceRequested.emit(replaceQuery)"
            [disabled]="!searchQuery"
            class="px-3 py-1.5 rounded bg-ink-surface border border-ink-border
                   text-ink-text text-xs hover:border-ink-accent transition-colors
                   disabled:opacity-30">
            Reemplazar
          </button>
          <button
            (click)="replaceAllRequested.emit(replaceQuery)"
            [disabled]="!searchQuery"
            class="px-3 py-1.5 rounded bg-ink-surface border border-ink-border
                   text-ink-text text-xs hover:border-ink-accent transition-colors
                   disabled:opacity-30">
            Todos
          </button>
        </div>
      }

    </div>
  `,
})
export class FindReplaceBarComponent implements AfterViewInit {
  @ViewChild('searchInput') searchInputEl!: ElementRef<HTMLInputElement>;

  resultCount = input<{ current: number; total: number }>({ current: 0, total: 0 });

  queryChanged     = output<{ query: string; caseSensitive: boolean }>();
  nextRequested    = output<void>();
  prevRequested    = output<void>();
  replaceRequested    = output<string>();
  replaceAllRequested = output<string>();
  closed           = output<void>();

  searchQuery   = '';
  replaceQuery  = '';
  caseSensitive = signal(false);
  showReplace   = signal(false);

  ngAfterViewInit(): void {
    // Auto-focus al abrir la barra
    setTimeout(() => this.searchInputEl?.nativeElement.focus(), 50);
  }
}
```

### Integrar en `EditorLayoutComponent`

```typescript
@ViewChild(TiptapEditorComponent) tiptapEditor?: TiptapEditorComponent;

showFindReplace    = signal(false);
findReplaceCount   = signal({ current: 0, total: 0 });

onFindQueryChanged(event: { query: string; caseSensitive: boolean }): void {
  this.tiptapEditor?.find(event.query, event.caseSensitive);
  // Actualizar contador tras un tick (la extensión lo computa de forma async)
  setTimeout(() => {
    this.findReplaceCount.set(
      this.tiptapEditor?.getSearchResultCount() ?? { current: 0, total: 0 }
    );
  }, 50);
}

onFindNext(): void {
  this.tiptapEditor?.findNext();
  setTimeout(() => this.findReplaceCount.set(
    this.tiptapEditor?.getSearchResultCount() ?? { current: 0, total: 0 }
  ), 50);
}

onFindPrev(): void {
  this.tiptapEditor?.findPrev();
  setTimeout(() => this.findReplaceCount.set(
    this.tiptapEditor?.getSearchResultCount() ?? { current: 0, total: 0 }
  ), 50);
}

onReplace(replacement: string): void {
  this.tiptapEditor?.replace(replacement);
  setTimeout(() => this.findReplaceCount.set(
    this.tiptapEditor?.getSearchResultCount() ?? { current: 0, total: 0 }
  ), 50);
}

onReplaceAll(replacement: string): void {
  this.tiptapEditor?.replaceAll(replacement);
  this.findReplaceCount.set({ current: 0, total: 0 });
}

onFindReplaceClosed(): void {
  this.showFindReplace.set(false);
  this.tiptapEditor?.clearSearch();
  this.findReplaceCount.set({ current: 0, total: 0 });
}
```

En el template, insertar la barra entre la top bar y el editor:

```html
@if (!focusMode()) {
  <app-editor-top-bar ... />
}

@if (showFindReplace() && !focusMode()) {
  <app-find-replace-bar
    [resultCount]="findReplaceCount()"
    (queryChanged)="onFindQueryChanged($event)"
    (nextRequested)="onFindNext()"
    (prevRequested)="onFindPrev()"
    (replaceRequested)="onReplace($event)"
    (replaceAllRequested)="onReplaceAll($event)"
    (closed)="onFindReplaceClosed()"/>
}
```

### Atajo de teclado

En el `HostListener` de `EditorLayoutComponent`:

```typescript
// Ctrl+H abre find & replace con la fila de reemplazo visible
if (event.ctrlKey && event.key === 'h') {
  event.preventDefault();
  this.showFindReplace.set(true);
}

// Ctrl+G (o Ctrl+F si no está asignado) abre solo búsqueda
if (event.ctrlKey && event.key === 'g') {
  event.preventDefault();
  this.showFindReplace.set(true);
}

// Esc cierra la barra si está abierta
if (event.key === 'Escape' && this.showFindReplace()) {
  this.onFindReplaceClosed();
}
```

Añadir botón en `EditorTopBarComponent`:

```typescript
findReplaceToggled = output<void>();
```

```html
<button
  (click)="findReplaceToggled.emit()"
  title="Buscar y reemplazar (Ctrl+H)"
  class="p-1.5 rounded text-ink-subtle hover:text-ink-text
         hover:bg-ink-border transition-colors">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <path d="M11 8v3l2 2" stroke-linecap="round"/>
  </svg>
</button>
```

---

## Parte 4: Exportación a DOCX

### Nueva dependencia

```bash
pnpm add docx
```

### Actualizar `ExportService`

Añadir el conversor DOCX:

```typescript
import {
  Document, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Packer, NumberingLevel,
  AbstractNumbering, Numbering, LevelFormat,
} from 'docx';

// En ExportService, añadir método:

async exportDocx(
  docs: DocumentFile[],
  meta: ExportMetadata,
  title: string,
): Promise<void> {
  const savePath = await this.bridge.saveFileDialog(
    `${title}.docx`,
    'docx',
  );
  if (!savePath) return;

  const wordCount = this.countWords(docs);
  const docxDoc   = this.buildDocxDocument(docs, meta, title, wordCount);
  const buffer    = await Packer.toBuffer(docxDoc);

  await this.bridge.writeBinaryFile(savePath, buffer.buffer);
}

private buildDocxDocument(
  docs: DocumentFile[],
  meta: ExportMetadata,
  title: string,
  wordCount: number,
): Document {
  const authorLine = meta.penName ?? meta.legalName;
  const wordCountFormatted =
    `~${Math.round(wordCount / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' palabras';

  const children: Paragraph[] = [];

  // ─── Página de título ───────────────────────────────────────────────────
  // Datos de contacto (izquierda)
  children.push(
    new Paragraph({ text: meta.legalName }),
    new Paragraph({ text: meta.address ?? '' }),
    new Paragraph({ text: meta.phone   ?? '' }),
    new Paragraph({ text: meta.email }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
  );

  // Título centrado
  children.push(
    new Paragraph({
      text:      title.toUpperCase(),
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text:      `by ${authorLine}`,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text:      wordCountFormatted,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text:      meta.genre,
      alignment: AlignmentType.CENTER,
    }),
  );

  // ─── Capítulos ───────────────────────────────────────────────────────────
  for (const doc of docs) {
    // Salto de página + título de capítulo
    children.push(
      new Paragraph({
        text:           doc.title,
        heading:        HeadingLevel.HEADING_1,
        alignment:      AlignmentType.CENTER,
        pageBreakBefore: true,
      }),
    );

    // Convertir contenido TipTap a párrafos DOCX
    const docParagraphs = this.tiptapToDocxParagraphs(doc.content);
    children.push(...docParagraphs);
  }

  // Final del manuscrito
  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({ text: '# # #', alignment: AlignmentType.CENTER }),
  );

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top:    1440,  // 2.5cm en twips (1cm = 567 twips)
            bottom: 1440,
            left:   1440,
            right:  1440,
          },
        },
      },
      children,
    }],
    styles: {
      default: {
        document: {
          run: {
            font:  'Times New Roman',
            size:  24,   // 12pt (en half-points)
          },
          paragraph: {
            spacing: { line: 480, lineRule: 'AUTO' },  // doble espacio
          },
        },
      },
    },
  });
}

private tiptapToDocxParagraphs(content: object): Paragraph[] {
  const doc = content as { type: string; content?: TipTapNode[] };
  return (doc.content ?? []).flatMap(node => this.nodeToDocx(node));
}

private nodeToDocx(node: TipTapNode): Paragraph[] {
  switch (node.type) {
    case 'paragraph':
      return [new Paragraph({
        children: this.inlineToRuns(node.content ?? []),
        indent:   { firstLine: 720 },  // sangría de 1.25cm
      })];

    case 'heading': {
      const level = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
      ][(node.attrs?.level ?? 1) - 1] ?? HeadingLevel.HEADING_1;
      return [new Paragraph({
        children:  this.inlineToRuns(node.content ?? []),
        heading:   level,
        alignment: AlignmentType.CENTER,
      })];
    }

    case 'blockquote':
      return (node.content ?? []).flatMap(child => this.nodeToDocx(child));

    case 'bulletList':
    case 'orderedList':
      return (node.content ?? []).flatMap(item =>
        (item.content ?? []).flatMap(p => new Paragraph({
          children: this.inlineToRuns(p.content ?? []),
          bullet:   { level: 0 },
        }))
      );

    case 'horizontalRule':
      return [new Paragraph({ text: '* * *', alignment: AlignmentType.CENTER })];

    default:
      return [];
  }
}

private inlineToRuns(nodes: TipTapNode[]): TextRun[] {
  return nodes.map(n => {
    if (n.type !== 'text') return new TextRun('');
    const marks = n.marks ?? [];
    return new TextRun({
      text:   n.text ?? '',
      bold:   marks.some(m => m.type === 'bold'),
      italics: marks.some(m => m.type === 'italic'),
      strike:  marks.some(m => m.type === 'strike'),
    });
  });
}

interface TipTapNode {
  type:     string;
  text?:    string;
  attrs?:   Record<string, unknown>;
  content?: TipTapNode[];
  marks?:   Array<{ type: string }>;
}
```

### Actualizar el wizard de exportación (INK-10)

**`StepFormatComponent`** — añadir la tercera opción:

```html
<!-- Botón DOCX -->
<button
  (click)="format.set('docx')"
  class="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2
         transition-all text-left"
  [class]="format() === 'docx'
    ? 'border-ink-accent bg-ink-surface'
    : 'border-ink-border hover:border-ink-muted'">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="1.5"
       [class]="format() === 'docx' ? 'text-ink-accent' : 'text-ink-subtle'">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <path d="M8 13h2l1 4 1.5-3 1.5 3 1-4h2" stroke-linecap="round"/>
  </svg>
  <div>
    <p class="text-ink-text text-sm font-medium">Word (DOCX)</p>
    <p class="text-ink-subtle text-xs mt-0.5">
      Compatible con Word y<br>LibreOffice Writer.
    </p>
  </div>
</button>
```

Actualizar el tipo en `export.model.ts`:

```typescript
export type ExportFormat = 'pdf-manuscript' | 'epub' | 'docx';
```

**`ExportModalComponent`** — añadir el caso DOCX en `doExport()`:

```typescript
if (options.format === 'docx') {
  await this.exportService.exportDocx(docs, options.metadata, projectTitle);
  this.toast.success('Documento Word guardado correctamente.');
}
```

**`ExportService.export()`** — añadir el caso:

```typescript
if (options.format === 'docx') {
  await this.exportDocx(ordered, options.metadata, projectTitle);
}
```

---

## Actualizar `ShortcutsModalComponent` (INK-13)

Añadir los nuevos atajos al grupo "Editor":

```typescript
{ keys: ['Ctrl', 'H'], description: 'Buscar y reemplazar en el documento' },
{ keys: ['Ctrl', 'G'], description: 'Buscar en el documento' },
```

---

## Criterios de aceptación

**Corrector ortográfico:**
- [ ] Con spell check activo, las palabras mal escritas muestran subrayado rojo nativo del sistema
- [ ] El toggle en settings activa/desactiva el corrector y persiste en `project.json`
- [ ] Proyectos creados antes de INK-16 (sin `spellcheck` en settings) usan `true` por defecto
- [ ] En modo focus el corrector sigue funcionando

**Estado de documento:**
- [ ] Click derecho en un documento del binder muestra las opciones de estado
- [ ] Asignar un estado añade un punto de color junto al icono del documento
- [ ] Los colores corresponden: azul (borrador), amarillo (revisión), verde (final), etc.
- [ ] "Sin estado" elimina el indicador visual
- [ ] El estado persiste en `project.json` al recargar
- [ ] Las carpetas no tienen opciones de estado en el menú contextual

**Find & replace:**
- [ ] `Ctrl+H` abre la barra con la fila de reemplazo visible
- [ ] `Ctrl+G` abre la barra solo con búsqueda
- [ ] El botón en la top bar también abre la barra
- [ ] Al escribir en el campo de búsqueda, los resultados se resaltan en el editor
- [ ] El contador muestra "1/5", "2/5", etc.
- [ ] Los botones ▲ y ▼ navegan entre resultados
- [ ] El toggle "Aa" activa/desactiva distinción de mayúsculas
- [ ] "Reemplazar" reemplaza el resultado actual y avanza al siguiente
- [ ] "Todos" reemplaza todas las ocurrencias y muestra el resultado
- [ ] `Esc` cierra la barra y limpia los resaltados
- [ ] La barra no aparece en modo focus

**DOCX export:**
- [ ] "Word (DOCX)" aparece como tercera opción en el wizard de exportación
- [ ] Al seleccionar DOCX, el selector de tamaño de página desaparece (no aplica a DOCX)
- [ ] Al exportar, se abre el diálogo de guardar con nombre `[título].docx`
- [ ] El DOCX generado se abre correctamente en LibreOffice Writer
- [ ] El documento contiene: página de título con datos de contacto y recuento de palabras, capítulos con salto de página, doble espaciado, Times New Roman 12pt, sangría de párrafo
- [ ] Negrita, cursiva y tachado se preservan en el DOCX
- [ ] Los headings se convierten a estilos de heading de Word
- [ ] El final del manuscrito incluye "# # #"
- [ ] Toast de confirmación al guardar

---

## Lo que NO hacer en esta spec

- No implementar spell check personalizado ni añadir palabras al diccionario desde la app (usa el diccionario del sistema)
- No añadir colores de estado personalizables por el usuario
- No implementar filtrado del binder por estado
- No preservar imágenes en la exportación DOCX
- No preservar tablas en la exportación DOCX
- No implementar track changes ni comentarios en el DOCX generado
