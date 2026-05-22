# INK-14 — Tipos de tarjeta y sistema de personajes en tableros

## Objetivo

Ampliar los tableros de corcho con un sistema de tipos de tarjeta. Las tarjetas pueden ser de cuatro tipos: **personaje**, **nota**, **investigación** u **otro**. Las tarjetas de tipo personaje tienen un comportamiento especial: al crearlas o editarlas, el sistema puede buscar automáticamente en qué capítulos aparece el personaje (por nombre), y esa información queda visible en la tarjeta y accesible para INK-15 (vista narrativa).

---

## Modelo de datos — modificaciones

### `board.model.ts`

```typescript
export type CardType = 'character' | 'note' | 'research' | 'other';

export interface Card {
  id: string;
  type: CardType;          // NUEVO — default: 'note'
  title: string;
  body: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Solo para type === 'character':
  characterData?: CharacterData;
}

export interface CharacterData {
  aliases?: string[];          // Otros nombres o apodos del personaje
  appearsInChapters: string[]; // IDs de documentos donde aparece
  lastScannedAt?: string;      // ISO 8601 — cuándo se hizo el último escaneo
}

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  character:  'Personaje',
  note:       'Nota',
  research:   'Investigación',
  other:      'Otro',
};

export const CARD_TYPE_ICONS: Record<CardType, string> = {
  character:  '👤',
  note:       '📝',
  research:   '🔍',
  other:      '📌',
};

// Colores por defecto por tipo (pueden cambiarse por el usuario)
export const DEFAULT_COLORS_BY_TYPE: Record<CardType, string> = {
  character: '#4a3f6b',  // púrpura oscuro
  note:      '#313244',  // surface0 neutro
  research:  '#3b4f6b',  // azul oscuro
  other:     '#45475a',  // surface1
};
```

**Migración de tarjetas existentes**: al cargar un tablero, si una tarjeta no tiene `type`, asignarle `'note'` por defecto. Hacer esto en `BoardService.loadBoard()`.

---

## Parte 1: CharacterScanService

Servicio responsable de buscar apariciones de un personaje en los documentos del proyecto.

### `src/app/core/services/character-scan.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { TreeNode }           from '../models/project.model';
import { DocumentFile }       from '../models/document.model';
import { tiptapToText }       from '../../shared/utils/tiptap-to-text';
import { documentPath, documentsFolderPath } from '../../shared/utils/project-paths';

export interface ChapterAppearance {
  documentId:    string;
  documentTitle: string;
  matchCount:    number;
}

