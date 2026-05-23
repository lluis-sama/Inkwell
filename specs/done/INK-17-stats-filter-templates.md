# INK-17 — Estadísticas, filtro de estado y plantillas de proyecto

## Objetivo

Tres mejoras independientes centradas en la productividad y organización:

1. **Estadísticas históricas de escritura** — recuento de palabras por sesión guardado en `stats.json`, con gráfica de los últimos 30 días
2. **Filtro de estado en el binder** — mostrar solo los documentos con un estado concreto (o todos)
3. **Plantillas de proyecto** — al crear un proyecto nuevo, elegir una estructura predefinida que precrea carpetas y documentos vacíos

---

## Parte 1: Estadísticas históricas

### Modelo de datos

### `src/app/core/models/stats.model.ts`

```typescript
export interface WritingStats {
  entries: StatsEntry[];
}

export interface StatsEntry {
  date:       string;   // YYYY-MM-DD — un registro por día
  wordsAdded: number;   // palabras netas añadidas ese día (puede ser 0 o negativo si se borró)
  sessions:   number;   // número de sesiones ese día (veces que se abrió el proyecto)
}
```

El fichero se guarda en `{basePath}/stats.json`, dentro de la carpeta del proyecto.

### `src/app/shared/utils/project-paths.ts` — añadir ruta

```typescript
export function statsPath(basePath: string): string {
  return `${basePath}/stats.json`;
}
```

### `StatsService`

