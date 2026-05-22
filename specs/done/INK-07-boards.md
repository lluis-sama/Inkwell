# INK-07 — Boards (Tableros de corcho)

## Objetivo

Implementar la vista de tableros de corcho. El usuario puede gestionar múltiples tableros por proyecto, crear y editar tarjetas con posicionamiento libre en canvas, y navegar entre la vista de editor y la de tableros. Las tarjetas son arrastrables con interact.js y su posición se persiste inmediatamente al soltar.

---

## Componentes a crear / modificar

```
src/app/
  features/
    boards/
      boards-layout.component.ts        ← orquestador principal
      board-selector/
        board-selector.component.ts     ← panel lateral de selección de tablero
      canvas/
        board-canvas.component.ts       ← área de canvas con tarjetas
        board-card.component.ts         ← tarjeta individual
      modals/
        card-editor-modal.component.ts  ← modal para editar tarjeta
        new-board-modal.component.ts    ← modal para crear tablero
  shared/
    components/
      ink-nav.component.ts             ← navegación global editor ↔ boards
```

La `InkNavComponent` se añade también a `EditorLayoutComponent`.

---

## Parte 1: InkNavComponent (navegación global)

Barra de iconos vertical en el extremo izquierdo, presente en ambas vistas.

### `src/app/shared/components/ink-nav.component.ts`

```typescript
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { ProjectService } from '../../core/services/project.service';

@Component({
  selector: 'ink-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="flex flex-col items-center w-12 h-full bg-ink-panel
                border-r border-ink-border py-3 gap-1 shrink-0">

      <!-- Logo -->
      <div class="mb-3">
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
          <path d="M24 4 L40 40 L24 34 L8 40 Z"
                fill="var(--ink-accent)" opacity="0.9"/>
          <path d="M24 4 L24 34"
                stroke="var(--ink-panel)" stroke-width="1.5"/>
        </svg>
      </div>

      <!-- Editor -->
      <a
        routerLink="/editor"
        title="Editor (Alt+1)"
        class="nav-icon"
        [class.active]="isRoute('/editor')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0
                   0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      </a>

      <!-- Tableros -->
      <a
        routerLink="/boards"
        title="Tableros (Alt+2)"
        class="nav-icon"
        [class.active]="isRoute('/boards')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
      </a>

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Toggle tema -->
      <button
        (click)="theme.toggle()"
        title="Cambiar tema"
        class="nav-icon">
        @if (theme.theme() === 'dark') {
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        } @else {
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        }
      </button>

    </nav>
  `,
  styles: [`
    :host { display: flex; height: 100%; }

    .nav-icon {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 8px;
      color: var(--ink-subtle);
      transition: color 0.15s, background-color 0.15s;
      cursor: pointer; text-decoration: none;
    }
    .nav-icon:hover { color: var(--ink-text); background: var(--ink-border); }
    .nav-icon.active { color: var(--ink-accent); background: var(--ink-border); }
  `],
})
export class InkNavComponent {
  theme = inject(ThemeService);
  private router = inject(Router);

  isRoute(path: string): boolean {
    return this.router.url.startsWith(path);
  }
}
```

**Integrar en `EditorLayoutComponent`:** añadir `InkNavComponent` al inicio del layout principal (antes del binder), y eliminar el toggle de tema de la top bar ya que ahora está en la nav.

Actualizar el template raíz del editor:

```html
<div class="flex h-screen bg-ink-bg overflow-hidden">
  <!-- Nav global -->
  @if (!focusMode()) {
    <ink-nav />
  }

  <!-- Contenido: top-bar + área principal -->
  <div class="flex flex-col flex-1 overflow-hidden">
    @if (!focusMode()) {
      <app-editor-top-bar ... />
    }
    <div class="flex flex-1 overflow-hidden">
      <!-- binder + editor + paneles -->
    </div>
  </div>
</div>
```

---

## Parte 2: NewBoardModalComponent

### `src/app/features/boards/modals/new-board-modal.component.ts`

```typescript
import { Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InkModalComponent } from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';
import { BoardService } from '../../../core/services/board.service';
import { BoardFile } from '../../../core/models/board.model';