@Injectable({ providedIn: 'root' })
export class CharacterScanService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  /**
   * Escanea todos los documentos del proyecto buscando apariciones
   * del personaje por nombre (y aliases opcionales).
   *
   * Usa coincidencia de palabra completa (\b) para evitar falsos positivos.
   * El usuario puede revisar y ajustar el resultado manualmente.
   */
  async scanCharacter(
    name: string,
    aliases: string[] = [],
  ): Promise<ChapterAppearance[]> {
    const basePath = this.project.basePath();
    if (!basePath || !name.trim()) return [];

    const terms   = [name, ...aliases].filter(t => t.trim().length > 0);
    const pattern = this.buildPattern(terms);
    const ids     = await this.bridge.listJsonFiles(documentsFolderPath(basePath));
    const results: ChapterAppearance[] = [];

    for (const id of ids) {
      try {
        const raw   = await this.bridge.readJsonFile(documentPath(basePath, id));
        const doc: DocumentFile = JSON.parse(raw);
        const text  = tiptapToText(doc.content);

        pattern.lastIndex = 0;
        const matches = text.match(pattern);

        if (matches && matches.length > 0) {
          results.push({
            documentId:    id,
            documentTitle: doc.title,
            matchCount:    matches.length,
          });
        }
      } catch { /* ignorar documentos que no se puedan leer */ }
    }

    return results;
  }

  private buildPattern(terms: string[]): RegExp {
    const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(
      escaped.map(t => `\\b${t}\\b`).join('|'),
      'gi',
    );
  }
}
```

---

## Parte 2: CardEditorModalComponent (reemplazar)

El modal de edición de tarjetas se amplía significativamente. Ahora incluye:
- Selector de tipo
- Sección de personaje (aliases + apariciones en capítulos) condicional al tipo
- Colores por defecto inteligentes al cambiar de tipo

```typescript
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
  template: `
    <ink-modal [title]="isNew() ? 'Nueva tarjeta' : 'Editar tarjeta'"
               (closed)="cancelled.emit()">

      <div class="flex flex-col gap-4">

        <!-- Selector de tipo -->
        <div class="flex flex-col gap-1.5">
          <label class="field-label">Tipo</label>
          <div class="flex gap-2">
            @for (type of cardTypes; track type) {
              <button
                (click)="onTypeChange(type)"
                class="flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg
                       border-2 transition-all text-xs"
                [class]="editType() === type
                  ? 'border-ink-accent bg-ink-surface text-ink-text'
                  : 'border-ink-border text-ink-subtle hover:border-ink-muted'">
                <span class="text-base">{{ typeIcons[type] }}</span>
                <span>{{ typeLabels[type] }}</span>
              </button>
            }
          </div>
        </div>

        <!-- Título -->
        <div class="flex flex-col gap-1.5">
          <label class="field-label">
            {{ editType() === 'character' ? 'Nombre del personaje *' : 'Título' }}
          </label>
          <input
            [(ngModel)]="editTitle"
            [placeholder]="editType() === 'character' ? 'Elena Vidal' : 'Título de la tarjeta'"
            maxlength="100"
            class="field-input"/>
        </div>

        <!-- Cuerpo -->
        <div class="flex flex-col gap-1.5">
          <label class="field-label">
            {{ editType() === 'character' ? 'Descripción / notas del personaje' : 'Contenido' }}
          </label>
          <textarea
            [(ngModel)]="editBody"
            [placeholder]="editType() === 'character'
              ? 'Protagonista. 34 años. Detective privada. Motivación: encontrar a su hermana...'
              : 'Escribe aquí tus notas, ideas...'"
            rows="4"
            class="field-input resize-none">
          </textarea>
        </div>

        <!-- ─── Sección de personaje (solo si type === 'character') ─── -->
        @if (editType() === 'character') {
          <div class="flex flex-col gap-3 pt-1 border-t border-ink-border">

            <!-- Aliases -->
            <div class="flex flex-col gap-1.5">
              <label class="field-label">
                Nombres alternativos / apodos
                <span class="normal-case font-normal">(separados por coma)</span>
              </label>
              <input
                [(ngModel)]="aliasesInput"
                placeholder="Elena, Eli, Detective Vidal"
                class="field-input"/>
              <p class="text-ink-muted text-xs">
                Se usarán todos en la búsqueda de apariciones.
              </p>
            </div>

            <!-- Apariciones en capítulos -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <label class="field-label">Aparece en</label>
                <button
                  (click)="scanChapters()"
                  [disabled]="!editTitle.trim() || scanning()"
                  class="flex items-center gap-1.5 text-xs text-ink-accent
                         hover:underline disabled:opacity-40
                         disabled:cursor-not-allowed transition-colors">
                  @if (scanning()) {
                    <span class="inline-block w-3 h-3 border border-current
                                 border-t-transparent rounded-full animate-spin"></span>
                    Escaneando...
                  } @else {
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    Buscar apariciones
                  }
                </button>
              </div>

              @if (scanResults().length > 0) {
                <div class="text-ink-muted text-xs mb-1">
                  Resultados del último escaneo.
                  Desmarca los capítulos donde el personaje no aparece realmente.
                </div>
              }

              <!-- Lista de todos los documentos del proyecto, con checkboxes -->
              <div class="max-h-40 overflow-y-auto flex flex-col gap-1">
                @if (allDocuments().length === 0) {
                  <p class="text-ink-muted text-xs">
                    El proyecto no tiene documentos todavía.
                  </p>
                }
                @for (doc of allDocuments(); track doc.id) {
                  <label class="flex items-center gap-2 cursor-pointer
                                hover:bg-ink-surface rounded px-2 py-1 transition-colors">
                    <input
                      type="checkbox"
                      [checked]="selectedChapterIds().includes(doc.id)"
                      (change)="toggleChapter(doc.id)"
                      class="accent-ink-accent w-3 h-3 shrink-0"/>
                    <span class="text-ink-text text-xs flex-1 truncate">{{ doc.title }}</span>
                    @if (scanCountFor(doc.id) > 0) {
                      <span class="text-ink-subtle text-xs shrink-0">
                        {{ scanCountFor(doc.id) }}×
                      </span>
                    }
                  </label>
                }
              </div>

              <p class="text-ink-muted text-xs leading-relaxed">
                La búsqueda automática usa el nombre del personaje como palabra completa.
                Ajusta manualmente si hay falsos positivos o nombres no detectados.
              </p>
            </div>
          </div>
        }

        <!-- Color -->
        <div class="flex flex-col gap-2">
          <label class="field-label">Color</label>
          <div class="flex gap-2 flex-wrap">
            @for (color of availableColors; track color) {
              <button
                (click)="editColor = color"
                class="w-7 h-7 rounded-full border-2 transition-all"
                [style.background]="color"
                [class]="editColor === color
                  ? 'border-ink-accent scale-110'
                  : 'border-transparent hover:scale-105'">
              </button>
            }
          </div>
        </div>

      </div>

      <ng-container slot="actions">
        <ink-button variant="ghost" (clicked)="cancelled.emit()">Cancelar</ink-button>
        <ink-button
          variant="primary"
          [disabled]="!canSave()"
          (clicked)="save()">
          {{ isNew() ? 'Crear tarjeta' : 'Guardar' }}
        </ink-button>
      </ng-container>

    </ink-modal>
  `,
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
    // Aplicar color por defecto del tipo si el color actual
    // es el genérico (no ha sido personalizado)
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

      // Pre-seleccionar capítulos encontrados, manteniendo los ya seleccionados manualmente
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
```

---

## Parte 3: Actualizar `BoardCardComponent`

Las tarjetas deben mostrar visualmente su tipo y, en el caso de personajes, el número de capítulos donde aparecen.

```typescript
// En el template de BoardCardComponent, añadir al header de la tarjeta:

<!-- Indicador de tipo + badge de capítulos (personajes) -->
<div class="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
  <span class="text-xs opacity-70">{{ typeIcon(card().type) }}</span>
  @if (card().type === 'character' && chapterCount() > 0) {
    <span class="ml-auto text-xs opacity-60 font-mono">
      {{ chapterCount() }} cap.
    </span>
  }
</div>
```

Añadir computed en el componente:
```typescript
chapterCount = computed(() =>
  this.card().characterData?.appearsInChapters.length ?? 0
);

typeIcon(type: CardType | undefined): string {
  return CARD_TYPE_ICONS[type ?? 'note'];
}
```

---

## Parte 4: Actualizar `BoardService`

### Migración de tarjetas sin tipo

En `loadBoard()`, normalizar las tarjetas antiguas:

```typescript
async loadBoard(id: string): Promise<BoardFile> {
  const basePath = this.requireBasePath();
  const raw      = await this.bridge.readJsonFile(boardPath(basePath, id));
  const board: BoardFile = JSON.parse(raw);

  // Migración: asignar type 'note' a tarjetas sin type
  const migrated = {
    ...board,
    cards: board.cards.map(c => ({
      ...c,
      type: c.type ?? 'note',
    })),
  };

  return migrated;
}
```

### Actualizar `addCard()` para respetar el tipo

```typescript
addCard(
  board: BoardFile,
  position: { x: number; y: number },
  type: CardType = 'note',
  title = 'Nueva tarjeta',
): BoardFile {
  const card: Card = {
    id:    crypto.randomUUID(),
    type,
    title,
    body:  '',
    color: DEFAULT_COLORS_BY_TYPE[type],
    x:     position.x,
    y:     position.y,
    width:  220,
    height: 160,
  };
  return { ...board, cards: [...board.cards, card] };
}
```

---

## Parte 5: Menú contextual del canvas — selección de tipo al crear

En `BoardCanvasComponent`, el menú contextual de click derecho amplía las opciones:

```html
<!-- Menú contextual actualizado -->
<div class="fixed z-50 rounded-lg border border-ink-border bg-ink-surface shadow-xl py-1 min-w-48"
     [style.left.px]="contextMenu()!.screenX"
     [style.top.px]="contextMenu()!.screenY">

  <div class="px-3 py-1.5 text-ink-subtle text-xs font-medium uppercase tracking-wide">
    Nueva tarjeta
  </div>

  @for (type of cardTypes; track type) {
    <button
      (click)="onAddCard(type)"
      class="w-full flex items-center gap-2.5 text-left px-4 py-2
             text-sm text-ink-text hover:bg-ink-border transition-colors">
      <span>{{ typeIcons[type] }}</span>
      {{ typeLabels[type] }}
    </button>
  }