### `src/app/core/services/stats.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { WritingStats, StatsEntry } from '../models/stats.model';
import { statsPath }          from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  private cache: WritingStats | null = null;
  private todayWordBase = 0;         // palabras al inicio de la sesión del día
  private sessionTracked = false;    // si ya registramos la sesión de hoy

  // ─── Carga ────────────────────────────────────────────────────────────────

  async load(): Promise<WritingStats> {
    const basePath = this.project.basePath();
    if (!basePath) return { entries: [] };

    try {
      const raw  = await this.bridge.readJsonFile(statsPath(basePath));
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = { entries: [] };
    }

    return this.cache!;
  }

  // ─── Registro de sesión ───────────────────────────────────────────────────

  /**
   * Llamar al abrir el primer documento de la sesión.
   * Registra que el usuario abrió el proyecto hoy.
   */
  async trackSessionStart(): Promise<void> {
    if (this.sessionTracked) return;
    this.sessionTracked = true;
    this.todayWordBase  = this.project.totalWordCount();

    const stats = await this.loadOrCreate();
    const today = this.today();
    const entry = stats.entries.find(e => e.date === today);

    if (entry) {
      entry.sessions++;
    } else {
      stats.entries.push({ date: today, wordsAdded: 0, sessions: 1 });
    }

    await this.save(stats);
  }

  /**
   * Llamar después de cada guardado de documento.
   * Actualiza las palabras netas del día.
   */
  async updateTodayWords(): Promise<void> {
    if (!this.sessionTracked) return;

    const currentTotal = this.project.totalWordCount();
    const delta        = currentTotal - this.todayWordBase;
    const stats        = await this.loadOrCreate();
    const today        = this.today();
    const entry        = stats.entries.find(e => e.date === today);

    if (entry) {
      entry.wordsAdded = delta;
    } else {
      stats.entries.push({ date: today, wordsAdded: delta, sessions: 1 });
    }

    await this.save(stats);
  }

  /**
   * Retorna los últimos N días de estadísticas (incluyendo días sin escritura como 0).
   */
  async getLastNDays(n = 30): Promise<StatsEntry[]> {
    const stats = await this.loadOrCreate();
    const result: StatsEntry[] = [];

    for (let i = n - 1; i >= 0; i--) {
      const date  = this.daysAgo(i);
      const entry = stats.entries.find(e => e.date === date);
      result.push(entry ?? { date, wordsAdded: 0, sessions: 0 });
    }

    return result;
  }

  /**
   * Palabras totales escritas en los últimos N días.
   */
  async totalWordsLastNDays(n = 30): Promise<number> {
    const entries = await this.getLastNDays(n);
    return entries.reduce((sum, e) => sum + Math.max(0, e.wordsAdded), 0);
  }

  /**
   * Racha actual: días consecutivos con al menos 1 palabra escrita.
   */
  async currentStreak(): Promise<number> {
    const stats = await this.loadOrCreate();
    const today = this.today();
    let streak  = 0;
    let date    = today;

    while (true) {
      const entry = stats.entries.find(e => e.date === date);
      if (!entry || entry.wordsAdded <= 0) break;
      streak++;
      date = this.daysAgo(streak);
    }

    return streak;
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  private async loadOrCreate(): Promise<WritingStats> {
    if (this.cache) return this.cache;
    return this.load();
  }

  private async save(stats: WritingStats): Promise<void> {
    const basePath = this.project.basePath();
    if (!basePath) return;

    // Mantener solo los últimos 365 días para no crecer indefinidamente
    if (stats.entries.length > 365) {
      stats.entries.sort((a, b) => a.date.localeCompare(b.date));
      stats.entries = stats.entries.slice(-365);
    }

    this.cache = stats;
    await this.bridge.writeJsonFile(statsPath(basePath), JSON.stringify(stats, null, 2));
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  resetSession(): void {
    this.sessionTracked = false;
    this.todayWordBase  = 0;
    this.cache          = null;
  }
}
```

### Integración en `EditorLayoutComponent`

```typescript
private statsService = inject(StatsService);

// En openDocument(), tras cargar el doc:
async openDocument(node: TreeNode): Promise<void> {
  // ...código existente...
  await this.statsService.trackSessionStart();
}

// En saveCurrentDocument(), tras guardar:
private async saveCurrentDocument(): Promise<void> {
  // ...código existente...
  await this.statsService.updateTodayWords();
}

// En closeProject() / ngOnDestroy():
ngOnDestroy(): void {
  this.stopAutosave();
  this.statsService.resetSession();
}
```

### `StatsModalComponent`

### `src/app/features/editor/stats/stats-modal.component.ts`

```typescript
import { Component, inject, signal, OnInit, output } from '@angular/core';
import * as d3 from 'd3';
import { StatsService, StatsEntry } from '../../../core/services/stats.service';
import { InkModalComponent } from '../../../shared/components/ink-modal.component';

@Component({
  selector: 'app-stats-modal',
  standalone: true,
  imports: [InkModalComponent],
  template: `
    <ink-modal title="Estadísticas de escritura" [hasActions]="false" (closed)="closed.emit()">
      <div class="flex flex-col gap-6">

        <!-- Resumen -->
        <div class="grid grid-cols-3 gap-3">
          <div class="flex flex-col items-center gap-1 p-3 rounded-lg bg-ink-bg
                      border border-ink-border">
            <span class="text-ink-accent text-xl font-bold font-mono">
              {{ streak() }}
            </span>
            <span class="text-ink-subtle text-xs text-center">días de racha</span>
          </div>
          <div class="flex flex-col items-center gap-1 p-3 rounded-lg bg-ink-bg
                      border border-ink-border">
            <span class="text-ink-accent text-xl font-bold font-mono">
              {{ totalWords30() | number }}
            </span>
            <span class="text-ink-subtle text-xs text-center">palabras este mes</span>
          </div>
          <div class="flex flex-col items-center gap-1 p-3 rounded-lg bg-ink-bg
                      border border-ink-border">
            <span class="text-ink-accent text-xl font-bold font-mono">
              {{ avgWords30() | number:'1.0-0' }}
            </span>
            <span class="text-ink-subtle text-xs text-center">media diaria</span>
          </div>
        </div>

        <!-- Gráfica de barras -->
        <div>
          <p class="text-ink-subtle text-xs mb-3 uppercase tracking-widest font-medium">
            Últimos 30 días
          </p>
          <svg #chartSvg width="100%" height="120"></svg>
        </div>

      </div>
    </ink-modal>
  `,
})
export class StatsModalComponent implements OnInit {
  private statsService = inject(StatsService);
  closed = output<void>();

  entries    = signal<StatsEntry[]>([]);
  streak     = signal(0);
  totalWords30 = signal(0);
  avgWords30   = signal(0);

  async ngOnInit(): Promise<void> {
    const [entries, streak, total] = await Promise.all([
      this.statsService.getLastNDays(30),
      this.statsService.currentStreak(),
      this.statsService.totalWordsLastNDays(30),
    ]);

    this.entries.set(entries);
    this.streak.set(streak);
    this.totalWords30.set(total);
    this.avgWords30.set(
      entries.filter(e => e.wordsAdded > 0).length > 0
        ? Math.round(total / entries.filter(e => e.wordsAdded > 0).length)
        : 0
    );

    setTimeout(() => this.renderChart(entries), 50);
  }

  private renderChart(entries: StatsEntry[]): void {
    const svgEl = document.querySelector('app-stats-modal svg') as SVGSVGElement;
    if (!svgEl) return;

    const W      = svgEl.clientWidth || 400;
    const H      = 120;
    const margin = { top: 10, right: 8, bottom: 20, left: 30 };
    const width  = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const maxVal = Math.max(...entries.map(e => e.wordsAdded), 1);

    const xScale = d3.scaleBand()
      .domain(entries.map(e => e.date))
      .range([0, width])
      .padding(0.15);

    const yScale = d3.scaleLinear()
      .domain([0, maxVal])
      .range([height, 0])
      .nice();

    // Eje Y mínimo
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(3).tickFormat(d => {
        const n = d as number;
        return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);
      }))
      .call(ax => {
        ax.select('.domain').remove();
        ax.selectAll('.tick line').attr('stroke', 'var(--ink-border)');
        ax.selectAll('.tick text').attr('fill', 'var(--ink-subtle)').attr('font-size', '9px');
      });

    // Barras
    g.selectAll('rect')
      .data(entries)
      .join('rect')
      .attr('x', d => xScale(d.date)!)
      .attr('y', d => yScale(Math.max(0, d.wordsAdded)))
      .attr('width', xScale.bandwidth())
      .attr('height', d => height - yScale(Math.max(0, d.wordsAdded)))
      .attr('rx', 2)
      .attr('fill', d =>
        d.wordsAdded > 0 ? 'var(--ink-accent)' : 'var(--ink-border)'
      )
      .attr('opacity', 0.85);

    // Etiquetas del eje X (solo cada 7 días)
    const xAxis = d3.axisBottom(xScale)
      .tickValues(entries.filter((_, i) => i % 7 === 0).map(e => e.date))
      .tickFormat(d => {
        const date = new Date(d as string);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      });

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .call(ax => {
        ax.select('.domain').remove();
        ax.selectAll('.tick line').remove();
        ax.selectAll('.tick text').attr('fill', 'var(--ink-subtle)').attr('font-size', '9px');
      });
  }
}
```

### Botón de estadísticas en `InkNavComponent`

```html
@if (projectService.isLoaded()) {
  <button (click)="showStats.set(true)" title="Estadísticas" class="nav-icon">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
    </svg>
  </button>
}

