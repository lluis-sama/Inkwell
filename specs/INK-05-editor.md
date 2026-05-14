# INK-05 — Editor + Binder

## Objetivo

Implementar la vista principal de escritura. Incluye el layout con binder lateral, el editor TipTap, la barra superior con metadatos y el autosave. Al finalizar esta spec el usuario puede abrir un proyecto, navegar entre documentos, escribir y ver cómo se guarda automáticamente.

---

## Scope de esta spec

**Incluido:**
- Layout de tres zonas (binder / editor / panel IA placeholder)
- Binder con árbol jerárquico expandible y menú contextual
- Editor TipTap con las extensiones core
- Barra superior (título del proyecto, título del documento, contador de palabras, estado de guardado)
- Autosave configurable
- Modo focus (oculta binder y barra)
- Creación, renombrado y eliminación de nodos desde el binder

**Excluido (specs posteriores):**
- Panel de snapshots → INK-06
- Panel de IA → INK-08
- Drag & drop para reordenar el árbol → INK-09
- Toolbar de formato del editor → INK-09

---

## Componentes a crear

```
src/app/features/editor/
  editor-layout.component.ts       ← orquestador principal
  binder/
    binder.component.ts            ← árbol de documentos
    binder-node.component.ts       ← nodo recursivo individual
    binder-context-menu.component.ts
  tiptap/
    tiptap-editor.component.ts     ← wrapper del editor
  top-bar/
    editor-top-bar.component.ts

src/app/shared/utils/
  tiptap-to-text.ts                ← serialización para IA (usar en INK-08)
```

---

## Parte 1: Utilidad tiptap-to-text

### `src/app/shared/utils/tiptap-to-text.ts`

Convierte TipTap JSON a texto plano. Se usará en INK-08 para enviar contexto a la IA.

```typescript
/**
 * Convierte el JSON de TipTap/ProseMirror a texto plano.
 * Añade saltos de línea entre párrafos y headings.
 */
export function tiptapToText(doc: object): string {
  return extractText(doc as TipTapNode).trim();
}

interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
}

const BLOCK_NODES = new Set([
  'paragraph', 'heading', 'blockquote',
  'bulletList', 'orderedList', 'listItem',
  'codeBlock', 'horizontalRule',
]);

function extractText(node: TipTapNode): string {
  if (node.type === 'text') return node.text ?? '';

  const children = (node.content ?? []).map(extractText).join('');

  if (BLOCK_NODES.has(node.type)) {
    return children + '\n';
  }

  return children;
}
```

---

## Parte 2: TiptapEditorComponent

### `src/app/features/editor/tiptap/tiptap-editor.component.ts`

