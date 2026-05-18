# INK-21 — Timeline visual narrativo

## Objetivo

Implementar una cuarta vista en Inkwell que representa los capítulos del proyecto en un eje de tiempo de la historia. Las swimlanes muestran la presencia de personajes (datos de INK-14) y tracks personalizados definidos por el usuario (subtramas, localizaciones, etc.). La vista es de solo lectura — sirve para que el escritor entienda la estructura temporal de su obra de un vistazo.

---

## Decisiones de diseño

- **Eje X**: tiempo de la historia (`storyDate` por capítulo). Sin fecha asignada, el capítulo aparece en zona "Sin fecha" respetando el orden del binder.
- **Filas**: una fila "Historia" con todos los capítulos + filas automáticas por personaje (INK-14) + filas personalizadas creadas por el usuario.
- **Interactividad**: solo lectura. Click en un bloque navega al editor. No se puede reordenar ni editar desde esta vista.
- **Tecnología**: D3.js para eje temporal, zoom y posicionamiento. SVG embebido en Angular.
- **Ubicación**: cuarta pantalla en la nav (`/timeline`), icono entre Narrativa y el separador inferior.

---

## Modelo de datos — modificaciones

### `project.model.ts` — añadir `storyDate` a `TreeNode` y `timeline` a `Project`

```typescript
export interface TreeNode {
  id:         string;
  title:      string;
  type:       'folder' | 'document';
  children:   TreeNode[];
  status?:    DocumentStatus;
  storyDate?: string;   // NUEVO — fecha de historia. Formato libre, se ordena lexicográficamente.
                        // Recomendado: YYYY-MM-DD para fechas reales, o "Año 1247-Mes 3-Día 15"
                        // para mundos ficticios. Sin fecha → aparece en zona "Sin fecha".
}

export interface Project {
  // ...campos existentes...
  timeline: TimelineConfig;  // NUEVO
}

export interface TimelineConfig {
  tracks:        TimelineTrack[];
  zoomLevel?:    number;   // persiste el zoom entre sesiones
  scrollOffset?: number;   // persiste la posición del scroll
}

export interface TimelineTrack {
  id:     string;
  title:  string;
  color:  string;
  events: TimelineEvent[];
}

export interface TimelineEvent {
  id:         string;
  label:      string;
  startDate:  string;    // misma convención que storyDate
  endDate?:   string;    // si es un evento con duración
  color?:     string;    // override del color del track
  notes?:     string;
}
```

Inicializar en `createProject()`:
```typescript
timeline: { tracks: [], zoomLevel: 1, scrollOffset: 0 }
```

En `openProject()`, si no existe `timeline`, inicializarlo como `{ tracks: [], zoomLevel: 1, scrollOffset: 0 }`.

---

## Asignar `storyDate` desde la modal de sinopsis (INK-11)

### Modificar `SynopsisModalComponent`

Añadir el campo `storyDate` debajo del textarea de sinopsis:

```typescript
storyDateInput = '';

ngOnInit(): void {
  this.synopsisText  = this.document().synopsis ?? '';
  this.storyDateInput = this.node().storyDate ?? '';  // node es el TreeNode
}
```

El input del nodo (`node`) se añade como segundo input requerido al modal:
```typescript
node = input.required<TreeNode>();
```

En el template, tras el textarea de sinopsis:

```html
<div class="flex flex-col gap-1.5 pt-3 border-t border-ink-border">
  <label class="field-label">
    Fecha en la historia
    <span class="normal-case font-normal">(opcional)</span>
  </label>
  <input
    [(ngModel)]="storyDateInput"
    placeholder="p.ej. 1247-03-15 o 'Día 42 de la expedición'"
    class="field-input text-sm"/>
  <p class="text-ink-muted text-xs leading-relaxed">
    Usada en el timeline visual. Formato libre — si usas YYYY-MM-DD
    se ordenará cronológicamente. Sin fecha, el capítulo aparece
    en el orden del binder.
  </p>
</div>
```

Al guardar, actualizar también el `storyDate` en el árbol:

```typescript
async save(): Promise<void> {
  // ...guardar sinopsis en DocumentFile como antes...

  // Actualizar storyDate en el árbol del proyecto
  await this.projectService.updateNodeStoryDate(
    this.node().id,
    this.storyDateInput.trim() || undefined,
  );
}
```

### Nuevo método en `ProjectService`

```typescript
async updateNodeStoryDate(id: string, storyDate: string | undefined): Promise<void> {
  this.project.update(p =>
    p ? { ...p, tree: setNodeStoryDate(p.tree, id, storyDate) } : p
  );
  await this.saveProjectOnly();
}
```

Función pura:
```typescript
function setNodeStoryDate(
  tree: TreeNode[],
  id: string,
  storyDate: string | undefined,
): TreeNode[] {
  return tree.map(n => {
    if (n.id === id) return { ...n, storyDate };
    return { ...n, children: setNodeStoryDate(n.children, id, storyDate) };
  });
}
```

---

## TimelineService

### `src/app/core/services/timeline.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { ProjectService }   from './project.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { BoardFile }        from '../models/board.model';
import { TreeNode, TimelineTrack, TimelineConfig } from '../models/project.model';
import { boardPath, boardsFolderPath } from '../../shared/utils/project-paths';

export interface TimelineRow {
  id:       string;
  type:     'story' | 'character' | 'custom';
  title:    string;
  color:    string;
  blocks:   TimelineBlock[];
}

export interface TimelineBlock {
  id:            string;
  label:         string;
  startDate:     string;
  endDate?:      string;
  color:         string;
  documentId?:   string;   // si viene de un capítulo
  trackEventId?: string;   // si viene de un evento custom
  isSortOrder:   boolean;  // true si no tiene fecha (usa posición de binder)
  sortIndex:     number;   // posición en el binder (para zona "Sin fecha")
}

export interface TimelineData {
  rows:              TimelineRow[];
  allDates:          string[];     // fechas únicas ordenadas (para escalar el eje X)
  hasDatedItems:     boolean;
  hasUndatedItems:   boolean;
}

@Injectable({ providedIn: 'root' })
export class TimelineService {
  private project = inject(ProjectService);
  private bridge  = inject(TauriBridgeService);

  async loadTimelineData(): Promise<TimelineData> {
    const proj     = this.project.project();
    const basePath = this.project.basePath();
    if (!proj || !basePath) return this.empty();

    // 1. Aplanar el árbol de documentos con su posición de binder
    const flatDocs = this.flattenWithIndex(proj.tree, 0).docs;

    // 2. Construir la fila principal "Historia"
    const storyRow = this.buildStoryRow(flatDocs);

    // 3. Cargar personajes de todos los tableros
    const characterRows = await this.buildCharacterRows(basePath, flatDocs);

    // 4. Construir filas de tracks personalizados
    const customRows = this.buildCustomRows(proj.timeline?.tracks ?? []);

    const allRows = [storyRow, ...characterRows, ...customRows];

    // 5. Recopilar todas las fechas para escalar el eje X
    const allDates = this.collectDates(allRows);

    return {
      rows:            allRows,
      allDates,
      hasDatedItems:   allRows.some(r => r.blocks.some(b => !b.isSortOrder)),
      hasUndatedItems: allRows.some(r => r.blocks.some(b => b.isSortOrder)),
    };
  }

  // ─── Constructores de filas ───────────────────────────────────────────────

  private buildStoryRow(
    flatDocs: Array<{ node: TreeNode; index: number }>,
  ): TimelineRow {
    const blocks: TimelineBlock[] = flatDocs.map(({ node, index }) => ({
      id:          `story-${node.id}`,
      label:       node.title,
      startDate:   node.storyDate ?? '',
      color:       'var(--ink-accent)',
      documentId:  node.id,
      isSortOrder: !node.storyDate,
      sortIndex:   index,
    }));

    return { id: 'story', type: 'story', title: 'Historia', color: 'var(--ink-accent)', blocks };
  }