@if (showStats()) {
  <app-stats-modal (closed)="showStats.set(false)"/>
}
```

---

## Parte 2: Filtro de estado en el binder

### Modificar `BinderComponent`

Añadir un selector de filtro encima del árbol de documentos:

```typescript
import { DocumentStatus, DOCUMENT_STATUS_CONFIG } from '../../../core/models/project.model';

statusFilter = signal<DocumentStatus | 'all'>('all');
```

En el template, entre el header y el árbol/búsqueda:

```html
<!-- Filtro de estado (solo visible cuando no hay búsqueda activa) -->
@if (!showSearch()) {
  <div class="flex items-center gap-1 px-2 py-1.5 border-b border-ink-border
              overflow-x-auto shrink-0">
    <button
      (click)="statusFilter.set('all')"
      class="shrink-0 px-2 py-1 rounded text-xs transition-colors"
      [class]="statusFilter() === 'all'
        ? 'bg-ink-border text-ink-text'
        : 'text-ink-subtle hover:text-ink-text hover:bg-ink-surface'">
      Todos
    </button>
    @for (entry of statusEntries; track entry.key) {
      <button
        (click)="statusFilter.set(entry.key)"
        class="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
        [class]="statusFilter() === entry.key
          ? 'bg-ink-border text-ink-text'
          : 'text-ink-subtle hover:text-ink-text hover:bg-ink-surface'">
        <span class="w-1.5 h-1.5 rounded-full shrink-0"
              [style.background]="entry.color"></span>
        {{ entry.label }}
      </button>
    }
  </div>
}
```

```typescript
readonly statusEntries = Object.entries(DOCUMENT_STATUS_CONFIG).map(([key, val]) => ({
  key:   key as DocumentStatus,
  label: val.label,
  color: val.color,
}));
```

### Filtrado en el árbol

El filtrado es visual — no modifica el árbol del proyecto. Modificar `BinderNodeComponent` para recibir el filtro y ocultar nodos que no coincidan:

```typescript
// Nuevo input
statusFilter = input<DocumentStatus | 'all'>('all');