```typescript
import {
  Component, ElementRef, ViewChild, input, output,
  OnChanges, OnDestroy, AfterViewInit, SimpleChanges,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';

@Component({
  selector: 'app-tiptap-editor',
  standalone: true,
  template: `
    <div class="tiptap-host h-full flex flex-col">
      <!-- Área del editor -->
      <div
        #editorEl
        class="flex-1 overflow-y-auto px-16 py-12 focus:outline-none">
      </div>

      <!-- Pie: contador de palabras -->
      <div class="flex justify-end px-16 py-2 border-t border-ink-border">
        <span class="text-ink-subtle text-xs">
          {{ wordCount() }} palabras · {{ charCount() }} caracteres
        </span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }

    /* Estilos del área de edición TipTap */
    ::ng-deep .tiptap-host .ProseMirror {
      outline: none;
      min-height: 100%;
      font-family: 'Lora', Georgia, serif;
      font-size: 1.05rem;
      line-height: 1.85;
      color: var(--ink-text);
      max-width: 680px;
      margin: 0 auto;
    }

    ::ng-deep .tiptap-host .ProseMirror p { margin-bottom: 0.75em; }
    ::ng-deep .tiptap-host .ProseMirror h1 {
      font-size: 1.75rem; font-weight: 600;
      margin: 1.5em 0 0.5em; color: var(--ink-text);
    }
    ::ng-deep .tiptap-host .ProseMirror h2 {
      font-size: 1.35rem; font-weight: 600;
      margin: 1.25em 0 0.4em; color: var(--ink-text);
    }
    ::ng-deep .tiptap-host .ProseMirror h3 {
      font-size: 1.1rem; font-weight: 600;
      margin: 1em 0 0.3em; color: var(--ink-text);
    }
    ::ng-deep .tiptap-host .ProseMirror blockquote {
      border-left: 3px solid var(--ink-accent);
      padding-left: 1rem; margin: 1em 0;
      color: var(--ink-subtle);
      font-style: italic;
    }
    ::ng-deep .tiptap-host .ProseMirror code {
      background: var(--ink-surface);
      border-radius: 3px; padding: 0.1em 0.3em;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875em;
    }
    ::ng-deep .tiptap-host .ProseMirror pre {
      background: var(--ink-surface);
      border-radius: 6px; padding: 1em;
      overflow-x: auto; margin: 1em 0;
    }
    ::ng-deep .tiptap-host .ProseMirror pre code {
      background: none; padding: 0;
    }
    ::ng-deep .tiptap-host .ProseMirror ul,
    ::ng-deep .tiptap-host .ProseMirror ol {
      padding-left: 1.5em; margin: 0.5em 0;
    }
    ::ng-deep .tiptap-host .ProseMirror li { margin-bottom: 0.25em; }
    ::ng-deep .tiptap-host .ProseMirror hr {
      border: none;
      border-top: 1px solid var(--ink-border);
      margin: 2em 0;
    }
    ::ng-deep .tiptap-host .ProseMirror strong { color: var(--ink-text); }
    ::ng-deep .tiptap-host .ProseMirror em { color: var(--ink-subtext1, var(--ink-subtle)); }

    /* Placeholder */
    ::ng-deep .tiptap-host .ProseMirror .is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: var(--ink-muted);
      pointer-events: none;
      float: left;
      height: 0;
    }
  `],
})
export class TiptapEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('editorEl') editorEl!: ElementRef<HTMLDivElement>;

  /** Contenido TipTap JSON. Cambiar este input reemplaza el contenido del editor. */
  content    = input<object>({ type: 'doc', content: [{ type: 'paragraph' }] });
  editable   = input<boolean>(true);
  placeholder = input<string>('Empieza a escribir...');

  /** Emitido en cada cambio de contenido (debounce 300ms aplicado en el componente). */
  contentChanged = output<object>();

  private editor: Editor | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  wordCount = () => this.editor?.storage.characterCount.words() ?? 0;
  charCount = () => this.editor?.storage.characterCount.characters() ?? 0;

  ngAfterViewInit(): void {
    this.editor = new Editor({
      element: this.editorEl.nativeElement,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: this.placeholder() }),
        CharacterCount,
      ],
      content: this.content(),
      editable: this.editable(),
      onUpdate: ({ editor }) => {
        // Debounce para no emitir en cada keystroke
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.contentChanged.emit(editor.getJSON());
        }, 300);
      },
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reemplazar contenido cuando cambia el input (cambio de documento activo)
    if (changes['content'] && this.editor && !changes['content'].firstChange) {
      const newContent = changes['content'].currentValue;
      this.editor.commands.setContent(newContent, false);
    }

    if (changes['editable'] && this.editor) {
      this.editor.setEditable(changes['editable'].currentValue);
    }
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.editor?.destroy();
  }
}
```

---

## Parte 3: BinderContextMenuComponent

### `src/app/features/editor/binder/binder-context-menu.component.ts`

```typescript
import { Component, input, output } from '@angular/core';

export interface ContextMenuAction {
  label: string;
  action: string;
  danger?: boolean;
}

@Component({
  selector: 'app-binder-context-menu',
  standalone: true,
  template: `
    <div
      class="fixed z-50 min-w-44 rounded-lg border border-ink-border bg-ink-surface
             shadow-xl py-1"
      [style.left.px]="x()"
      [style.top.px]="y()">
      @for (item of actions(); track item.action) {
        <button
          (click)="actionSelected.emit(item.action)"
          class="w-full text-left px-4 py-2 text-sm transition-colors"
          [class]="item.danger
            ? 'text-ink-danger hover:bg-ink-border'
            : 'text-ink-text hover:bg-ink-border'">
          {{ item.label }}
        </button>
      }
    </div>
  `,
})
export class BinderContextMenuComponent {
  x       = input<number>(0);
  y       = input<number>(0);
  actions = input<ContextMenuAction[]>([]);

  actionSelected = output<string>();
}
```