@Component({
  selector: 'app-new-board-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Nuevo tablero" (closed)="cancelled.emit()">

      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Nombre del tablero *
          </label>
          <input
            [(ngModel)]="title"
            placeholder="Ideas generales"
            maxlength="80"
            (keydown.enter)="create()"
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-sm placeholder:text-ink-muted
                   focus:outline-none focus:border-ink-accent transition-colors"/>
        </div>

        @if (error()) {
          <p class="text-ink-danger text-xs">{{ error() }}</p>
        }
      </div>

      <ng-container slot="actions">
        <ink-button variant="ghost" (clicked)="cancelled.emit()">Cancelar</ink-button>
        <ink-button
          variant="primary"
          [disabled]="!title.trim()"
          [loading]="creating()"
          (clicked)="create()">
          Crear tablero
        </ink-button>
      </ng-container>

    </ink-modal>
  `,
})
export class NewBoardModalComponent {
  private boardService = inject(BoardService);

  created   = output<BoardFile>();
  cancelled = output<void>();

  title    = '';
  creating = signal(false);
  error    = signal<string | null>(null);

  async create(): Promise<void> {
    if (!this.title.trim()) return;
    this.creating.set(true);
    this.error.set(null);
    try {
      const board = await this.boardService.createBoard(this.title.trim());
      this.created.emit(board);
    } catch (e) {
      this.error.set(`Error al crear el tablero: ${e}`);
    } finally {
      this.creating.set(false);
    }
  }
}
```

---

## Parte 3: BoardSelectorComponent

### `src/app/features/boards/board-selector/board-selector.component.ts`

```typescript
import { Component, input, output } from '@angular/core';
import { BoardFile } from '../../../core/models/board.model';

@Component({
  selector: 'app-board-selector',
  standalone: true,
  template: `
    <aside class="flex flex-col w-56 h-full bg-ink-panel border-r border-ink-border shrink-0">

      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-3
                  border-b border-ink-border shrink-0">
        <span class="text-ink-subtle text-xs font-medium uppercase tracking-widest">
          Tableros
        </span>
        <button
          (click)="createRequested.emit()"
          title="Nuevo tablero"
          class="p-1 rounded text-ink-subtle hover:text-ink-text
                 hover:bg-ink-border transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <!-- Lista de tableros -->
      <div class="flex-1 overflow-y-auto py-2 px-1">
        @if (boards().length === 0) {
          <p class="text-ink-subtle text-xs text-center mt-8 px-4 leading-relaxed">
            Sin tableros todavía.<br>Crea uno con el botón +
          </p>
        } @else {
          @for (board of boards(); track board.id) {
            <div
              class="group flex items-center gap-2 px-3 py-2 rounded cursor-pointer
                     transition-colors text-sm"
              [class]="activeBoard()?.id === board.id
                ? 'bg-ink-surface text-ink-text'
                : 'text-ink-subtle hover:bg-ink-surface hover:text-ink-text'"
              (click)="boardSelected.emit(board)">

              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" class="shrink-0">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>

              <span class="flex-1 truncate">{{ board.title }}</span>

              <!-- Botón eliminar -->
              <button
                (click)="deleteRequested.emit(board.id); $event.stopPropagation()"
                title="Eliminar tablero"
                class="p-0.5 rounded text-ink-subtle opacity-0 group-hover:opacity-100
                       hover:text-ink-danger transition-all">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586
                           5.207 2.793a1 1 0 0 0-1.414 1.414L6.586 7
                           l-2.793 2.793a1 1 0 1 0 1.414 1.414L8
                           8.414l2.793 2.793a1 1 0 0 0 1.414-1.414
                           L9.414 7l2.793-2.793z"/>
                </svg>
              </button>
            </div>
          }
        }
      </div>
    </aside>
  `,
})
export class BoardSelectorComponent {
  boards      = input<BoardFile[]>([]);
  activeBoard = input<BoardFile | null>(null);

  boardSelected   = output<BoardFile>();
  createRequested = output<void>();
  deleteRequested = output<string>();  // emite el id del tablero
}
```

---

## Parte 4: CardEditorModalComponent

### `src/app/features/boards/modals/card-editor-modal.component.ts`

```typescript
import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Card, DEFAULT_CARD_COLORS } from '../../../core/models/board.model';
import { InkModalComponent } from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';

@Component({
  selector: 'app-card-editor-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Editar tarjeta" (closed)="cancelled.emit()">

      <div class="flex flex-col gap-4">

        <!-- Título -->
        <div class="flex flex-col gap-1.5">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Título
          </label>
          <input
            [(ngModel)]="editTitle"
            placeholder="Título de la tarjeta"
            maxlength="100"
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-sm placeholder:text-ink-muted
                   focus:outline-none focus:border-ink-accent transition-colors"/>
        </div>

        <!-- Cuerpo -->
        <div class="flex flex-col gap-1.5">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Contenido
          </label>
          <textarea
            [(ngModel)]="editBody"
            placeholder="Escribe aquí tus notas, ideas..."
            rows="6"
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-sm placeholder:text-ink-muted resize-none
                   focus:outline-none focus:border-ink-accent transition-colors">
          </textarea>
        </div>

        <!-- Color -->
        <div class="flex flex-col gap-2">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Color
          </label>
          <div class="flex gap-2">
            @for (color of colors; track color) {
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
        <ink-button variant="primary" (clicked)="save()">Guardar</ink-button>
      </ng-container>

    </ink-modal>
  `,
})
export class CardEditorModalComponent implements OnInit {
  card = input.required<Card>();

