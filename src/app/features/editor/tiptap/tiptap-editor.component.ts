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
} from "@angular/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { EditorToolbarComponent } from "./editor-toolbar.component";

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
        font-family: "Lora", Georgia, serif;
        font-size: 1.05rem;
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
    `,
  ],
})
export class TiptapEditorComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @ViewChild("editorEl") editorEl!: ElementRef<HTMLDivElement>;

  content = input<object>({ type: "doc", content: [{ type: "paragraph" }] });
  editable = input<boolean>(true);
  placeholder = input<string>("Empieza a escribir...");
  focusMode = input<boolean>(false);

  contentChanged = output<object>();

  private editor: Editor | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly editorReady = signal<Editor | null>(null);
  wordCount = signal<number>(0);
  charCount = signal<number>(0);

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
    });
    this.editorReady.set(this.editor);

    this.editor.on("update", ({ editor }) => {
      this.wordCount.set(editor.storage["characterCount"].words());
      this.charCount.set(editor.storage["characterCount"].characters());

      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.contentChanged.emit(editor.getJSON());
      }, 300);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["content"] && this.editor && !changes["content"].firstChange) {
      this.editor.commands.setContent(changes["content"].currentValue);
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

  insertAtCursor(text: string): void {
    if (!this.editor) return;
    this.editor.chain().focus().insertContent(text).run();
  }
}