---

## Parte 4: BinderNodeComponent

### `src/app/features/editor/binder/binder-node.component.ts`

Componente recursivo para renderizar un nodo del árbol.

```typescript
import { Component, input, output } from '@angular/core';
import { TreeNode } from '../../../core/models/project.model';

export interface NodeContextEvent {
  node: TreeNode;
  x: number;
  y: number;
}

@Component({
  selector: 'app-binder-node',
  standalone: true,
  template: `
    <div>
      <!-- Fila del nodo -->
      <div
        class="group flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer
               select-none transition-colors text-sm"
        [style.paddingLeft.px]="(depth() * 12) + 8"
        [class]="isActive()
          ? 'bg-ink-surface text-ink-text'
          : 'text-ink-subtle hover:bg-ink-surface hover:text-ink-text'"
        (click)="onRowClick()"
        (contextmenu)="onContextMenu($event)">

        <!-- Chevron (solo en carpetas) -->
        <span class="w-4 h-4 flex items-center justify-center shrink-0">
          @if (node().type === 'folder') {
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
              class="transition-transform duration-150"
              [class.rotate-90]="expanded()">
              <path d="M3 2 L7 5 L3 8" stroke="currentColor" stroke-width="1.5"
                    fill="none" stroke-linecap="round"/>
            </svg>
          }
        </span>

        <!-- Icono carpeta / documento -->
        @if (node().type === 'folder') {
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" class="shrink-0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1
                     2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        } @else {
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" class="shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0
                     0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
        }

        <!-- Título (editable inline al renombrar) -->
        @if (renaming()) {
          <input
            #renameInput
            [value]="node().title"
            (blur)="commitRename($event)"
            (keydown.enter)="commitRename($event)"
            (keydown.escape)="renameCancel.emit()"
            (click)="$event.stopPropagation()"
            class="flex-1 bg-ink-bg border border-ink-accent rounded px-1 py-0
                   text-ink-text text-sm focus:outline-none"/>
        } @else {
          <span class="flex-1 truncate">{{ node().title }}</span>
        }
      </div>

      <!-- Hijos (si carpeta expandida) -->
      @if (node().type === 'folder' && expanded()) {
        @for (child of node().children; track child.id) {
          <app-binder-node
            [node]="child"
            [depth]="depth() + 1"
            [activeId]="activeId()"
            [renamingId]="renamingId()"
            (nodeClicked)="nodeClicked.emit($event)"
            (contextMenu)="contextMenu.emit($event)"
            (renamed)="renamed.emit($event)"
            (renameCancel)="renameCancel.emit()"/>
        }
      }
    </div>
  `,
})
export class BinderNodeComponent {
  node       = input.required<TreeNode>();
  depth      = input<number>(0);
  activeId   = input<string | null>(null);
  renamingId = input<string | null>(null);

  nodeClicked  = output<TreeNode>();
  contextMenu  = output<NodeContextEvent>();
  renamed      = output<{ id: string; title: string }>();
  renameCancel = output<void>();

  expanded = (() => {
    // Las carpetas empiezan expandidas
    let _expanded = true;
    return {
      (): boolean { return _expanded && this.node().type === 'folder'; },
      toggle(): void { _expanded = !_expanded; },
    };
  })();

  isActive   = () => this.activeId() === this.node().id;
  renaming   = () => this.renamingId() === this.node().id;

  onRowClick(): void {
    if (this.node().type === 'folder') {
      this.expanded.toggle();
    } else {
      this.nodeClicked.emit(this.node());
    }
  }

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu.emit({ node: this.node(), x: event.clientX, y: event.clientY });
  }

  commitRename(event: Event): void {
    const input = event.target as HTMLInputElement;
    const title = input.value.trim();
    if (title) this.renamed.emit({ id: this.node().id, title });
    else this.renameCancel.emit();
  }
}
```

---

## Parte 5: BinderComponent

### `src/app/features/editor/binder/binder.component.ts`