  saved     = output<Card>();
  cancelled = output<void>();

  editTitle = '';
  editBody  = '';
  editColor = '';
  colors    = DEFAULT_CARD_COLORS;

  ngOnInit(): void {
    this.editTitle = this.card().title;
    this.editBody  = this.card().body;
    this.editColor = this.card().color;
  }

  save(): void {
    this.saved.emit({
      ...this.card(),
      title: this.editTitle.trim() || 'Sin título',
      body:  this.editBody.trim(),
      color: this.editColor,
    });
  }
}
```

---

## Parte 5: BoardCardComponent

### `src/app/features/boards/canvas/board-card.component.ts`

```typescript
import {
  Component, ElementRef, ViewChild,
  input, output, OnInit, OnDestroy,
} from '@angular/core';
import interact from 'interactjs';
import { Card } from '../../../core/models/board.model';

@Component({
  selector: 'app-board-card',
  standalone: true,
  template: `
    <div
      #cardEl
      class="absolute rounded-lg border border-black/10 shadow-md
             cursor-grab active:cursor-grabbing select-none
             flex flex-col overflow-hidden"
      [style.left.px]="card().x"
      [style.top.px]="card().y"
      [style.width.px]="card().width"
      [style.min-height.px]="card().height"
      [style.background]="card().color"
      (dblclick)="editRequested.emit(card())">

      <!-- Header de la tarjeta -->
      <div class="px-3 pt-3 pb-1">
        <p class="text-ink-text text-sm font-medium leading-snug break-words">
          {{ card().title }}
        </p>
      </div>

      <!-- Cuerpo -->
      @if (card().body) {
        <div class="px-3 pb-3 flex-1">
          <p class="text-ink-subtle text-xs leading-relaxed break-words whitespace-pre-wrap">
            {{ card().body }}
          </p>
        </div>
      }

      <!-- Botón eliminar (hover) -->
      <button
        (click)="deleteRequested.emit(card().id); $event.stopPropagation()"
        class="absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center
               justify-center text-ink-subtle opacity-0 hover:opacity-100
               hover:text-ink-danger hover:bg-black/20 transition-all card-delete">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586
                   5.207 2.793a1 1 0 0 0-1.414 1.414L6.586 7
                   l-2.793 2.793a1 1 0 1 0 1.414 1.414L8
                   8.414l2.793 2.793a1 1 0 0 0 1.414-1.414
                   L9.414 7l2.793-2.793z"/>
        </svg>
      </button>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    /* Mostrar el botón eliminar al hacer hover en la tarjeta */
    div:hover .card-delete { opacity: 1 !important; }
  `],
})
export class BoardCardComponent implements OnInit, OnDestroy {
  @ViewChild('cardEl', { static: true }) cardEl!: ElementRef<HTMLDivElement>;

  card = input.required<Card>();

