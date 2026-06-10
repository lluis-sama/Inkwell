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
  effect,
} from "@angular/core";
import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { EditorToolbarComponent } from "./editor-toolbar.component";
import { SettingsService } from "../../../core/services/settings.service";
import { LanguageToolService } from "../../../core/services/language-tool.service";
import { AppConfigService } from "../../../core/services/app-config.service";
import { LanguageTool } from "../../../shared/utils/tiptap-languagetool";
import { LiteraryPunctuationSettingsService } from "../literary-punctuation/literary-punctuation-settings.service";
import { LiteraryPunctuationExtension } from "../literary-punctuation/literary-punctuation.extension";

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
  styleUrl: "./tiptap-editor.component.css",
})
export class TiptapEditorComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  private readonly settingsService = inject(SettingsService);
  readonly ltService = inject(LanguageToolService);
  private readonly appConfigSvc = inject(AppConfigService);
  private readonly literarySettings = inject(LiteraryPunctuationSettingsService);

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
  rebuildKey = input<number>(0);

  contentChanged = output<object>();

  private editor: Editor | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmittedContent = '';

  readonly editorReady = signal<Editor | null>(null);
  wordCount = signal<number>(0);
  charCount = signal<number>(0);

  ngAfterViewInit(): void {
    this.createEditor();

    // Recrear el editor cuando cambia el idioma de LanguageTool
    // (disparado desde editor-layout.component.ts tras guardar)
    let prevRebuildKey = this.rebuildKey();
    effect(() => {
      const key = this.rebuildKey();
      if (key === prevRebuildKey) return;
      prevRebuildKey = key;

      // Emitir contenido pendiente inmediatamente antes de destruir
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (this.editor) {
        const json = this.editor.getJSON();
        const serialized = JSON.stringify(json);
        if (serialized !== this.lastEmittedContent) {
          this.lastEmittedContent = serialized;
          this.contentChanged.emit(json);
        }
      }

      this.destroyEditor();
      this.createEditor();
    });
  }

  private createEditor(): void {
    const SearchPlugin = Extension.create({
      name: 'inkwellSearch',
      addProseMirrorPlugins: () => [buildSearchPlugin()],
    });

    const extensions = [
      StarterKit,
      Placeholder.configure({ placeholder: this.placeholder() }),
      CharacterCount,
      SearchPlugin,
      LiteraryPunctuationExtension.configure({ config: this.literarySettings.config() }),
    ];

    // CRÍTICO-4: solo añadir la extensión LanguageTool si el servidor ya está listo
    if (this.ltService.serverReady()) {
      const lang = this.ltService.resolvedLanguage();
      extensions.push(LanguageTool.configure({
        language: lang,
        apiUrl: this.ltService.apiUrl,
        automaticMode: true,
        documentId: undefined,
        motherTongue: lang,
        disabledRules: this.appConfigSvc.config().ltDisabledRules,
        onIgnoreRule: (ruleId: string) => {
          this.appConfigSvc.addLtDisabledRule(ruleId);
        },
      }));
    }

    this.editor = new Editor({
      element: this.editorEl.nativeElement,
      extensions,
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

  private destroyEditor(): void {
    this.editorReady.set(null);
    this.editor?.destroy();
    this.editor = null;
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
    this.destroyEditor();
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