```typescript
import { Component, inject, input, output, signal } from '@angular/core';
import { TreeNode } from '../../../core/models/project.model';
import { ProjectService } from '../../../core/services/project.service';
import { DocumentService } from '../../../core/services/document.service';
import { BinderNodeComponent, NodeContextEvent } from './binder-node.component';
import { BinderContextMenuComponent, ContextMenuAction } from './binder-context-menu.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';

@Component({
  selector: 'app-binder',
  standalone: true,
  imports: [BinderNodeComponent, BinderContextMenuComponent, InkButtonComponent],
  template: `
    <div
      class="flex flex-col h-full bg-ink-panel border-r border-ink-border"
      (click)="closeContextMenu()">

      <!-- Header del binder -->
      <div class="flex items-center justify-between px-3 py-3
                  border-b border-ink-border shrink-0">
        <span class="text-ink-subtle text-xs font-medium uppercase tracking-widest truncate">
          {{ projectService.project()?.name }}
        </span>
        <div class="flex gap-1">
          <!-- Añadir documento -->
          <button
            (click)="addDocument(null)"
            title="Nuevo documento"
            class="p-1 rounded text-ink-subtle hover:text-ink-text
                   hover:bg-ink-border transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0
                       0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>
          <!-- Añadir carpeta -->
          <button
            (click)="addFolder(null)"
            title="Nueva carpeta"
            class="p-1 rounded text-ink-subtle hover:text-ink-text
                   hover:bg-ink-border transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1
                       2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Árbol de documentos -->
      <div class="flex-1 overflow-y-auto py-2 px-1">
        @if ((projectService.project()?.tree ?? []).length === 0) {
          <p class="text-ink-subtle text-xs text-center mt-8 px-4 leading-relaxed">
            Sin documentos todavía.<br>Crea uno con el botón +
          </p>
        } @else {
          @for (node of projectService.project()!.tree; track node.id) {
            <app-binder-node
              [node]="node"
              [depth]="0"
              [activeId]="activeId()"
              [renamingId]="renamingId()"
              (nodeClicked)="documentOpened.emit($event)"
              (contextMenu)="onContextMenu($event)"
              (renamed)="onRenamed($event)"
              (renameCancel)="renamingId.set(null)"/>
          }
        }
      </div>
    </div>

    <!-- Menú contextual -->
    @if (contextMenu()) {
      <app-binder-context-menu
        [x]="contextMenu()!.x"
        [y]="contextMenu()!.y"
        [actions]="contextActions()"
        (actionSelected)="onContextAction($event)"/>
    }
  `,
  host: {
    '(document:click)': 'closeContextMenu()',
    '(document:keydown.escape)': 'closeContextMenu()',
  },
})
export class BinderComponent {
  projectService  = inject(ProjectService);
  private docService = inject(DocumentService);

  activeId = input<string | null>(null);

  documentOpened = output<TreeNode>();

  renamingId  = signal<string | null>(null);
  contextMenu = signal<NodeContextEvent | null>(null);

  contextActions = (): ContextMenuAction[] => {
    const node = this.contextMenu()?.node;
    if (!node) return [];

    const actions: ContextMenuAction[] = [
      { label: 'Renombrar', action: 'rename' },
    ];

    if (node.type === 'folder') {
      actions.push(
        { label: 'Nuevo documento aquí', action: 'add-document' },
        { label: 'Nueva carpeta aquí',   action: 'add-folder' },
      );
    }

    actions.push({ label: 'Eliminar', action: 'delete', danger: true });
    return actions;
  };

  onContextMenu(event: NodeContextEvent): void {
    event.x; // evitar que el click del documento cierre el menú
    this.contextMenu.set(event);
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  async onContextAction(action: string): Promise<void> {
    const node = this.contextMenu()?.node;
    this.closeContextMenu();
    if (!node) return;

    if (action === 'rename') {
      this.renamingId.set(node.id);
    } else if (action === 'add-document') {
      await this.addDocument(node.id);
    } else if (action === 'add-folder') {
      await this.addFolder(node.id);
    } else if (action === 'delete') {
      await this.deleteNode(node);
    }
  }

  async onRenamed(event: { id: string; title: string }): Promise<void> {
    this.renamingId.set(null);
    await this.projectService.renameNode(event.id, event.title);
  }

  async addDocument(parentId: string | null): Promise<void> {
    const doc = await this.docService.createDocument('Sin título', parentId);
    this.documentOpened.emit({
      id: doc.id, title: doc.title, type: 'document', children: [],
    });
  }

  async addFolder(parentId: string | null): Promise<void> {
    await this.projectService.addNode('folder', 'Nueva carpeta', parentId);
  }

  async deleteNode(node: TreeNode): Promise<void> {
    if (node.type === 'document') {
      await this.docService.deleteDocument(node.id);
    } else {
      // Eliminar todos los documentos descendientes
      await this.deleteDescendants(node.children);
      await this.projectService.removeNode(node.id);
    }
  }

  private async deleteDescendants(nodes: TreeNode[]): Promise<void> {
    for (const node of nodes) {
      if (node.type === 'document') {
        await this.docService.deleteDocument(node.id);
      } else {
        await this.deleteDescendants(node.children);
      }
    }
  }
}
```