  /** Emitido al terminar de arrastrar con la nueva posición */
  positionChanged = output<{ id: string; x: number; y: number }>();
  editRequested   = output<Card>();
  deleteRequested = output<string>();

  private interactable: ReturnType<typeof interact> | null = null;

  ngOnInit(): void {
    this.interactable = interact(this.cardEl.nativeElement)
      .draggable({
        listeners: {
          move: (event) => {
            const el = event.target as HTMLElement;
            const x = (parseFloat(el.style.left) || 0) + event.dx;
            const y = (parseFloat(el.style.top)  || 0) + event.dy;
            el.style.left = `${x}px`;
            el.style.top  = `${y}px`;
          },
          end: (event) => {
            const el = event.target as HTMLElement;
            this.positionChanged.emit({
              id: this.card().id,
              x: parseFloat(el.style.left) || 0,
              y: parseFloat(el.style.top)  || 0,
            });
          },
        },
        // No salir del canvas
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: 'parent',
            endOnly: true,
          }),
        ],
      });
  }

  ngOnDestroy(): void {
    this.interactable?.unset();
  }
}
```

---

## Parte 6: BoardCanvasComponent

### `src/app/features/boards/canvas/board-canvas.component.ts`

```typescript
import {
  Component, ElementRef, ViewChild,
  input, output,
} from '@angular/core';
import { BoardFile, Card } from '../../../core/models/board.model';
import { BoardCardComponent } from './board-card.component';

@Component({
  selector: 'app-board-canvas',
  standalone: true,
  imports: [BoardCardComponent],
  template: `
    <div
      class="relative w-full h-full overflow-auto bg-ink-bg"
      style="background-image: radial-gradient(var(--ink-border) 1px, transparent 1px);
             background-size: 24px 24px;"
      (contextmenu)="onCanvasRightClick($event)">

      <!-- Canvas interior (tamaño mínimo para scroll) -->
      <div
        #canvasEl
        class="relative"
        style="min-width: 3000px; min-height: 2000px;">

        @for (card of board().cards; track card.id) {
          <app-board-card
            [card]="card"
            (positionChanged)="onPositionChanged($event)"
            (editRequested)="editRequested.emit($event)"
            (deleteRequested)="deleteRequested.emit($event)"/>
        }
      </div>
    </div>

    <!-- Menú contextual de canvas -->
    @if (contextMenu()) {
      <div
        class="fixed z-50 rounded-lg border border-ink-border bg-ink-surface
               shadow-xl py-1 min-w-44"
        [style.left.px]="contextMenu()!.screenX"
        [style.top.px]="contextMenu()!.screenY">
        <button
          (click)="onAddCard()"
          class="w-full text-left px-4 py-2 text-sm text-ink-text
                 hover:bg-ink-border transition-colors">
          Nueva tarjeta aquí
        </button>
      </div>
    }
  `,
  host: {
    '(document:click)': 'contextMenu.set(null)',
    '(document:keydown.escape)': 'contextMenu.set(null)',
    class: 'flex flex-col flex-1 overflow-hidden',
  },
})
export class BoardCanvasComponent {
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLDivElement>;

  board = input.required<BoardFile>();

  positionChanged = output<{ id: string; x: number; y: number }>();
  cardAdded       = output<{ x: number; y: number }>();
  editRequested   = output<Card>();
  deleteRequested = output<string>();

  contextMenu = signal<{ screenX: number; screenY: number; canvasX: number; canvasY: number } | null>(null);

  onCanvasRightClick(event: MouseEvent): void {
    event.preventDefault();

    // Calcular posición relativa al canvas interior
    const rect    = this.canvasEl.nativeElement.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    this.contextMenu.set({
      screenX: event.clientX,
      screenY: event.clientY,
      canvasX,
      canvasY,
    });
  }

  onAddCard(): void {
    const pos = this.contextMenu();
    this.contextMenu.set(null);
    if (pos) {
      this.cardAdded.emit({ x: pos.canvasX, y: pos.canvasY });
    }
  }

  onPositionChanged(pos: { id: string; x: number; y: number }): void {
    this.positionChanged.emit(pos);
  }
}

