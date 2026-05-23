import {
  Component,
  ElementRef,
  ViewChild,
  input,
  output,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  SimpleChanges,
  signal,
  computed,
  inject,
} from "@angular/core";
import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { EditorToolbarComponent } from "./editor-toolbar.component";
import { SettingsService } from "../../../core/services/settings.service";

interface SearchState {
  term: string;
  caseSensitive: boolean;
  results: Array<{ from: number; to: number }>;
  currentIndex: number;
}

const searchPluginKey = new PluginKey<SearchState>('inkwell-search');

function buildSearchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchPluginKey,

    state: {
      init: () => ({ term: '', caseSensitive: false, results: [], currentIndex: 0 }),
      apply(tr: import('prosemirror-state').Transaction, prev: SearchState): SearchState {
        const meta = tr.getMeta(searchPluginKey) as Partial<SearchState> | undefined;
        if (meta !== undefined) {
          return { ...prev, ...meta };
        }
        if (tr.docChanged) {
          return { ...prev, results: findAll(tr.doc as any, prev.term, prev.caseSensitive), currentIndex: 0 };
        }
        return prev;
      },
    },

    props: {
      decorations(state: import('prosemirror-state').EditorState) {
        const searchState = searchPluginKey.getState(state);
        if (!searchState) return DecorationSet.empty;
        const { term, results, currentIndex } = searchState;
        if (!term || results.length === 0) return DecorationSet.empty;
        const decorations = results.map((r: { from: number; to: number }, i: number) =>
          Decoration.inline(r.from, r.to, {
            class: i === currentIndex ? 'search-result-current' : 'search-result',
          })
        );
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

function findAll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  term: string,
  caseSensitive: boolean,
): Array<{ from: number; to: number }> {
  if (!term) return [];
  const results: Array<{ from: number; to: number }> = [];
  const searchTerm = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node: import('prosemirror-model').Node, pos: number) => {
    if (!node.isText || !node.text) return;
    const text = caseSensitive ? node.text : node.text.toLowerCase();
    let idx = text.indexOf(searchTerm);
    while (idx !== -1) {
      results.push({ from: pos + idx, to: pos + idx + searchTerm.length });
      idx = text.indexOf(searchTerm, idx + 1);
    }
  });
  return results;
}