---

## Parte 6: EditorTopBarComponent

### `src/app/features/editor/top-bar/editor-top-bar.component.ts`

```typescript
import { Component, input, output } from '@angular/core';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

@Component({
  selector: 'app-editor-top-bar',
  standalone: true,
  template: `
    <header class="flex items-center h-11 px-4 border-b border-ink-border
                   bg-ink-panel shrink-0 gap-3">

      <!-- Botón toggle binder -->
      <button
        (click)="binderToggled.emit()"
        title="Mostrar/ocultar binder (Ctrl+B)"
        class="p-1.5 rounded text-ink-subtle hover:text-ink-text
               hover:bg-ink-border transition-colors shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <!-- Separador -->
      <div class="w-px h-5 bg-ink-border shrink-0"></div>

      <!-- Título del documento (editable) -->
      @if (documentTitle()) {
        <input
          [value]="documentTitle()"
          (change)="titleChanged.emit(($event.target as HTMLInputElement).value)"
          placeholder="Sin título"
          class="flex-1 bg-transparent text-ink-text text-sm font-medium
                 focus:outline-none placeholder:text-ink-muted min-w-0
                 border-b border-transparent focus:border-ink-accent
                 transition-colors pb-0.5"/>
      } @else {
        <span class="flex-1 text-ink-subtle text-sm italic">
          Ningún documento abierto
        </span>
      }

      <!-- Estado de guardado -->
      <div class="flex items-center gap-1.5 text-xs shrink-0">
        @switch (saveStatus()) {
          @case ('saved') {
            <span class="text-ink-success">✓</span>
            <span class="text-ink-subtle">Guardado</span>
          }
          @case ('saving') {
            <span class="inline-block w-3 h-3 border border-ink-subtle
                         border-t-transparent rounded-full animate-spin"></span>
            <span class="text-ink-subtle">Guardando...</span>
          }
          @case ('unsaved') {
            <span class="text-ink-warning">●</span>
            <span class="text-ink-subtle">Sin guardar</span>
          }
          @case ('error') {
            <span class="text-ink-danger">✕</span>
            <span class="text-ink-danger">Error al guardar</span>
          }
        }
      </div>

      <!-- Separador -->
      <div class="w-px h-5 bg-ink-border shrink-0"></div>

      <!-- Botón snapshot -->
      <button
        (click)="snapshotRequested.emit()"
        [disabled]="!documentTitle()"
        title="Crear snapshot"
        class="p-1.5 rounded text-ink-subtle hover:text-ink-text
               hover:bg-ink-border transition-colors disabled:opacity-30
               disabled:cursor-not-allowed">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M20.188 10.934c.2.59.312 1.219.312 1.872 0 3.314-2.686
                   6-6 6a6 6 0 0 1-6-6c0-3.314 2.686-6 6-6 .653 0 1.282.112
                   1.872.312"/>
          <path d="M16 3l2 2-2 2"/>
        </svg>
      </button>

      <!-- Botón modo focus -->
      <button
        (click)="focusToggled.emit()"
        title="Modo focus (Ctrl+Shift+F)"
        class="p-1.5 rounded text-ink-subtle hover:text-ink-text
               hover:bg-ink-border transition-colors">
        @if (focusMode()) {
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3
                     m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        } @else {
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
        }
      </button>

    </header>
  `,
})
export class EditorTopBarComponent {
  documentTitle = input<string | null>(null);
  saveStatus    = input<SaveStatus>('saved');
  focusMode     = input<boolean>(false);

  binderToggled     = output<void>();
  focusToggled      = output<void>();
  snapshotRequested = output<void>();
  titleChanged      = output<string>();
}
```