// Añadir signal import al principio si falta
import { signal } from '@angular/core';
```

---

## Parte 7: BoardsLayoutComponent

### `src/app/features/boards/boards-layout.component.ts`

```typescript
import {
  Component, inject, signal, OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { ProjectService } from '../../core/services/project.service';
import { BoardService }   from '../../core/services/board.service';
import { ToastService }   from '../../shared/services/toast.service';
import { BoardFile, Card } from '../../core/models/board.model';
import { InkNavComponent }          from '../../shared/components/ink-nav.component';
import { BoardSelectorComponent }   from './board-selector/board-selector.component';
import { BoardCanvasComponent }     from './canvas/board-canvas.component';
import { NewBoardModalComponent }   from './modals/new-board-modal.component';
import { CardEditorModalComponent } from './modals/card-editor-modal.component';

@Component({
  selector: 'app-boards-layout',
  standalone: true,
  imports: [
    InkNavComponent,
    BoardSelectorComponent,
    BoardCanvasComponent,
    NewBoardModalComponent,
    CardEditorModalComponent,
  ],
  template: `
    <div class="flex h-screen bg-ink-bg overflow-hidden">

      <!-- Nav global -->
      <ink-nav />

      <!-- Selector de tableros -->
      <app-board-selector
        [boards]="boards()"
        [activeBoard]="activeBoard()"
        (boardSelected)="selectBoard($event)"
        (createRequested)="showNewBoardModal.set(true)"
        (deleteRequested)="deleteBoard($event)"/>

      <!-- Canvas principal -->
      <div class="flex flex-col flex-1 overflow-hidden">

        <!-- Top bar de boards -->
        <header class="flex items-center h-11 px-4 border-b border-ink-border
                       bg-ink-panel shrink-0 gap-3">
          @if (activeBoard()) {
            <h2 class="text-ink-text text-sm font-medium">
              {{ activeBoard()!.title }}
            </h2>
            <span class="text-ink-subtle text-xs">
              · {{ activeBoard()!.cards.length }} tarjetas
            </span>
          } @else {
            <span class="text-ink-subtle text-sm italic">
              Selecciona o crea un tablero
            </span>
          }
        </header>

        <!-- Canvas o estado vacío -->
        @if (activeBoard()) {
          <app-board-canvas
            [board]="activeBoard()!"
            (positionChanged)="onPositionChanged($event)"
            (cardAdded)="onCardAdded($event)"
            (editRequested)="editingCard.set($event)"
            (deleteRequested)="onDeleteCard($event)"/>
        } @else {
          <div class="flex flex-col items-center justify-center flex-1 gap-4 opacity-40">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5" class="text-ink-subtle">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            <p class="text-ink-subtle text-sm">
              Selecciona un tablero o crea uno nuevo
            </p>
          </div>
        }
      </div>
    </div>

    <!-- Modal nuevo tablero -->
    @if (showNewBoardModal()) {
      <app-new-board-modal
        (created)="onBoardCreated($event)"
        (cancelled)="showNewBoardModal.set(false)"/>
    }

    <!-- Modal editar tarjeta -->
    @if (editingCard()) {
      <app-card-editor-modal
        [card]="editingCard()!"
        (saved)="onCardSaved($event)"
        (cancelled)="editingCard.set(null)"/>
    }
  `,
})
export class BoardsLayoutComponent implements OnInit {
  private projectService = inject(ProjectService);
  private boardService   = inject(BoardService);
  private toast          = inject(ToastService);
  private router         = inject(Router);

  boards          = signal<BoardFile[]>([]);
  activeBoard     = signal<BoardFile | null>(null);
  showNewBoardModal = signal(false);
  editingCard     = signal<Card | null>(null);

  async ngOnInit(): Promise<void> {
    if (!this.projectService.isLoaded()) {
      this.router.navigate(['/']);
      return;
    }
    await this.loadBoards();
  }

  // ─── Carga ────────────────────────────────────────────────────────────────

  private async loadBoards(): Promise<void> {
    try {
      const ids    = await this.boardService.listBoardIds();
      const loaded = await Promise.all(ids.map(id => this.boardService.loadBoard(id)));
      this.boards.set(loaded);
    } catch (e) {
      this.toast.error(`Error cargando tableros: ${e}`);
    }
  }

  // ─── Tableros ─────────────────────────────────────────────────────────────

  selectBoard(board: BoardFile): void {
    this.activeBoard.set(board);
  }

  async onBoardCreated(board: BoardFile): Promise<void> {
    this.boards.update(bs => [...bs, board]);
    this.activeBoard.set(board);
    this.showNewBoardModal.set(false);
  }

  async deleteBoard(id: string): Promise<void> {
    try {
      await this.boardService.deleteBoard(id);
      this.boards.update(bs => bs.filter(b => b.id !== id));
      if (this.activeBoard()?.id === id) this.activeBoard.set(null);
    } catch (e) {
      this.toast.error(`Error al eliminar el tablero: ${e}`);
    }
  }

  // ─── Tarjetas ─────────────────────────────────────────────────────────────

  async onCardAdded(position: { x: number; y: number }): Promise<void> {
    const board = this.activeBoard();
    if (!board) return;

    const updated = this.boardService.addCard(board, position);
    await this.persistBoard(updated);
  }

  async onCardSaved(card: Card): Promise<void> {
    const board = this.activeBoard();
    if (!board) return;

    const updated = this.boardService.updateCard(board, card);
    await this.persistBoard(updated);
    this.editingCard.set(null);
  }

  async onDeleteCard(cardId: string): Promise<void> {
    const board = this.activeBoard();
    if (!board) return;

    const updated = this.boardService.deleteCard(board, cardId);
    await this.persistBoard(updated);
  }

  async onPositionChanged(pos: { id: string; x: number; y: number }): Promise<void> {
    const board = this.activeBoard();
    if (!board) return;

    const card    = board.cards.find(c => c.id === pos.id);
    if (!card) return;

    const updated = this.boardService.updateCard(board, { ...card, x: pos.x, y: pos.y });
    await this.persistBoard(updated);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async persistBoard(board: BoardFile): Promise<void> {
    try {
      const saved = await this.boardService.saveBoard(board);
      this.activeBoard.set(saved);
      this.boards.update(bs => bs.map(b => b.id === saved.id ? saved : b));
    } catch (e) {
      this.toast.error(`Error al guardar el tablero: ${e}`);
    }
  }
}
```

---

## Criterios de aceptación

**Navegación:**
- [ ] `InkNavComponent` aparece en la vista de editor y en la de boards
- [ ] Los iconos editor/boards resaltan según la ruta activa
- [ ] `Alt+1` navega a `/editor`, `Alt+2` navega a `/boards` *(añadir HostListener en AppComponent)*
- [ ] Navegar a `/boards` sin proyecto abierto redirige a `/`

**Tableros:**
- [ ] La lista de tableros del proyecto se carga al entrar en la vista
- [ ] "Nuevo tablero" abre el modal; al crear, aparece en la lista y queda activo
- [ ] Seleccionar un tablero carga su canvas
- [ ] Eliminar un tablero lo borra de disco y de la lista
- [ ] Si el tablero activo es eliminado, el canvas queda vacío

**Canvas y tarjetas:**
- [ ] El canvas tiene fondo punteado y scroll horizontal + vertical
- [ ] Click derecho en el canvas muestra menú contextual "Nueva tarjeta aquí"
- [ ] La nueva tarjeta aparece en la posición del click con color rotativo
- [ ] Las tarjetas son arrastrables; al soltar, la posición se guarda en disco
- [ ] Las tarjetas no se pueden arrastrar fuera del canvas
- [ ] Doble click en una tarjeta abre `CardEditorModalComponent`
- [ ] Al guardar en el modal, título, cuerpo y color se actualizan
- [ ] El botón × (aparece en hover) elimina la tarjeta

**Persistencia:**
- [ ] Todas las operaciones (crear, mover, editar, eliminar) persisten en `boards/{id}.json`
- [ ] Recargar la app y abrir el mismo tablero muestra el estado guardado

---

## Lo que NO hacer en esta spec

- No añadir resize de tarjetas (INK-09 si se decide incluir)
- No implementar búsqueda o filtrado de tarjetas
- No añadir atajos de teclado en el canvas más allá de lo especificado
- No implementar drag & drop para reordenar la lista de tableros