  private async buildCharacterRows(
    basePath: string,
    flatDocs: Array<{ node: TreeNode; index: number }>,
  ): Promise<TimelineRow[]> {
    // Mapa: documentId → { storyDate, sortIndex }
    const docInfo = new Map(
      flatDocs.map(({ node, index }) => [node.id, { storyDate: node.storyDate, index }])
    );

    try {
      const boardIds = await this.bridge.listJsonFiles(boardsFolderPath(basePath));
      const boards   = await Promise.all(
        boardIds.map(async id => {
          const raw = await this.bridge.readJsonFile(boardPath(basePath, id));
          return JSON.parse(raw) as BoardFile;
        })
      );

      const rows: TimelineRow[] = [];

      for (const board of boards) {
        for (const card of board.cards) {
          if (card.type !== 'character' || !card.characterData) continue;
          if (card.characterData.appearsInChapters.length === 0) continue;

          const blocks: TimelineBlock[] = card.characterData.appearsInChapters
            .map(docId => {
              const info = docInfo.get(docId);
              if (!info) return null;
              const flatDoc = flatDocs.find(d => d.node.id === docId);
              return {
                id:          `char-${card.id}-${docId}`,
                label:       flatDoc?.node.title ?? docId,
                startDate:   info.storyDate ?? '',
                color:       card.color,
                documentId:  docId,
                isSortOrder: !info.storyDate,
                sortIndex:   info.index,
              } as TimelineBlock;
            })
            .filter((b): b is TimelineBlock => b !== null)
            .sort((a, b) =>
              a.isSortOrder && b.isSortOrder
                ? a.sortIndex - b.sortIndex
                : a.startDate.localeCompare(b.startDate)
            );

          rows.push({
            id:     `char-${card.id}`,
            type:   'character',
            title:  card.title,
            color:  card.color,
            blocks,
          });
        }
      }

      return rows;
    } catch { return []; }
  }