@Component({
  selector: "app-tiptap-editor",
  standalone: true,
  imports: [EditorToolbarComponent],
  templateUrl: "./tiptap-editor.component.html",
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      ::ng-deep .tiptap-host .ProseMirror {
        outline: none;
        min-height: 100%;
        line-height: 1.25;
        color: var(--ink-text);
        max-width: 720px;
        margin: 0 auto;
      }

      ::ng-deep .tiptap-host .ProseMirror p {
        margin-bottom: 0.75em;
      }
      ::ng-deep .tiptap-host .ProseMirror h1 {
        font-size: 1.75rem;
        font-weight: 600;
        margin: 1.5em 0 0.5em;
        color: var(--ink-text);
      }
      ::ng-deep .tiptap-host .ProseMirror h2 {
        font-size: 1.35rem;
        font-weight: 600;
        margin: 1.25em 0 0.4em;
        color: var(--ink-text);
      }
      ::ng-deep .tiptap-host .ProseMirror h3 {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 1em 0 0.3em;
        color: var(--ink-text);
      }
      ::ng-deep .tiptap-host .ProseMirror blockquote {
        border-left: 3px solid var(--ink-accent);
        padding-left: 1rem;
        margin: 1em 0;
        color: var(--ink-subtle);
        font-style: italic;
      }
      ::ng-deep .tiptap-host .ProseMirror code {
        background: var(--ink-surface);
        border-radius: 3px;
        padding: 0.1em 0.3em;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.875em;
      }
      ::ng-deep .tiptap-host .ProseMirror pre {
        background: var(--ink-surface);
        border-radius: 6px;
        padding: 1em;
        overflow-x: auto;
        margin: 1em 0;
      }
      ::ng-deep .tiptap-host .ProseMirror pre code {
        background: none;
        padding: 0;
      }
      ::ng-deep .tiptap-host .ProseMirror ul,
      ::ng-deep .tiptap-host .ProseMirror ol {
        padding-left: 1.5em;
        margin: 0.5em 0;
      }
      ::ng-deep .tiptap-host .ProseMirror li {
        margin-bottom: 0.25em;
      }
      ::ng-deep .tiptap-host .ProseMirror hr {
        border: none;
        border-top: 1px solid var(--ink-border);
        margin: 2em 0;
      }
      ::ng-deep .tiptap-host .ProseMirror strong {
        color: var(--ink-text);
      }
      ::ng-deep .tiptap-host .ProseMirror em {
        color: var(--ink-subtext1, var(--ink-subtle));
      }

      ::ng-deep .tiptap-host .ProseMirror .is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        color: var(--ink-muted);
        pointer-events: none;
        float: left;
        height: 0;
      }

      ::ng-deep .tiptap-host .ProseMirror .search-result {
        background: var(--ink-warning, #f9e2af);
        color: var(--ink-panel, #1e1e2e);
        border-radius: 2px;
      }

      ::ng-deep .tiptap-host .ProseMirror .search-result-current {
        background: var(--ink-accent, #cba6f7);
        color: var(--ink-panel, #1e1e2e);
        border-radius: 2px;
      }
    `,
  ],
})
export class TiptapEditorComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  private readonly settingsService = inject(SettingsService);

  readonly editorFontFamily = computed(() => this.settingsService.settings().editor.fontFamily);
  readonly editorFontSize   = computed(() => this.settingsService.settings().editor.fontSize);

  @ViewChild("editorEl") editorEl!: ElementRef<HTMLDivElement>;

  content = input<object>({ type: "doc", content: [{ type: "paragraph" }] });
  editable = input<boolean>(true);
  placeholder = input<string>("Empieza a escribir...");
  focusMode = input<boolean>(false);
  typewriterMode = input<boolean>(false);
  spellcheck = input<boolean>(true);
  compact = input<boolean>(false);

  contentChanged = output<object>();

  private editor: Editor | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmittedContent = '';

  readonly editorReady = signal<Editor | null>(null);
  wordCount = signal<number>(0);
  charCount = signal<number>(0);

  ngAfterViewInit(): void {
    const SearchPlugin = Extension.create({
      name: 'inkwellSearch',
      addProseMirrorPlugins: () => [buildSearchPlugin()],
    });

    this.editor = new Editor({
      element: this.editorEl.nativeElement,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: this.placeholder() }),
        CharacterCount,
        SearchPlugin,
      ],
      content: this.content(),
      editable: this.editable(),
    });
    this.editorReady.set(this.editor);

    this.editor.on("update", ({ editor }) => {
      this.wordCount.set(editor.storage["characterCount"].words());
      this.charCount.set(editor.storage["characterCount"].characters());

      if (this.typewriterMode()) this.centerActiveLine();

      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        const json = editor.getJSON();
        this.lastEmittedContent = JSON.stringify(json);
        this.contentChanged.emit(json);
      }, 300);
    });

    this.editor.on("selectionUpdate", () => {
      if (this.typewriterMode()) this.centerActiveLine();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["content"] && this.editor && !changes["content"].firstChange) {
      const incoming = JSON.stringify(changes["content"].currentValue);
      if (incoming !== this.lastEmittedContent) {
        this.editor.commands.setContent(changes["content"].currentValue);
      }
    }
    if (changes["editable"] && this.editor) {
      this.editor.setEditable(changes["editable"].currentValue);
    }
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.editorReady.set(null);
    this.editor?.destroy();
  }

  find(query: string, caseSensitive = false): void {
    if (!this.editor) return;
    const results = findAll(this.editor.state.doc as any, query, caseSensitive);
    this.editor.view.dispatch(
      this.editor.state.tr.setMeta(searchPluginKey, {
        term: query,
        caseSensitive,
        results,
        currentIndex: 0,
      })
    );
  }

  findNext(): void {
    if (!this.editor) return;
    const state = searchPluginKey.getState(this.editor.state);
    if (!state || state.results.length === 0) return;
    const nextIndex = (state.currentIndex + 1) % state.results.length;
    this.editor.view.dispatch(
      this.editor.state.tr.setMeta(searchPluginKey, { currentIndex: nextIndex })
    );
    this.scrollToResult(state.results[nextIndex]);
  }

  findPrev(): void {
    if (!this.editor) return;
    const state = searchPluginKey.getState(this.editor.state);
    if (!state || state.results.length === 0) return;
    const prevIndex = (state.currentIndex - 1 + state.results.length) % state.results.length;
    this.editor.view.dispatch(
      this.editor.state.tr.setMeta(searchPluginKey, { currentIndex: prevIndex })
    );
    this.scrollToResult(state.results[prevIndex]);
  }

  replace(replacement: string): void {
    if (!this.editor) return;
    const state = searchPluginKey.getState(this.editor.state);
    if (!state || state.results.length === 0) return;
    const current = state.results[state.currentIndex];
    if (!current) return;
    const { tr } = this.editor.state;
    tr.replaceWith(current.from, current.to, this.editor.schema.text(replacement));
    const newResults = findAll(tr.doc as any, state.term, state.caseSensitive);
    const nextIndex = Math.min(state.currentIndex, Math.max(0, newResults.length - 1));
    tr.setMeta(searchPluginKey, { term: state.term, caseSensitive: state.caseSensitive, results: newResults, currentIndex: nextIndex });
    this.editor.view.dispatch(tr);
  }

  replaceAll(replacement: string): void {
    if (!this.editor) return;
    const state = searchPluginKey.getState(this.editor.state);
    if (!state || state.results.length === 0) return;
    const { tr } = this.editor.state;
    const results = [...state.results].reverse();
    for (const r of results) {
      tr.replaceWith(r.from, r.to, this.editor.schema.text(replacement));
    }
    tr.setMeta(searchPluginKey, { term: state.term, caseSensitive: state.caseSensitive, results: [], currentIndex: 0 });
    this.editor.view.dispatch(tr);
  }

  clearSearch(): void {
    if (!this.editor) return;
    this.editor.view.dispatch(
      this.editor.state.tr.setMeta(searchPluginKey, {
        term: '', caseSensitive: false, results: [], currentIndex: 0,
      })
    );
  }

  getSearchResultCount(): { current: number; total: number } {
    if (!this.editor) return { current: 0, total: 0 };
    const state = searchPluginKey.getState(this.editor.state);
    if (!state || state.results.length === 0) return { current: 0, total: 0 };
    return { current: state.currentIndex + 1, total: state.results.length };
  }

  private scrollToResult(result: { from: number; to: number }): void {
    if (!this.editor) return;
    const coords = this.editor.view.coordsAtPos(result.from);
    const container = this.editorEl.nativeElement;
    const containerRect = container.getBoundingClientRect();
    const lineCenter = (coords.top + coords.bottom) / 2;
    const containerCenter = containerRect.top + container.clientHeight / 2;
    const scrollDelta = lineCenter - containerCenter;
    if (Math.abs(scrollDelta) > 10) {
      container.scrollBy({ top: scrollDelta, behavior: 'smooth' });
    }
  }

  insertAtCursor(text: string): void {
    if (!this.editor) return;
    this.editor.chain().focus().insertContent(text).run();
  }

  private centerActiveLine(): void {
    if (!this.editor) return;
    const { from } = this.editor.state.selection;
    const coords = this.editor.view.coordsAtPos(from);
    const container = this.editorEl.nativeElement;
    const containerRect = container.getBoundingClientRect();
    const lineCenter = (coords.top + coords.bottom) / 2;
    const containerCenter = containerRect.top + container.clientHeight / 2;
    const scrollDelta = lineCenter - containerCenter;
    if (Math.abs(scrollDelta) > 2) {
      container.scrollBy({ top: scrollDelta, behavior: 'smooth' });
    }
  }
}
