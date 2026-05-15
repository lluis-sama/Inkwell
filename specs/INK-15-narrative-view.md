# INK-15 — Vista narrativa general

## Objetivo

Implementar una tercera vista en Inkwell (junto a Editor y Tableros) que muestra todos los documentos del proyecto como tarjetas ordenadas según el binder. Cada tarjeta muestra la sinopsis del capítulo, su recuento de palabras y los personajes que aparecen en él (datos de INK-11 e INK-14). Permite editar sinopsis sin salir de la vista y navega al editor al hacer click en una tarjeta.

---

## Nueva ruta y navegación

### `app.routes.ts` — añadir ruta

```typescript
{
  path: 'narrative',
  loadComponent: () =>
    import('./features/narrative/narrative-layout.component')
      .then(m => m.NarrativeLayoutComponent),
},
```

### `InkNavComponent` — añadir tercer icono

```html
<!-- Entre editor y boards -->
<a
  routerLink="/narrative"
  title="Vista narrativa (Alt+3)"
  class="nav-icon"
  [class.active]="isRoute('/narrative')">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <rect x="2" y="3" width="6" height="8" rx="1"/>
    <rect x="9" y="3" width="6" height="8" rx="1"/>
    <rect x="16" y="3" width="6" height="8" rx="1"/>
    <line x1="2" y1="15" x2="8" y2="15"/>
    <line x1="2" y1="18" x2="8" y2="18"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
    <line x1="9" y1="18" x2="12" y2="18"/>
    <line x1="16" y1="15" x2="22" y2="15"/>
  </svg>
</a>
```

### `AppComponent` — añadir atajo `Alt+3`

```typescript
if (event.altKey && event.key === '3') {
  event.preventDefault();
  this.router.navigate(['/narrative']);
}
```

### `EditorLayoutComponent` — abrir documento por query param

Al navegar desde la vista narrativa al editor con un documento específico:

```typescript
import { ActivatedRoute } from '@angular/router';

private route = inject(ActivatedRoute);

async ngOnInit(): Promise<void> {
  if (!this.projectService.isLoaded()) {
    this.router.navigate(['/']);
    return;
  }
  this.startAutosave();

  // Abrir documento especificado por query param (desde vista narrativa)
  const docId = this.route.snapshot.queryParams['doc'];
  if (docId) {
    const node = this.findNodeById(
      this.projectService.project()?.tree ?? [], docId
    );
    if (node) await this.openDocument(node);
  }
}

private findNodeById(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const found = this.findNodeById(n.children, id);
    if (found) return found;
  }
  return null;
}
```

---

## Modelos de datos — sin cambios

Esta spec consume datos de specs anteriores sin añadir nuevos campos:
- `DocumentFile.synopsis` — de INK-11
- `Project.wordCountCache` — de INK-11
- `Card.type === 'character'` y `Card.characterData.appearsInChapters` — de INK-14

---

## NarrativeService

Computa el estado completo de la vista narrativa combinando todas las fuentes de datos.

### `src/app/core/services/narrative.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { BoardService }       from './board.service';
import { DocumentFile }       from '../models/document.model';
import { BoardFile, Card }    from '../models/board.model';
import { TreeNode }           from '../models/project.model';
import { documentPath, boardsFolderPath, boardPath } from '../../shared/utils/project-paths';

export interface NarrativeCard {
  documentId:   string;
  title:        string;
  synopsis:     string | undefined;
  wordCount:    number;
  characters:   NarrativeCharacter[];
  depth:        number;               // profundidad en el árbol (para indentación visual)
  folderPath:   string[];             // nombres de las carpetas ancestras
}

export interface NarrativeSection {
  type:     'folder';
  title:    string;
  depth:    number;
  path:     string[];
}

export type NarrativeItem = NarrativeCard | NarrativeSection;

export interface NarrativeCharacter {
  cardId:     string;
  name:       string;
  boardTitle: string;
  color:      string;
}