// Computed: si este nodo debe mostrarse
isVisible = computed(() => {
  const filter = this.statusFilter();
  if (filter === 'all') return true;
  if (this.node().type === 'folder') {
    // La carpeta es visible si tiene al menos un documento descendiente con el estado
    return this.hasMatchingDescendant(this.node(), filter);
  }
  return this.node().status === filter;
});
```

```typescript
private hasMatchingDescendant(node: TreeNode, status: DocumentStatus): boolean {
  if (node.type === 'document') return node.status === status;
  return node.children.some(c => this.hasMatchingDescendant(c, status));
}
```

En el template:

```html
@if (isVisible()) {
  <div>
    <!-- contenido existente del nodo -->
  </div>
}
```

---

## Parte 3: Plantillas de proyecto

### Modelo de plantilla

```typescript
// En project.model.ts o en un fichero nuevo templates.model.ts

export interface ProjectTemplate {
  id:          string;
  name:        string;
  description: string;
  icon:        string;
  structure:   TemplateNode[];
}

export interface TemplateNode {
  title:    string;
  type:     'folder' | 'document';
  children: TemplateNode[];
}
```

### Plantillas predefinidas

```typescript
// src/app/core/data/project-templates.ts

import { ProjectTemplate } from '../models/project.model';

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id:          'blank',
    name:        'Proyecto en blanco',
    description: 'Sin estructura. Empieza desde cero.',
    icon:        '📄',
    structure:   [],
  },
  {
    id:          'novel-3act',
    name:        'Novela (3 actos)',
    description: 'Estructura clásica en tres actos con capítulos.',
    icon:        '📖',
    structure: [
      {
        title: 'Acto I — El detonante', type: 'folder', children: [
          { title: 'Capítulo 1', type: 'document', children: [] },
          { title: 'Capítulo 2', type: 'document', children: [] },
          { title: 'Capítulo 3', type: 'document', children: [] },
        ],
      },
      {
        title: 'Acto II — La confrontación', type: 'folder', children: [
          { title: 'Capítulo 4', type: 'document', children: [] },
          { title: 'Capítulo 5', type: 'document', children: [] },
          { title: 'Capítulo 6', type: 'document', children: [] },
          { title: 'Capítulo 7', type: 'document', children: [] },
          { title: 'Capítulo 8', type: 'document', children: [] },
        ],
      },
      {
        title: 'Acto III — La resolución', type: 'folder', children: [
          { title: 'Capítulo 9',  type: 'document', children: [] },
          { title: 'Capítulo 10', type: 'document', children: [] },
          { title: 'Capítulo 11', type: 'document', children: [] },
        ],
      },
      {
        title: 'Material de apoyo', type: 'folder', children: [
          { title: 'Notas generales',   type: 'document', children: [] },
          { title: 'Línea temporal',    type: 'document', children: [] },
        ],
      },
    ],
  },
  {
    id:          'novel-parts',
    name:        'Novela (partes y capítulos)',
    description: '3 partes con 5 capítulos cada una.',
    icon:        '📚',
    structure: Array.from({ length: 3 }, (_, i) => ({
      title:    `Parte ${['I', 'II', 'III'][i]}`,
      type:     'folder' as const,
      children: Array.from({ length: 5 }, (_, j) => ({
        title:    `Capítulo ${i * 5 + j + 1}`,
        type:     'document' as const,
        children: [],
      })),
    })),
  },
  {
    id:          'short-story',
    name:        'Relato corto',
    description: 'Estructura mínima para un relato.',
    icon:        '✍️',
    structure: [
      { title: 'Planteamiento', type: 'document', children: [] },
      { title: 'Nudo',          type: 'document', children: [] },
      { title: 'Desenlace',     type: 'document', children: [] },
      {
        title: 'Notas', type: 'folder', children: [
          { title: 'Personajes', type: 'document', children: [] },
        ],
      },
    ],
  },
  {
    id:          'essay',
    name:        'Ensayo',
    description: 'Introducción, cuerpo por secciones y conclusión.',
    icon:        '📝',
    structure: [
      { title: 'Introducción', type: 'document', children: [] },
      {
        title: 'Desarrollo', type: 'folder', children: [
          { title: 'Sección 1', type: 'document', children: [] },
          { title: 'Sección 2', type: 'document', children: [] },
          { title: 'Sección 3', type: 'document', children: [] },
        ],
      },
      { title: 'Conclusión',   type: 'document', children: [] },
      { title: 'Bibliografía', type: 'document', children: [] },
    ],
  },
  {
    id:          'custom',
    name:        'Personalizado',
    description: 'Define tú mismo el número de partes y capítulos.',
    icon:        '⚙️',
    structure:   [],  // se genera dinámicamente según los inputs del usuario
  },
];
```

### Modificar `NewProjectModalComponent` (INK-04)

Añadir paso de selección de plantilla antes del formulario actual.

El modal pasa a tener dos pasos:
1. **Elegir plantilla** (nuevo)
2. **Nombre, descripción y carpeta** (existente)

```typescript
import { PROJECT_TEMPLATES, ProjectTemplate } from '../../core/data/project-templates';