  private buildCustomRows(tracks: TimelineTrack[]): TimelineRow[] {
    return tracks.map(track => ({
      id:    `track-${track.id}`,
      type:  'custom' as const,
      title: track.title,
      color: track.color,
      blocks: track.events.map(ev => ({
        id:            `ev-${ev.id}`,
        label:         ev.label,
        startDate:     ev.startDate,
        endDate:       ev.endDate,
        color:         ev.color ?? track.color,
        trackEventId:  ev.id,
        isSortOrder:   false,
        sortIndex:     0,
      })),
    }));
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────

  private flattenWithIndex(
    nodes: TreeNode[],
    startIndex: number,
  ): { docs: Array<{ node: TreeNode; index: number }>; nextIndex: number } {
    const docs: Array<{ node: TreeNode; index: number }> = [];
    let index = startIndex;

    for (const n of nodes) {
      if (n.type === 'folder') {
        const result = this.flattenWithIndex(n.children, index);
        docs.push(...result.docs);
        index = result.nextIndex;
      } else {
        docs.push({ node: n, index });
        index++;
      }
    }

    return { docs, nextIndex: index };
  }

  private collectDates(rows: TimelineRow[]): string[] {
    const dates = new Set<string>();
    for (const row of rows) {
      for (const block of row.blocks) {
        if (!block.isSortOrder && block.startDate) dates.add(block.startDate);
        if (block.endDate) dates.add(block.endDate);
      }
    }
    return Array.from(dates).sort();
  }

  private empty(): TimelineData {
    return { rows: [], allDates: [], hasDatedItems: false, hasUndatedItems: false };
  }

  // ─── CRUD de tracks personalizados ────────────────────────────────────────

  async addTrack(title: string, color: string): Promise<void> {
    const track: TimelineTrack = {
      id: crypto.randomUUID(), title, color, events: [],
    };
    this.project.update(p => p ? {
      ...p,
      timeline: { ...p.timeline, tracks: [...(p.timeline?.tracks ?? []), track] },
    } : p);
    await this.projectService_saveOnly();
  }

  async addEvent(
    trackId: string,
    event: Omit<import('../models/project.model').TimelineEvent, 'id'>,
  ): Promise<void> {
    const newEvent = { ...event, id: crypto.randomUUID() };
    this.project.update(p => {
      if (!p) return p;
      return {
        ...p,
        timeline: {
          ...p.timeline,
          tracks: p.timeline.tracks.map(t =>
            t.id === trackId ? { ...t, events: [...t.events, newEvent] } : t
          ),
        },
      };
    });
    await this.projectService_saveOnly();
  }

  async deleteTrack(trackId: string): Promise<void> {
    this.project.update(p => p ? {
      ...p,
      timeline: {
        ...p.timeline,
        tracks: p.timeline.tracks.filter(t => t.id !== trackId),
      },
    } : p);
    await this.projectService_saveOnly();
  }

  private get projectService_saveOnly() {
    return (this.project as any).saveProjectOnly.bind(this.project);
  }
}
```

> **Nota**: El método `saveProjectOnly` de `ProjectService` se hace `public` en esta spec (era `private` anteriormente).

---

## TimelineLayoutComponent

### `src/app/features/timeline/timeline-layout.component.ts`

```typescript
import {
  Component, inject, signal, OnInit,
  ElementRef, ViewChild, AfterViewInit, OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as d3 from 'd3';
import { ProjectService }   from '../../core/services/project.service';
import { TimelineService, TimelineData, TimelineRow, TimelineBlock }
  from '../../core/services/timeline.service';
import { InkNavComponent }  from '../../shared/components/ink-nav.component';
import { InkButtonComponent } from '../../shared/components/ink-button.component';
import { ToastService }     from '../../shared/services/toast.service';

// Dimensiones del layout
const ROW_HEIGHT   = 52;
const ROW_GAP      = 4;
const LABEL_WIDTH  = 160;
const BLOCK_HEIGHT = 36;
const BLOCK_RADIUS = 4;
const MIN_BLOCK_W  = 80;
const UNDATED_COL_W = 100;   // ancho de cada columna en la zona "Sin fecha"
const PADDING_X    = 24;

@Component({
  selector: 'app-timeline-layout',
  standalone: true,
  imports: [FormsModule, InkNavComponent, InkButtonComponent],
  template: `
    <div class="flex h-screen bg-ink-bg overflow-hidden">

      <ink-nav />

      <div class="flex flex-col flex-1 overflow-hidden">

        <!-- Top bar -->
        <header class="flex items-center justify-between h-11 px-5
                        border-b border-ink-border bg-ink-panel shrink-0 gap-3">
          <h2 class="text-ink-text text-sm font-medium">
            Timeline
            @if (projectService.project(); as p) {
              <span class="text-ink-subtle font-normal"> — {{ p.name }}</span>
            }
          </h2>

          <div class="flex items-center gap-2">

            <!-- Zoom -->
            <div class="flex items-center gap-1">
              <button (click)="zoom(-0.2)"
                class="p-1.5 rounded text-ink-subtle hover:text-ink-text
                       hover:bg-ink-border transition-colors text-sm">−</button>
              <span class="text-ink-subtle text-xs w-10 text-center">
                {{ (zoomLevel() * 100).toFixed(0) }}%
              </span>
              <button (click)="zoom(0.2)"
                class="p-1.5 rounded text-ink-subtle hover:text-ink-text
                       hover:bg-ink-border transition-colors text-sm">+</button>
            </div>

            <!-- Añadir track personalizado -->
            <ink-button variant="secondary" (clicked)="showAddTrack.set(true)">
              + Track
            </ink-button>

            <!-- Recargar -->
            <button (click)="reload()"
              title="Recargar datos"
              class="p-1.5 rounded text-ink-subtle hover:text-ink-text
                     hover:bg-ink-border transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9
                         0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
        </header>

        <!-- Área del timeline -->
        <div class="flex flex-1 overflow-hidden">

          <!-- Columna de etiquetas de fila (fija) -->
          <div
            class="shrink-0 border-r border-ink-border bg-ink-panel flex flex-col pt-10"
            [style.width.px]="LABEL_WIDTH">
            @if (!loading()) {
              @for (row of data()?.rows ?? []; track row.id) {
                <div
                  class="flex items-center gap-2 px-3 shrink-0"
                  [style.height.px]="ROW_HEIGHT + ROW_GAP">
                  <!-- Color dot -->
                  <span
                    class="w-2 h-2 rounded-full shrink-0"
                    [style.background]="row.color">
                  </span>
                  <!-- Título de la fila -->
                  <span
                    class="text-ink-subtle text-xs truncate flex-1"
                    [title]="row.title">
                    {{ row.type === 'story' ? '📖 Historia' : row.title }}
                  </span>
                  <!-- Botón eliminar para tracks custom -->
                  @if (row.type === 'custom') {
                    <button
                      (click)="deleteTrack(row.id)"
                      class="shrink-0 p-0.5 rounded text-ink-muted hover:text-ink-danger
                             transition-colors opacity-0 hover:opacity-100">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586
                                 5.207 2.793a1 1 0 0 0-1.414 1.414L6.586 7
                                 l-2.793 2.793a1 1 0 1 0 1.414 1.414L8 8.414
                                 l2.793 2.793a1 1 0 0 0 1.414-1.414L9.414 7
                                 l2.793-2.793z"/>
                      </svg>
                    </button>
                  }
                </div>
              }
            }
          </div>

          <!-- SVG del timeline (scrollable) -->
          <div class="flex-1 overflow-auto" #scrollContainer>
            @if (loading()) {
              <div class="flex items-center justify-center h-full gap-3 opacity-50">
                <span class="inline-block w-5 h-5 border-2 border-ink-accent
                             border-t-transparent rounded-full animate-spin"></span>
                <span class="text-ink-subtle text-sm">Cargando timeline...</span>
              </div>
            } @else if ((data()?.rows ?? []).length === 0) {
              <div class="flex flex-col items-center justify-center h-full gap-4 opacity-40">
                <p class="text-ink-subtle text-sm text-center px-8 leading-relaxed">
                  Añade fechas de historia a tus capítulos desde la sinopsis
                  de cada documento para verlos aquí.
                </p>
              </div>
            } @else {
              <svg #timelineSvg class="block"></svg>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Tooltip -->
    @if (tooltip()) {
      <div
        class="fixed z-50 px-3 py-2 rounded-lg bg-ink-surface border border-ink-border
               shadow-xl text-xs text-ink-text pointer-events-none"
        [style.left.px]="tooltip()!.x + 12"
        [style.top.px]="tooltip()!.y - 8">
        <p class="font-medium">{{ tooltip()!.label }}</p>
        @if (tooltip()!.date) {
          <p class="text-ink-subtle mt-0.5">{{ tooltip()!.date }}</p>
        }
        @if (tooltip()!.hint) {
          <p class="text-ink-muted mt-0.5 italic">{{ tooltip()!.hint }}</p>
        }
      </div>
    }

    <!-- Modal añadir track -->
    @if (showAddTrack()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-panel/70">
        <div class="w-80 rounded-lg border border-ink-border bg-ink-surface shadow-xl p-5
                    flex flex-col gap-4">
          <h3 class="text-ink-text text-sm font-medium">Nuevo track</h3>
          <div class="flex flex-col gap-1.5">
            <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
              Nombre
            </label>
            <input [(ngModel)]="newTrackTitle" placeholder="Subtrama A"
                   class="px-3 py-2 rounded bg-ink-bg border border-ink-border
                          text-ink-text text-sm focus:outline-none
                          focus:border-ink-accent transition-colors"/>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
              Color
            </label>
            <div class="flex gap-2">
              @for (c of trackColors; track c) {
                <button (click)="newTrackColor = c"
                  class="w-7 h-7 rounded-full border-2 transition-all"
                  [style.background]="c"
                  [class]="newTrackColor === c ? 'border-ink-accent scale-110' : 'border-transparent'">
                </button>
              }
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-1">
            <button (click)="showAddTrack.set(false)"
              class="text-ink-subtle text-sm hover:text-ink-text transition-colors">
              Cancelar
            </button>
            <button (click)="addTrack()"
              [disabled]="!newTrackTitle.trim()"
              class="px-4 py-1.5 rounded bg-ink-accent text-ink-panel text-sm
                     font-medium hover:opacity-90 transition-opacity
                     disabled:opacity-40 disabled:cursor-not-allowed">
              Crear
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TimelineLayoutComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('timelineSvg')   svgEl!: ElementRef<SVGSVGElement>;
  @ViewChild('scrollContainer') scrollEl!: ElementRef<HTMLDivElement>;

  projectService   = inject(ProjectService);
  private timeline = inject(TimelineService);
  private router   = inject(Router);
  private toast    = inject(ToastService);

  loading       = signal(true);
  data          = signal<TimelineData | null>(null);
  zoomLevel     = signal(1);
  tooltip       = signal<{ x: number; y: number; label: string; date?: string; hint?: string } | null>(null);
  showAddTrack  = signal(false);
  newTrackTitle = '';
  newTrackColor = '#cba6f7';

  readonly LABEL_WIDTH = LABEL_WIDTH;
  readonly ROW_HEIGHT  = ROW_HEIGHT;
  readonly ROW_GAP     = ROW_GAP;

  readonly trackColors = [
    '#cba6f7', '#89b4fa', '#a6e3a1',
    '#f9e2af', '#f38ba8', '#94e2d5',
  ];

  private resizeObserver?: ResizeObserver;

  async ngOnInit(): Promise<void> {
    if (!this.projectService.isLoaded()) {
      this.router.navigate(['/']);
      return;
    }
    await this.reload();
  }

  ngAfterViewInit(): void {
    if (this.scrollEl) {
      this.resizeObserver = new ResizeObserver(() => this.renderTimeline());
      this.resizeObserver.observe(this.scrollEl.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  // ─── Carga y render ───────────────────────────────────────────────────────

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const d = await this.timeline.loadTimelineData();
      this.data.set(d);
      // Dar un tick para que el SVG exista en el DOM
      setTimeout(() => this.renderTimeline(), 50);
    } finally {
      this.loading.set(false);
    }
  }

  private renderTimeline(): void {
    const d = this.data();
    if (!d || !this.svgEl || d.rows.length === 0) return;

    const svg         = d3.select(this.svgEl.nativeElement);
    const containerW  = this.scrollEl.nativeElement.clientWidth;
    const totalH      = d.rows.length * (ROW_HEIGHT + ROW_GAP) + 40; // +40 para eje X

    svg.selectAll('*').remove();

    // ─── Layout ─────────────────────────────────────────────────────────────

    // Zona de fechas: escalar entre minDate y maxDate
    const datedBlocks = d.rows.flatMap(r => r.blocks.filter(b => !b.isSortOrder));
    const undatedBlocks = d.rows.flatMap(r => r.blocks.filter(b => b.isSortOrder));

    const dates    = d.allDates;
    const hasDated = dates.length > 0;

    // Ancho de la zona de fechas
    const datedZoneW = hasDated
      ? Math.max(containerW * 0.7, dates.length * 120) * this.zoomLevel()
      : 0;

    // Ancho de la zona "sin fecha"
    const maxUndated  = Math.max(...d.rows.map(r => r.blocks.filter(b => b.isSortOrder).length), 0);
    const undatedZoneW = maxUndated > 0
      ? maxUndated * UNDATED_COL_W * this.zoomLevel() + PADDING_X
      : 0;

    const totalW = Math.max(containerW, datedZoneW + undatedZoneW + PADDING_X * 2);

    svg.attr('width', totalW).attr('height', totalH);

    // ─── Escala X para zona con fechas ──────────────────────────────────────

    const xScaleDated = hasDated
      ? d3.scalePoint<string>()
          .domain(dates)
          .range([PADDING_X, datedZoneW])
          .padding(0.5)
      : null;

    // ─── Eje X (fechas) ─────────────────────────────────────────────────────

    if (xScaleDated) {
      const xAxis = d3.axisBottom(xScaleDated)
        .tickFormat(d => d.length > 12 ? d.slice(0, 12) + '…' : d);

      svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0, ${totalH - 24})`)
        .call(xAxis)
        .call(g => {
          g.select('.domain').attr('stroke', 'var(--ink-border)');
          g.selectAll('.tick line').attr('stroke', 'var(--ink-border)');
          g.selectAll('.tick text')
            .attr('fill', 'var(--ink-subtle)')
            .attr('font-size', '10px')
            .attr('font-family', 'Inter, system-ui, sans-serif');
        });
    }

    // Separador vertical zona fechas / sin fecha
    if (hasDated && undatedZoneW > 0) {
      svg.append('line')
        .attr('x1', datedZoneW + PADDING_X)
        .attr('x2', datedZoneW + PADDING_X)
        .attr('y1', 0)
        .attr('y2', totalH - 24)
        .attr('stroke', 'var(--ink-border)')
        .attr('stroke-dasharray', '4,4');

      svg.append('text')
        .attr('x', datedZoneW + PADDING_X + 8)
        .attr('y', 14)
        .attr('fill', 'var(--ink-muted)')
        .attr('font-size', '10px')
        .attr('font-family', 'Inter, system-ui, sans-serif')
        .text('Sin fecha (orden del binder)');
    }

    // ─── Filas y bloques ─────────────────────────────────────────────────────

    d.rows.forEach((row, rowIdx) => {
      const rowY = rowIdx * (ROW_HEIGHT + ROW_GAP) + 8;

      // Fondo de fila (zebra)
      if (rowIdx % 2 === 0) {
        svg.append('rect')
          .attr('x', 0).attr('y', rowY)
          .attr('width', totalW).attr('height', ROW_HEIGHT)
          .attr('fill', 'var(--ink-surface)').attr('opacity', 0.3);
      }

      // Bloques de la fila
      row.blocks.forEach(block => {
        let blockX: number;

        if (block.isSortOrder) {
          // Zona sin fecha: columnas por posición del binder
          const undatedInRow = row.blocks
            .filter(b => b.isSortOrder)
            .sort((a, b) => a.sortIndex - b.sortIndex);
          const colIdx = undatedInRow.findIndex(b => b.id === block.id);
          blockX = datedZoneW + PADDING_X + colIdx * UNDATED_COL_W * this.zoomLevel() + 8;
        } else {
          blockX = xScaleDated!(block.startDate) - MIN_BLOCK_W / 2;
        }

        const blockW = MIN_BLOCK_W * this.zoomLevel();
        const blockY = rowY + (ROW_HEIGHT - BLOCK_HEIGHT) / 2;

        // Rectángulo del bloque
        const rect = svg.append('rect')
          .attr('x', blockX).attr('y', blockY)
          .attr('width', blockW).attr('height', BLOCK_HEIGHT)
          .attr('rx', BLOCK_RADIUS)
          .attr('fill', block.color)
          .attr('opacity', 0.85)
          .style('cursor', block.documentId ? 'pointer' : 'default');

        // Texto del bloque
        svg.append('text')
          .attr('x', blockX + 8)
          .attr('y', blockY + BLOCK_HEIGHT / 2 + 4)
          .attr('fill', 'var(--ink-panel)')
          .attr('font-size', '11px')
          .attr('font-weight', '500')
          .attr('font-family', 'Inter, system-ui, sans-serif')
          .style('pointer-events', 'none')
          .text(this.truncate(block.label, Math.floor(blockW / 7)));

        // Eventos de interacción
        rect
          .on('mouseenter', (event: MouseEvent) => {
            this.tooltip.set({
              x: event.clientX,
              y: event.clientY,
              label:  block.label,
              date:   block.isSortOrder ? undefined : block.startDate,
              hint:   block.documentId ? 'Click para abrir en el editor' : undefined,
            });
            d3.select(event.target as SVGRectElement).attr('opacity', 1);
          })
          .on('mousemove', (event: MouseEvent) => {
            this.tooltip.update(t => t ? { ...t, x: event.clientX, y: event.clientY } : t);
          })
          .on('mouseleave', (event: MouseEvent) => {
            this.tooltip.set(null);
            d3.select(event.target as SVGRectElement).attr('opacity', 0.85);
          })
          .on('click', () => {
            if (block.documentId) {
              this.router.navigate(['/editor'], { queryParams: { doc: block.documentId } });
            }
          });
      });
    });
  }