@Injectable({ providedIn: 'root' })
export class NarrativeService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  /**
   * Carga todos los datos necesarios para la vista narrativa.
   * Retorna un array de items (secciones y tarjetas) en orden del binder.
   */
  async loadNarrativeItems(): Promise<NarrativeItem[]> {
    const proj = this.project.project();
    if (!proj) return [];

    const basePath = this.project.basePath()!;

    // 1. Cargar synopses de documentos (leer todos los DocumentFile)
    const synopsisMap  = await this.loadSynopsisMap(basePath, proj.tree);

    // 2. Cargar personajes de todos los tableros
    const characterMap = await this.loadCharacterMap(basePath);

    // 3. Construir la lista de items
    return this.buildItems(
      proj.tree,
      synopsisMap,
      characterMap,
      proj.wordCountCache,
      0,
      [],
    );
  }

  // ─── Carga de datos ───────────────────────────────────────────────────────

  private async loadSynopsisMap(
    basePath: string,
    tree: TreeNode[],
  ): Promise<Map<string, string | undefined>> {
    const map  = new Map<string, string | undefined>();
    const ids  = this.collectDocumentIds(tree);

    await Promise.all(ids.map(async id => {
      try {
        const raw = await this.bridge.readJsonFile(documentPath(basePath, id));
        const doc: DocumentFile = JSON.parse(raw);
        map.set(id, doc.synopsis);
      } catch {
        map.set(id, undefined);
      }
    }));

    return map;
  }

  /**
   * Carga todos los tableros y extrae las tarjetas de tipo 'character'
   * con sus apariciones en capítulos.
   * Retorna un mapa: documentId → lista de personajes que aparecen en ese documento.
   */
  private async loadCharacterMap(
    basePath: string,
  ): Promise<Map<string, NarrativeCharacter[]>> {
    const map = new Map<string, NarrativeCharacter[]>();

    try {
      const boardIds = await this.bridge.listJsonFiles(boardsFolderPath(basePath));
      const boards   = await Promise.all(
        boardIds.map(async id => {
          const raw = await this.bridge.readJsonFile(boardPath(basePath, id));
          return JSON.parse(raw) as BoardFile;
        })
      );

      for (const board of boards) {
        for (const card of board.cards) {
          if (card.type !== 'character' || !card.characterData) continue;

          const character: NarrativeCharacter = {
            cardId:     card.id,
            name:       card.title,
            boardTitle: board.title,
            color:      card.color,
          };

          for (const docId of card.characterData.appearsInChapters) {
            if (!map.has(docId)) map.set(docId, []);
            map.get(docId)!.push(character);
          }
        }
      }
    } catch { /* Si no hay tableros, el mapa queda vacío */ }

    return map;
  }

  // ─── Construcción de items ────────────────────────────────────────────────

  private buildItems(
    nodes: TreeNode[],
    synopsisMap: Map<string, string | undefined>,
    characterMap: Map<string, NarrativeCharacter[]>,
    wordCountCache: Record<string, number>,
    depth: number,
    parentPath: string[],
  ): NarrativeItem[] {
    const items: NarrativeItem[] = [];

    for (const node of nodes) {
      if (node.type === 'folder') {
        const folderPath = [...parentPath, node.title];

        // Añadir cabecera de sección
        items.push({
          type:  'folder',
          title: node.title,
          depth,
          path:  folderPath,
        } as NarrativeSection);

        // Procesar hijos recursivamente
        items.push(
          ...this.buildItems(
            node.children, synopsisMap, characterMap,
            wordCountCache, depth + 1, folderPath,
          )
        );
      } else {
        items.push({
          documentId: node.id,
          title:      node.title,
          synopsis:   synopsisMap.get(node.id),
          wordCount:  wordCountCache[node.id] ?? 0,
          characters: characterMap.get(node.id) ?? [],
          depth,
          folderPath: parentPath,
        } as NarrativeCard);
      }
    }

    return items;
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────

  private collectDocumentIds(nodes: TreeNode[]): string[] {
    return nodes.flatMap(n =>
      n.type === 'folder'
        ? this.collectDocumentIds(n.children)
        : [n.id]
    );
  }
}

// Type guards
export function isNarrativeCard(item: NarrativeItem): item is NarrativeCard {
  return 'documentId' in item;
}