step              = signal<1 | 2>(1);
selectedTemplate  = signal<ProjectTemplate>(PROJECT_TEMPLATES[0]);

// Para plantilla personalizada:
customParts    = 3;
customChapters = 5;
```

**Paso 1 — Selector de plantilla:**

```html
@if (step() === 1) {
  <div class="flex flex-col gap-3">
    <p class="text-ink-subtle text-xs">
      Elige una estructura de partida. Podrás modificarla desde el binder.
    </p>
    <div class="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
      @for (template of templates; track template.id) {
        <button
          (click)="selectedTemplate.set(template)"
          class="flex flex-col gap-1.5 p-3 rounded-lg border-2 text-left
                 transition-all"
          [class]="selectedTemplate().id === template.id
            ? 'border-ink-accent bg-ink-surface'
            : 'border-ink-border hover:border-ink-muted'">
          <span class="text-lg">{{ template.icon }}</span>
          <span class="text-ink-text text-xs font-medium">{{ template.name }}</span>
          <span class="text-ink-subtle text-xs leading-relaxed">{{ template.description }}</span>
        </button>
      }
    </div>

    <!-- Opciones de plantilla personalizada -->
    @if (selectedTemplate().id === 'custom') {
      <div class="grid grid-cols-2 gap-3 pt-2 border-t border-ink-border">
        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Número de partes
          </label>
          <input [(ngModel)]="customParts" type="number" min="1" max="20"
                 class="field-input"/>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Capítulos por parte
          </label>
          <input [(ngModel)]="customChapters" type="number" min="1" max="50"
                 class="field-input"/>
        </div>
      </div>
    }
  </div>
}
```

**Acciones del paso 1:**
```html
<ng-container slot="actions">
  <ink-button variant="ghost" (clicked)="cancelled.emit()">Cancelar</ink-button>
  <ink-button variant="primary" (clicked)="step.set(2)">Siguiente →</ink-button>