</div>
```

Actualizar `onAddCard()` para recibir el tipo:

```typescript
onAddCard(type: CardType = 'note'): void {
  const pos = this.contextMenu();
  this.contextMenu.set(null);
  if (pos) this.cardAdded.emit({ x: pos.canvasX, y: pos.canvasY, type });
}
```

Actualizar el output:
```typescript
cardAdded = output<{ x: number; y: number; type: CardType }>();
```

Actualizar `onCardAdded()` en `BoardsLayoutComponent`:
```typescript
async onCardAdded(event: { x: number; y: number; type: CardType }): Promise<void> {
  const board   = this.activeBoard();
  if (!board) return;
  const updated = this.boardService.addCard(board, event, event.type);
  await this.persistBoard(updated);
  // Abrir el modal de edición inmediatamente para que el usuario rellene los datos
  const newCard = updated.cards[updated.cards.length - 1];
  this.editingCard.set(newCard);
  this.isNewCard.set(true);
}
```

Añadir signal:
```typescript
isNewCard = signal(false);
```

Actualizar binding del modal:
```html
@if (editingCard()) {
  <app-card-editor-modal
    [card]="editingCard()!"
    [isNew]="isNewCard()"
    (saved)="onCardSaved($event)"
    (cancelled)="onCardEditCancelled()"/>
}
```

Método para cuando se cancela una tarjeta nueva (eliminarla):
```typescript
onCardEditCancelled(): void {
  const card  = this.editingCard();
  const board = this.activeBoard();
  if (this.isNewCard() && card && board) {
    const cleaned = this.boardService.deleteCard(board, card.id);
    this.persistBoard(cleaned);
  }
  this.editingCard.set(null);
  this.isNewCard.set(false);
}
```

---

## Criterios de aceptación

**Tipos de tarjeta:**
- [ ] El menú contextual del canvas muestra las cuatro opciones de tipo al crear
- [ ] Cada tipo tiene su icono emoji visible en la tarjeta
- [ ] Al crear una tarjeta, el modal se abre directamente (flujo inmediato)
- [ ] Cancelar la creación de una tarjeta nueva la elimina del tablero
- [ ] El color por defecto cambia según el tipo seleccionado
- [ ] Tarjetas existentes (sin `type`) se migran a `'note'` al cargar el tablero

**Sección de personaje:**
- [ ] Al seleccionar tipo "Personaje" en el modal, aparece la sección de personaje
- [ ] El campo de aliases acepta nombres separados por comas
- [ ] El botón "Buscar apariciones" está deshabilitado si el nombre del personaje está vacío
- [ ] Al pulsar "Buscar apariciones", se escanean todos los documentos del proyecto
- [ ] Los documentos donde aparece el personaje se marcan automáticamente con checkbox
- [ ] Junto a cada documento marcado se muestra el número de coincidencias (ej. "3×")
- [ ] El usuario puede marcar/desmarcar manualmente cualquier documento
- [ ] El aviso explica que la búsqueda usa palabra completa y puede necesitar ajuste manual
- [ ] Guardar persiste los IDs de capítulos seleccionados en `characterData.appearsInChapters`
- [ ] El campo aliases se guarda como array en `characterData.aliases`

**Tarjetas de personaje en el canvas:**
- [ ] Las tarjetas de tipo personaje muestran "👤" en la esquina superior izquierda
- [ ] Si el personaje tiene capítulos asignados, se muestra "N cap." en la esquina derecha
- [ ] La información es informativa, no es un botón (la edición sigue siendo con doble click)

**Persistencia:**
- [ ] El tipo y los datos de personaje se guardan correctamente en `boards/{id}.json`
- [ ] Recargar la app mantiene el tipo, aliases y capítulos asignados

---

## Lo que NO hacer en esta spec

- No implementar la vista narrativa que consume estos datos (INK-15)
- No añadir relaciones visuales con líneas entre tarjetas (backlog)
- No implementar un índice global de personajes entre tableros
- No crear un tablero especial automático — los tableros siguen siendo manuales
- No sincronizar automáticamente las apariciones al editar documentos — el escaneo es siempre manual y bajo demanda