export function isNarrativeSection(item: NarrativeItem): item is NarrativeSection {
  return 'type' in item && item.type === 'folder';
}
```

---

## NarrativeCardComponent

### `src/app/features/narrative/narrative-card.component.ts`

```typescript
import { Component, input, output } from '@angular/core';
import { NarrativeCard, NarrativeCharacter } from '../../core/services/narrative.service';

@Component({
  selector: 'app-narrative-card',
  standalone: true,
  template: `
    <div
      class="flex flex-col rounded-lg border border-ink-border bg-ink-surface
             hover:border-ink-accent transition-all duration-150 cursor-pointer
             group overflow-hidden"
      (click)="documentOpened.emit(card().documentId)">

      <!-- Header: título + recuento de palabras -->
      <div class="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <h3 class="text-ink-text text-sm font-medium leading-snug flex-1">
          {{ card().title }}
        </h3>
        @if (card().wordCount > 0) {
          <span class="text-ink-muted text-xs shrink-0 font-mono mt-0.5">
            {{ formatWords(card().wordCount) }}
          </span>
        }
      </div>

      <!-- Ruta de carpetas (si está anidado) -->
      @if (card().folderPath.length > 0) {
        <div class="px-4 pb-1">
          <span class="text-ink-muted text-xs">
            {{ card().folderPath.join(' › ') }}
          </span>
        </div>
      }

      <!-- Sinopsis -->
      <div
        class="flex-1 px-4 py-2 min-h-16"
        (click)="$event.stopPropagation(); synopsisEditRequested.emit(card().documentId)">
        @if (card().synopsis) {
          <p class="text-ink-subtle text-xs leading-relaxed line-clamp-4">
            {{ card().synopsis }}
          </p>
        } @else {
          <p class="text-ink-muted text-xs italic opacity-0 group-hover:opacity-100
                     transition-opacity">
            Click para añadir sinopsis...
          </p>
        }
      </div>

      <!-- Footer: personajes -->
      @if (card().characters.length > 0) {
        <div class="px-4 pb-3 pt-1 flex flex-wrap gap-1.5 border-t border-ink-border mt-2">
          @for (char of card().characters; track char.cardId) {
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                     font-medium border"
              [style.border-color]="char.color + '60'"
              [style.background]="char.color + '20'"
              [style.color]="'var(--ink-text)'"
              [title]="char.name + ' · ' + char.boardTitle">
              👤 {{ char.name }}
            </span>
          }
        </div>
      }

    </div>
  `,
})
export class NarrativeCardComponent {
  card = input.required<NarrativeCard>();

  documentOpened       = output<string>();
  synopsisEditRequested = output<string>();

  formatWords(n: number): string {
    if (n < 1000) return `${n}p`;
    return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  }
}
```

---

## NarrativeLayoutComponent

### `src/app/features/narrative/narrative-layout.component.ts`

```typescript
import {
  Component, inject, signal, OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  NarrativeService, NarrativeItem, NarrativeCard,
  isNarrativeCard, isNarrativeSection,
} from '../../core/services/narrative.service';
import { ProjectService }   from '../../core/services/project.service';
import { DocumentService }  from '../../core/services/document.service';
import { DocumentFile }     from '../../core/models/document.model';
import { InkNavComponent }  from '../../shared/components/ink-nav.component';
import { NarrativeCardComponent } from './narrative-card.component';
import { SynopsisModalComponent } from '../editor/synopsis/synopsis-modal.component';