---

## Parte 7: EditorLayoutComponent

### `src/app/features/editor/editor-layout.component.ts`

```typescript
import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, HostListener,
} from '@angular/core';
import { Router } from '@angular/router';
import { ProjectService }  from '../../core/services/project.service';
import { DocumentService } from '../../core/services/document.service';
import { DocumentFile }    from '../../core/models/document.model';
import { TreeNode }        from '../../core/models/project.model';
import { BinderComponent } from './binder/binder.component';
import { TiptapEditorComponent } from './tiptap/tiptap-editor.component';
import { EditorTopBarComponent, SaveStatus } from './top-bar/editor-top-bar.component';

@Component({
  selector: 'app-editor-layout',
  standalone: true,
  imports: [BinderComponent, TiptapEditorComponent, EditorTopBarComponent],
  template: `
    <div class="flex flex-col h-screen bg-ink-bg overflow-hidden">

      <!-- Barra superior (oculta en focus mode) -->
      @if (!focusMode()) {
        <app-editor-top-bar
          [documentTitle]="activeDocument()?.title ?? null"
          [saveStatus]="saveStatus()"
          [focusMode]="focusMode()"
          (binderToggled)="showBinder.update(v => !v)"
          (focusToggled)="toggleFocusMode()"
          (snapshotRequested)="createSnapshot()"
          (titleChanged)="onTitleChanged($event)"/>
      }

      <!-- Área principal -->
      <div class="flex flex-1 overflow-hidden">

        <!-- Binder (oculto en focus mode o cuando showBinder es false) -->
        @if (showBinder() && !focusMode()) {
          <div class="w-60 shrink-0">
            <app-binder
              [activeId]="activeDocumentId()"
              (documentOpened)="openDocument($event)"/>
          </div>
        }

        <!-- Editor -->
        <div class="flex-1 overflow-hidden relative">

          @if (activeDocument()) {
            <app-tiptap-editor
              [content]="activeDocument()!.content"
              (contentChanged)="onContentChanged($event)"/>
          } @else {
            <!-- Estado vacío -->
            <div class="flex flex-col items-center justify-center h-full gap-4 opacity-40">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="1.5"
                   class="text-ink-subtle">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0
                         0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
              <p class="text-ink-subtle text-sm">
                Selecciona o crea un documento en el binder
              </p>
            </div>
          }

          <!-- Salir de focus mode -->
          @if (focusMode()) {
            <button
              (click)="toggleFocusMode()"
              title="Salir del modo focus (Ctrl+Shift+F)"
              class="absolute top-4 right-4 p-2 rounded text-ink-muted
                     hover:text-ink-subtle transition-colors opacity-0
                     hover:opacity-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3
                         m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          }
        </div>

        <!-- Placeholder panel IA (INK-08) -->
        @if (!focusMode()) {
          <div class="w-8 shrink-0 border-l border-ink-border bg-ink-panel
                      flex items-center justify-center">
            <span class="text-ink-muted text-xs [writing-mode:vertical-lr]
                         rotate-180 select-none">IA</span>
          </div>
        }
      </div>
    </div>
  `,
})
export class EditorLayoutComponent implements OnInit, OnDestroy {
  private projectService  = inject(ProjectService);
  private docService      = inject(DocumentService);
  private router          = inject(Router);

  showBinder       = signal(true);
  focusMode        = signal(false);
  saveStatus       = signal<SaveStatus>('saved');
  activeDocumentId = signal<string | null>(null);
  activeDocument   = signal<DocumentFile | null>(null);

  private isDirty       = false;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    // Redirigir si no hay proyecto abierto
    if (!this.projectService.isLoaded()) {
      this.router.navigate(['/']);
      return;
    }
    this.startAutosave();
  }

  ngOnDestroy(): void {
    this.stopAutosave();
  }

  // ─── Documentos ───────────────────────────────────────────────────────────

  async openDocument(node: TreeNode): Promise<void> {
    if (node.type !== 'document') return;

    // Guardar documento actual si hay cambios
    if (this.isDirty && this.activeDocument()) {
      await this.saveCurrentDocument();
    }

    try {
      const doc = await this.docService.loadDocument(node.id);
      this.activeDocumentId.set(doc.id);
      this.activeDocument.set(doc);
      this.isDirty = false;
      this.saveStatus.set('saved');
    } catch (e) {
      console.error('Error cargando documento:', e);
    }
  }

  onContentChanged(content: object): void {
    if (!this.activeDocument()) return;
    this.activeDocument.update(doc => doc ? { ...doc, content } : doc);
    this.isDirty = true;
    this.saveStatus.set('unsaved');
  }

  async onTitleChanged(title: string): Promise<void> {
    if (!this.activeDocument() || !title.trim()) return;
    this.activeDocument.update(doc => doc ? { ...doc, title: title.trim() } : doc);
    await this.projectService.renameNode(this.activeDocument()!.id, title.trim());
    this.isDirty = true;
    this.saveStatus.set('unsaved');
  }

  async createSnapshot(): Promise<void> {
    const doc = this.activeDocument();
    if (!doc) return;

    const withSnapshot = this.docService.createSnapshot(doc);
    const saved = await this.docService.saveDocument(withSnapshot);
    this.activeDocument.set(saved);
    this.isDirty = false;
    this.saveStatus.set('saved');
  }

  // ─── Autosave ─────────────────────────────────────────────────────────────

  private startAutosave(): void {
    const interval = this.projectService.project()?.settings.autosaveInterval ?? 30;
    if (interval === 0) return;

    this.autosaveTimer = setInterval(() => {
      if (this.isDirty) this.saveCurrentDocument();
    }, interval * 1000);
  }

  private stopAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private async saveCurrentDocument(): Promise<void> {
    const doc = this.activeDocument();
    if (!doc) return;

    this.saveStatus.set('saving');
    try {
      const saved = await this.docService.saveDocument(doc);
      this.activeDocument.set(saved);
      this.isDirty = false;
      this.saveStatus.set('saved');
    } catch {
      this.saveStatus.set('error');
    }
  }

  // ─── Atajos de teclado ────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'b') {
      event.preventDefault();
      this.showBinder.update(v => !v);
    }
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      this.toggleFocusMode();
    }
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault();
      this.saveCurrentDocument();
    }
  }

  toggleFocusMode(): void {
    this.focusMode.update(v => !v);
  }
}
```

