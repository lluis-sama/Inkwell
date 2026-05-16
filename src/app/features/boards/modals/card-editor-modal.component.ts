import {
  Component, inject, input, output, signal,
  computed, OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Card, CardType, CharacterData,
  CARD_TYPE_LABELS, CARD_TYPE_ICONS,
  DEFAULT_COLORS_BY_TYPE, DEFAULT_CARD_COLORS,
} from '../../../core/models/board.model';
import { CharacterScanService, ChapterAppearance } from '../../../core/services/character-scan.service';
import { ProjectService } from '../../../core/services/project.service';
import { InkModalComponent }  from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';

@Component({
  selector: 'app-card-editor-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  templateUrl: './card-editor-modal.component.html',
  styles: [`
    .field-label { color:var(--ink-subtle); font-size:.7rem; font-weight:500;
                   text-transform:uppercase; letter-spacing:.05em; }
    .field-input { width:100%; padding:.4rem .6rem; border-radius:.25rem;
                   background:var(--ink-bg); border:1px solid var(--ink-border);
                   color:var(--ink-text); font-size:.875rem; }
    .field-input:focus { outline:none; border-color:var(--ink-accent); }
    .field-input::placeholder { color:var(--ink-muted); }
  `],
})
export class CardEditorModalComponent implements OnInit {
  private scanService = inject(CharacterScanService);
  private project     = inject(ProjectService);

  card  = input.required<Card>();
  isNew = input<boolean>(false);

  saved     = output<Card>();
  cancelled = output<void>();

  // Form state
  editType     = signal<CardType>('note');
  editTitle    = '';
  editBody     = '';
  editColor    = DEFAULT_CARD_COLORS[0];
  aliasesInput = '';
  selectedChapterIds = signal<string[]>([]);
  scanResults        = signal<ChapterAppearance[]>([]);
  scanning           = signal(false);

  // Computed: lista plana de documentos del proyecto (sin carpetas)
  allDocuments = computed(() => {
    const tree = this.project.project()?.tree ?? [];
    return this.flattenDocuments(tree);
  });

  readonly cardTypes   = ['character', 'note', 'research', 'other'] as CardType[];
  readonly typeLabels  = CARD_TYPE_LABELS;
  readonly typeIcons   = CARD_TYPE_ICONS;
  readonly availableColors = [
    '#4a3f6b', '#313244', '#3b4f6b', '#3b5e4f',
    '#6b4a3b', '#45475a', '#585b70',
  ];

  ngOnInit(): void {
    const c = this.card();
    this.editType.set(c.type ?? 'note');
    this.editTitle = c.title;
    this.editBody  = c.body;
    this.editColor = c.color;

    if (c.characterData) {
      this.aliasesInput = (c.characterData.aliases ?? []).join(', ');
      this.selectedChapterIds.set([...c.characterData.appearsInChapters]);
    }
  }

  onTypeChange(type: CardType): void {
    this.editType.set(type);
    const defaultColors = Object.values(DEFAULT_COLORS_BY_TYPE);
    if (defaultColors.includes(this.editColor)) {
      this.editColor = DEFAULT_COLORS_BY_TYPE[type];
    }
  }

  async scanChapters(): Promise<void> {
    if (!this.editTitle.trim()) return;
    this.scanning.set(true);
    try {
      const aliases = this.aliasesInput
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);

      const results = await this.scanService.scanCharacter(this.editTitle, aliases);
      this.scanResults.set(results);

      const foundIds = results.map(r => r.documentId);
      const merged   = Array.from(new Set([...this.selectedChapterIds(), ...foundIds]));
      this.selectedChapterIds.set(merged);
    } finally {
      this.scanning.set(false);
    }
  }

  toggleChapter(id: string): void {
    this.selectedChapterIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  }

  scanCountFor(documentId: string): number {
    return this.scanResults().find(r => r.documentId === documentId)?.matchCount ?? 0;
  }

  canSave(): boolean {
    if (this.editType() === 'character') return this.editTitle.trim().length > 0;
    return true;
  }

  save(): void {
    const characterData: CharacterData | undefined =
      this.editType() === 'character'
        ? {
            aliases:          this.aliasesInput
              .split(',').map(a => a.trim()).filter(a => a.length > 0),
            appearsInChapters: this.selectedChapterIds(),
            lastScannedAt:    this.scanResults().length > 0
              ? new Date().toISOString()
              : this.card().characterData?.lastScannedAt,
          }
        : undefined;

    this.saved.emit({
      ...this.card(),
      type:  this.editType(),
      title: this.editTitle.trim() || 'Sin título',
      body:  this.editBody.trim(),
      color: this.editColor,
      characterData,
    });
  }

  private flattenDocuments(
    nodes: import('../../../core/models/project.model').TreeNode[],
  ): Array<{ id: string; title: string }> {
    return nodes.flatMap(n =>
      n.type === 'folder'
        ? this.flattenDocuments(n.children)
        : [{ id: n.id, title: n.title }]
    );
  }
}