@Component({
  selector: 'app-narrative-layout',
  standalone: true,
  imports: [
    InkNavComponent,
    NarrativeCardComponent,
    SynopsisModalComponent,
  ],
  template: `
    <div class="flex h-screen bg-ink-bg overflow-hidden">

      <!-- Nav global -->
      <ink-nav />

      <!-- Contenido principal -->
      <div class="flex flex-col flex-1 overflow-hidden">

        <!-- Top bar -->
        <header class="flex items-center justify-between h-11 px-6
                        border-b border-ink-border bg-ink-panel shrink-0">
          <h2 class="text-ink-text text-sm font-medium">
            Vista narrativa
            @if (projectService.project(); as proj) {
              <span class="text-ink-subtle font-normal"> — {{ proj.name }}</span>
            }
          </h2>

          <!-- Controles de vista -->
          <div class="flex items-center gap-2">

            <!-- Densidad de tarjetas -->
            <div class="flex gap-1">
              @for (cols of [2, 3, 4]; track cols) {
                <button
                  (click)="columns.set(cols)"
                  title="{{ cols }} columnas"
                  class="p-1.5 rounded transition-colors text-xs font-mono"
                  [class]="columns() === cols
                    ? 'bg-ink-border text-ink-accent'
                    : 'text-ink-subtle hover:text-ink-text hover:bg-ink-surface'">
                  {{ cols }}
                </button>
              }
            </div>

            <!-- Filtro: solo capítulos sin sinopsis -->
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" [(ngModel)]="filterNoSynopsis"
                     (ngModelChange)="applyFilter()"
                     class="accent-ink-accent w-3 h-3"/>
              <span class="text-ink-subtle text-xs">Sin sinopsis</span>
            </label>

          </div>
        </header>

        <!-- Área de tarjetas -->
        <div class="flex-1 overflow-y-auto px-6 py-6">

          @if (loading()) {
            <!-- Estado de carga -->
            <div class="flex items-center justify-center h-full gap-3 opacity-50">
              <span class="inline-block w-5 h-5 border-2 border-ink-accent
                           border-t-transparent rounded-full animate-spin"></span>
              <span class="text-ink-subtle text-sm">Cargando vista narrativa...</span>
            </div>

          } @else if (filteredItems().length === 0) {
            <!-- Estado vacío -->
            <div class="flex flex-col items-center justify-center h-full gap-4 opacity-40">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="1.5" class="text-ink-subtle">
                <rect x="2" y="3" width="6" height="8" rx="1"/>
                <rect x="9" y="3" width="6" height="8" rx="1"/>
                <rect x="16" y="3" width="6" height="8" rx="1"/>
              </svg>
              <p class="text-ink-subtle text-sm text-center">
                @if (filterNoSynopsis) {
                  Todos los capítulos tienen sinopsis. ¡Bien hecho!
                } @else {
                  El proyecto no tiene documentos todavía.
                }
              </p>
            </div>

          } @else {
            <!-- Lista de items -->
            <div class="flex flex-col gap-6">
              @for (item of filteredItems(); track trackItem(item)) {

                @if (isSection(item)) {
                  <!-- Cabecera de sección (carpeta) -->
                  <div
                    class="flex items-center gap-3 mt-2"
                    [style.paddingLeft.px]="item.depth * 16">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2"
                         class="text-ink-accent shrink-0">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1
                               2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <h3 class="text-ink-text text-sm font-medium">{{ item.title }}</h3>
                    <div class="flex-1 h-px bg-ink-border"></div>
                    <span class="text-ink-muted text-xs">
                      {{ childCount(item) }} documentos
                    </span>
                  </div>

                } @else if (isCard(item)) {
                  <!-- La tarjeta se añade al grid del nivel actual -->
                  <!-- Usamos un contenedor por nivel de profundidad -->
                }
              }

              <!-- Grid de tarjetas agrupadas por sección -->
              @for (group of cardGroups(); track group.sectionTitle) {
                <div
                  class="grid gap-4"
                  [style.grid-template-columns]="'repeat(' + columns() + ', minmax(0, 1fr))'">
                  @for (card of group.cards; track card.documentId) {
                    <app-narrative-card
                      [card]="card"
                      (documentOpened)="openInEditor($event)"
                      (synopsisEditRequested)="requestSynopsisEdit($event)"/>
                  }
                </div>
              }
            </div>
          }

        </div>
      </div>
    </div>

    <!-- Modal de sinopsis -->
    @if (synopsisDocument()) {
      <app-synopsis-modal
        [document]="synopsisDocument()!"
        (saved)="onSynopsisSaved($event)"
        (closed)="synopsisDocument.set(null)"/>
    }
  `,
})
export class NarrativeLayoutComponent implements OnInit {
  private narrativeService = inject(NarrativeService);
  private projectService   = inject(ProjectService);
  private docService       = inject(DocumentService);
  private router           = inject(Router);