---

## Criterios de aceptación

**Layout:**
- [ ] La vista muestra binder (izquierda), editor (centro) y franja IA (derecha)
- [ ] `Ctrl+B` muestra/oculta el binder
- [ ] `Ctrl+Shift+F` activa/desactiva el modo focus (solo editor visible)
- [ ] `Ctrl+S` guarda el documento activo manualmente
- [ ] Si no hay proyecto abierto, redirige a `/`

**Binder:**
- [ ] Muestra el árbol de documentos del proyecto
- [ ] Click en carpeta la expande/colapsa
- [ ] Click en documento lo carga en el editor y lo marca como activo
- [ ] Botones + crean documento/carpeta en la raíz
- [ ] Menú contextual (clic derecho) muestra: renombrar, eliminar (y añadir hijos en carpetas)
- [ ] Renombrar funciona con Enter para confirmar y Escape para cancelar
- [ ] Eliminar una carpeta elimina todos sus documentos del disco

**Editor:**
- [ ] El editor muestra el contenido del documento activo
- [ ] Al cambiar de documento, el editor carga el nuevo contenido
- [ ] El título en la barra superior es editable y se sincroniza con el binder
- [ ] El indicador de guardado cambia entre: sin guardar (●), guardando (spinner), guardado (✓)

**Autosave:**
- [ ] Con el intervalo por defecto (30s), el documento se guarda automáticamente si hay cambios
- [ ] Con intervalo = 0 en settings, el autosave no se activa

**Focus mode:**
- [ ] En modo focus solo se ve el editor, sin barra superior ni binder
- [ ] Hay un botón de salida semitransparente en la esquina superior derecha del editor

---

## Lo que NO hacer en esta spec

- No implementar el panel de snapshots (INK-06)
- No implementar el panel de IA (INK-08)
- No añadir la toolbar de formato al editor (INK-09)
- No implementar drag & drop para reordenar el árbol (INK-09)