  // ─── Acciones ─────────────────────────────────────────────────────────────

  zoom(delta: number): void {
    const newZoom = Math.min(3, Math.max(0.4, this.zoomLevel() + delta));
    this.zoomLevel.set(newZoom);
    this.renderTimeline();
  }

  async addTrack(): Promise<void> {
    if (!this.newTrackTitle.trim()) return;
    await this.timeline.addTrack(this.newTrackTitle.trim(), this.newTrackColor);
    this.showAddTrack.set(false);
    this.newTrackTitle = '';
    await this.reload();
  }

  async deleteTrack(rowId: string): Promise<void> {
    const trackId = rowId.replace('track-', '');
    await this.timeline.deleteTrack(trackId);
    await this.reload();
    this.toast.success('Track eliminado.');
  }

  // ─── Utils ────────────────────────────────────────────────────────────────

  private truncate(text: string, maxChars: number): string {
    if (maxChars < 4) return '…';
    return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
  }
}
```

---

## Actualizar rutas y nav

### `app.routes.ts`

```typescript
{
  path: 'timeline',
  loadComponent: () =>
    import('./features/timeline/timeline-layout.component')
      .then(m => m.TimelineLayoutComponent),
},
```

### `InkNavComponent` — cuarto icono

```html
<!-- Tras el icono de Vista narrativa -->
<a
  routerLink="/timeline"
  title="Timeline (Alt+4)"
  class="nav-icon"
  [class.active]="isRoute('/timeline')">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <circle cx="8"  cy="6" r="2" fill="currentColor" stroke="none"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
    <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
  </svg>