  projectService_pub = this.projectService;  // para el template

  loading          = signal(true);
  items            = signal<NarrativeItem[]>([]);
  columns          = signal(3);
  filterNoSynopsis = false;
  synopsisDocument = signal<DocumentFile | null>(null);

  // Items tras aplicar el filtro
  filteredItems = signal<NarrativeItem[]>([]);

  // Groups de tarjetas para el grid (agrupadas por sección para el layout)
  cardGroups = signal<Array<{ sectionTitle: string; cards: NarrativeCard[] }>>([]);

  readonly isSection = isNarrativeSection;
  readonly isCard    = isNarrativeCard;

  async ngOnInit(): Promise<void> {
    if (!this.projectService.isLoaded()) {
      this.router.navigate(['/']);
      return;
    }
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const loaded = await this.narrativeService.loadNarrativeItems();
      this.items.set(loaded);
      this.applyFilter();
    } finally {
      this.loading.set(false);
    }
  }

  applyFilter(): void {
    let filtered = this.items();

    if (this.filterNoSynopsis) {
      // Mantener secciones que tengan al menos un documento sin sinopsis
      filtered = filtered.filter(item => {
        if (isNarrativeSection(item)) return true;
        return !item.synopsis;
      });
    }

    this.filteredItems.set(filtered);
    this.buildCardGroups(filtered);
  }

  private buildCardGroups(items: NarrativeItem[]): void {
    const groups: Array<{ sectionTitle: string; cards: NarrativeCard[] }> = [];
    let current = { sectionTitle: '', cards: [] as NarrativeCard[] };

    for (const item of items) {
      if (isNarrativeSection(item)) {
        if (current.cards.length > 0) groups.push(current);
        current = { sectionTitle: item.title, cards: [] };
      } else {
        current.cards.push(item);
      }
    }

    if (current.cards.length > 0) groups.push(current);
    this.cardGroups.set(groups);
  }

  childCount(section: { title: string }): number {
    const items  = this.filteredItems();
    const idx    = items.findIndex(i => isNarrativeSection(i) && i.title === section.title);
    if (idx === -1) return 0;
    let count = 0;
    for (let i = idx + 1; i < items.length; i++) {
      if (isNarrativeSection(items[i])) break;
      if (isNarrativeCard(items[i])) count++;
    }
    return count;
  }

  trackItem(item: NarrativeItem): string {
    return isNarrativeCard(item) ? item.documentId : item.title;
  }

  // ─── Acciones ─────────────────────────────────────────────────────────────

  openInEditor(documentId: string): void {
    this.router.navigate(['/editor'], { queryParams: { doc: documentId } });
  }

  async requestSynopsisEdit(documentId: string): Promise<void> {
    try {
      const doc = await this.docService.loadDocument(documentId);
      this.synopsisDocument.set(doc);
    } catch {
      // Si no se puede cargar, ignorar silenciosamente
    }
  }

  onSynopsisSaved(doc: DocumentFile): void {
    // Actualizar la sinopsis en el item correspondiente sin recargar todo
    this.items.update(items =>
      items.map(item => {
        if (isNarrativeCard(item) && item.documentId === doc.id) {
          return { ...item, synopsis: doc.synopsis };
        }
        return item;
      })
    );
    this.applyFilter();
    this.synopsisDocument.set(null);
  }
}
```

> **Nota sobre el template del grid**: El layout usa `cardGroups()` para agrupar las tarjetas por sección y renderizarlas en un grid CSS. La sección `@for` de items y la de `cardGroups` coexisten — la primera renderiza las cabeceras de sección, la segunda los grids. Se puede simplificar en implementación si el Planner lo considera oportuno, siempre que el resultado visual sea equivalente.

---

## Comportamiento de la vista

### Carga inicial
Al entrar en `/narrative`, el componente carga todos los datos en paralelo (sinopses de documentos + personajes de tableros). Muestra un spinner mientras carga. El tiempo es proporcional al número de documentos y tableros del proyecto — para una novela típica (50 capítulos, 2-3 tableros) debería ser menor a 1 segundo en disco local.

### Grid responsive
El usuario puede elegir 2, 3 o 4 columnas con los botones de la top bar. El default es 3 columnas, que funciona bien a 1280px con la nav lateral.

### Secciones
Las carpetas del binder se renderizan como cabeceras de sección con una línea horizontal. Los documentos dentro de carpetas anidadas se muestran con indentación visual en la cabecera de su sección, pero el grid siempre ocupa el ancho completo del contenedor.

### Filtro "Sin sinopsis"
Útil para identificar rápidamente qué capítulos necesitan sinopsis. Al activarlo, solo se muestran las tarjetas sin `synopsis`, manteniendo las cabeceras de sección relevantes. Si todos los capítulos tienen sinopsis, muestra un mensaje de felicitación.

### Edición de sinopsis inline
- Click en el área de sinopsis de una tarjeta → abre el `SynopsisModalComponent`
- Al guardar, el item se actualiza en memoria sin recargar toda la vista
- El icono "Click para añadir sinopsis..." solo es visible en hover (para no distraer en la vista general)

### Navegación al editor
- Click en el título o en cualquier parte de la tarjeta (excepto el área de sinopsis) → navega a `/editor?doc={id}`
- El `EditorLayoutComponent` lee el query param y abre el documento automáticamente

---

## Criterios de aceptación

**Navegación:**
- [ ] El icono de vista narrativa aparece en la nav entre Editor y Boards
- [ ] `Alt+3` navega a `/narrative`
- [ ] Sin proyecto abierto, navegar a `/narrative` redirige a `/`

**Carga:**
- [ ] Al entrar, se muestra un spinner mientras cargan los datos
- [ ] Los datos cargan correctamente (sinopses, palabras, personajes)
- [ ] Un proyecto sin documentos muestra el estado vacío

**Grid de tarjetas:**
- [ ] Las tarjetas respetan el orden del binder
- [ ] Las carpetas del binder aparecen como cabeceras de sección con línea divisoria
- [ ] El contador "N documentos" en cada sección es correcto
- [ ] Los botones 2 / 3 / 4 cambian el número de columnas del grid
- [ ] El default es 3 columnas

**Contenido de cada tarjeta:**
- [ ] Muestra el título del documento
- [ ] Muestra la ruta de carpetas ancestras (si está anidado)
- [ ] Muestra la sinopsis si existe
- [ ] Si no tiene sinopsis, muestra "Click para añadir sinopsis..." en hover
- [ ] Muestra el recuento de palabras en formato compacto (ej. "3,2k")
- [ ] Si el documento tiene personajes asignados (INK-14), aparecen como badges de color

**Edición de sinopsis:**
- [ ] Click en el área de sinopsis abre el `SynopsisModalComponent`
- [ ] Al guardar la sinopsis, la tarjeta se actualiza inmediatamente sin recargar
- [ ] La generación con IA funciona igual que en la vista del binder (INK-11)

**Filtro:**
- [ ] El checkbox "Sin sinopsis" filtra correctamente las tarjetas
- [ ] Las secciones vacías tras el filtro desaparecen
- [ ] Con todos los capítulos sinopsizados, aparece el mensaje de felicitación

**Navegación al editor:**
- [ ] Click en una tarjeta (fuera del área de sinopsis) navega a `/editor`
- [ ] El documento correspondiente se abre automáticamente en el editor
- [ ] El binder resalta el documento correcto tras la navegación

---

## Lo que NO hacer en esta spec

- No añadir drag & drop para reordenar documentos desde esta vista (se hace desde el binder)
- No implementar edición del título del documento desde las tarjetas
- No mostrar el contenido completo del documento en la tarjeta (solo sinopsis)
- No añadir relaciones visuales con líneas entre tarjetas (backlog)
- No implementar filtros adicionales (por personaje, por longitud, etc.)
- No cachear los datos narrativos en disco — se recargan cada vez que se entra en la vista