</ng-container>
```

**Paso 2 — Formulario existente + botón "← Anterior"**

### Aplicar la plantilla al crear el proyecto

En `create()` dentro de `NewProjectModalComponent`, tras crear el proyecto:

```typescript
async create(): Promise<void> {
  // ...código existente de creación...

  // Aplicar la plantilla
  const template = this.selectedTemplate();
  const structure = template.id === 'custom'
    ? this.buildCustomStructure(this.customParts, this.customChapters)
    : template.structure;

  if (structure.length > 0) {
    await this.applyTemplate(this.folderPath()!, structure);
  }

  // ...resto del código existente...
}

private buildCustomStructure(parts: number, chaptersPerPart: number): TemplateNode[] {
  const romanNumerals = ['I','II','III','IV','V','VI','VII','VIII',
                         'IX','X','XI','XII','XIII','XIV','XV',
                         'XVI','XVII','XVIII','XIX','XX'];
  return Array.from({ length: parts }, (_, i) => ({
    title:    `Parte ${romanNumerals[i] ?? i + 1}`,
    type:     'folder' as const,
    children: Array.from({ length: chaptersPerPart }, (_, j) => ({
      title:    `Capítulo ${i * chaptersPerPart + j + 1}`,
      type:     'document' as const,
      children: [],
    })),
  }));
}

private async applyTemplate(
  basePath: string,
  nodes: TemplateNode[],
  parentId: string | null = null,
): Promise<void> {
  for (const node of nodes) {
    if (node.type === 'folder') {
      const treeNode = await this.projectService.addNode('folder', node.title, parentId);
      if (node.children.length > 0) {
        await this.applyTemplate(basePath, node.children, treeNode.id);
      }
    } else {
      await this.docService.createDocument(node.title, parentId);
    }
  }
}
```

---

## Criterios de aceptación

**Estadísticas:**
- [ ] Al abrir el primer documento de una sesión, se registra la sesión en `stats.json`
- [ ] Al guardar un documento, se actualiza el delta de palabras del día
- [ ] El botón de estadísticas en la nav abre el modal (solo con proyecto abierto)
- [ ] El modal muestra: racha actual, total de palabras en 30 días, media diaria
- [ ] La gráfica de barras muestra los últimos 30 días (días sin escritura = barra gris o ausente)
- [ ] `stats.json` existe en la carpeta del proyecto tras el primer guardado
- [ ] Proyectos sin `stats.json` no fallan — crean el fichero al primer guardado

**Filtro de estado:**
- [ ] La barra de filtro aparece en el binder sobre el árbol de documentos
- [ ] "Todos" (default) muestra el árbol completo sin filtrar
- [ ] Seleccionar un estado oculta los documentos que no lo tienen
- [ ] Las carpetas sin documentos del estado seleccionado también se ocultan
- [ ] El filtro no modifica el árbol del proyecto, solo la vista
- [ ] La barra de filtro no aparece cuando la vista de búsqueda está activa

**Plantillas:**
- [ ] El modal de nuevo proyecto tiene dos pasos: elegir plantilla → configurar nombre/carpeta
- [ ] Se muestran las 6 plantillas predefinidas en un grid con icono, nombre y descripción
- [ ] Al seleccionar "Personalizado" aparecen los campos de nº de partes y capítulos por parte
- [ ] Al crear un proyecto con plantilla, las carpetas y documentos se crean automáticamente
- [ ] Los documentos creados por la plantilla están vacíos pero son editables
- [ ] Al crear con plantilla "En blanco", el proyecto queda vacío (sin nodos)
- [ ] El proyecto creado desde plantilla se puede modificar libremente desde el binder

---

## Lo que NO hacer en esta spec

- No implementar estadísticas de velocidad (palabras por minuto)
- No añadir exportación de estadísticas a CSV
- No permitir al usuario crear y guardar sus propias plantillas personalizadas
- No filtrar por múltiples estados a la vez (selección única)