</a>
```

### `AppComponent` — atajo `Alt+4`

```typescript
if (event.altKey && event.key === '4') {
  event.preventDefault();
  this.router.navigate(['/timeline']);
}
```

### `ShortcutsModalComponent` — añadir atajo

```typescript
{ keys: ['Alt', '4'], description: 'Ir al timeline' },
```

---

## Criterios de aceptación

**Navegación:**
- [ ] El icono de timeline aparece en la nav tras el de vista narrativa
- [ ] `Alt+4` navega a `/timeline`
- [ ] Sin proyecto abierto, redirige a `/`

**Asignar fecha de historia:**
- [ ] La modal de sinopsis (INK-11) tiene un campo "Fecha en la historia"
- [ ] Guardar la fecha persiste en `project.json` en el `TreeNode` correspondiente
- [ ] Borrar la fecha (campo vacío) elimina `storyDate` del nodo
- [ ] El campo tiene un texto de ayuda explicando el formato recomendado

**Render del timeline:**
- [ ] Los capítulos con `storyDate` aparecen posicionados en el eje X según su fecha
- [ ] Las fechas en el eje X están ordenadas cronológicamente (lexicográfico)
- [ ] Los capítulos sin `storyDate` aparecen en la zona "Sin fecha" al final, en orden del binder
- [ ] La separación visual entre zona con fechas y zona sin fechas es clara
- [ ] La fila "Historia" muestra todos los capítulos del proyecto
- [ ] Las filas de personajes se generan automáticamente desde los datos de INK-14
- [ ] Solo aparecen personajes que tienen al menos un capítulo asignado
- [ ] Proyectos sin datos de personaje muestran solo la fila "Historia"

**Interacción:**
- [ ] Hover sobre un bloque muestra tooltip con título, fecha y hint "Click para abrir"
- [ ] Click en un bloque navega a `/editor?doc={id}` y abre el documento
- [ ] Los botones +/− de zoom reescalan el timeline horizontalmente
- [ ] El timeline tiene scroll horizontal cuando el contenido supera el ancho disponible

**Tracks personalizados:**
- [ ] El botón "+ Track" abre el modal de creación
- [ ] El track creado aparece como nueva fila en el timeline
- [ ] Los tracks personalizados persisten en `project.json`
- [ ] El botón × (hover en la etiqueta) elimina el track y sus eventos
- [ ] Los tracks sin eventos aparecen como fila vacía

**Estado vacío:**
- [ ] Sin capítulos con fecha, el área muestra un mensaje guía sobre cómo añadir fechas
- [ ] Proyecto vacío muestra el mismo mensaje

---

## Lo que NO hacer en esta spec

- No implementar edición de `storyDate` directamente desde el timeline (solo desde la modal de sinopsis)
- No añadir eventos a tracks personalizados desde esta spec (los tracks se crean vacíos; añadir eventos es una mejora futura)
- No implementar zoom con rueda del ratón (los botones +/− son suficientes para el MVP)
- No añadir vista de "arco de personaje" con líneas que conecten los bloques entre filas
- No implementar filtrado por personaje o por rango de fechas
