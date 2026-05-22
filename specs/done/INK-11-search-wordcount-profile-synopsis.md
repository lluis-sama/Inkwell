# INK-11 — Búsqueda, recuento global, perfil de autor y sinopsis

## Objetivo

Cuatro features que completan la usabilidad de Inkwell como herramienta de escritura seria:

1. **Búsqueda de texto en el proyecto** — localizar cualquier término en todos los documentos
2. **Recuento global de palabras** — barra inferior en el binder con el total del proyecto
3. **Perfil de autor persistente** — metadatos guardados en el proyecto, pre-rellena la exportación de INK-10
4. **Sinopsis por documento** — campo editable por documento con generación IA opcional

---

## Modelos a modificar

### `project.model.ts`

```typescript
export interface Project {
  // ...campos existentes...
  wordCountCache: Record<string, number>;  // documentId → nº palabras
  authorProfile?: AuthorProfile;
}

export interface AuthorProfile {
  legalName: string;
  penName?: string;
  email: string;
  phone?: string;
  address?: string;
  agentName?: string;
  agentContact?: string;
  genre: string;
  language: string;       // BCP 47, default: 'es'
  copyrightYear: number;
  publisher?: string;
}
```

Inicializar `wordCountCache: {}` en `ProjectService.createProject()`.
En `openProject()`, si el proyecto cargado no tiene `wordCountCache`, inicializarlo como `{}`.

### `document.model.ts`

```typescript
export interface DocumentFile {
  // ...campos existentes...
  synopsis?: string;
}
```

---

## Parte 1: Caché de recuento de palabras

La estrategia es incremental: cada vez que se guarda un documento, se actualiza su recuento en `project.json`. El total del proyecto se computa como la suma de todos los valores del caché, sin necesidad de cargar todos los documentos.

### Modificar `DocumentService.saveDocument()`

```typescript
async saveDocument(doc: DocumentFile): Promise<DocumentFile> {
  const basePath = this.requireBasePath();
  const updated  = { ...doc, updatedAt: new Date().toISOString() };

  await this.bridge.writeJsonFile(
    documentPath(basePath, updated.id),
    JSON.stringify(updated, null, 2),
  );

  // Actualizar caché de palabras e invalidar caché de búsqueda
  const wordCount = this.countWords(updated);
  await this.projectService.updateWordCountCache(updated.id, wordCount);
  this.searchService.invalidate(updated.id);

  return updated;
}

private countWords(doc: DocumentFile): number {
  const text = tiptapToText(doc.content);
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
```

### Nuevos métodos en `ProjectService`

```typescript
// Computed: total de palabras del proyecto
readonly totalWordCount = computed(() => {
  const cache = this.project()?.wordCountCache ?? {};
  return Object.values(cache).reduce((sum, n) => sum + n, 0);
});

async updateWordCountCache(documentId: string, wordCount: number): Promise<void> {
  this.project.update(p => p ? {
    ...p,
    wordCountCache: { ...p.wordCountCache, [documentId]: wordCount },
  } : p);
  await this.saveProjectOnly();
}

async updateAuthorProfile(profile: AuthorProfile): Promise<void> {
  this.project.update(p => p ? { ...p, authorProfile: profile } : p);
  await this.saveProjectOnly();
}

// Guarda solo project.json sin tocar los documentos
private async saveProjectOnly(): Promise<void> {
  const project  = this.project();
  const basePath = this.basePath();
  if (!project || !basePath) return;
  const updated = { ...project, updatedAt: new Date().toISOString() };
  await this.bridge.writeJsonFile(
    projectJsonPath(basePath),
    JSON.stringify(updated, null, 2),
  );
  this.project.set(updated);
}
```

---

## Parte 2: SearchService

### `src/app/core/services/search.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { DocumentFile }       from '../models/document.model';
import { TreeNode }           from '../models/project.model';
import { tiptapToText }       from '../../shared/utils/tiptap-to-text';
import { documentPath, documentsFolderPath } from '../../shared/utils/project-paths';

export interface SearchResult {
  documentId:    string;
  documentTitle: string;
  matches:       SearchMatch[];
}

export interface SearchMatch {
  context:    string;
  matchIndex: number;
}

const CONTEXT_RADIUS = 60;
const MAX_MATCHES_PER_DOC = 5;

@Injectable({ providedIn: 'root' })
export class SearchService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  private textCache = new Map<string, string>();

  invalidate(documentId: string): void {
    this.textCache.delete(documentId);
  }

  async search(query: string, wholeWord = true): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const basePath = this.project.basePath();
    if (!basePath) return [];

    const ids     = await this.bridge.listJsonFiles(documentsFolderPath(basePath));
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = wholeWord
      ? new RegExp(`\\b${escaped}\\b`, 'gi')
      : new RegExp(escaped, 'gi');

    const results: SearchResult[] = [];

    for (const id of ids) {
      const text    = await this.getDocumentText(basePath, id);
      const title   = this.getDocumentTitle(id);
      const matches = this.findMatches(text, pattern);
      if (matches.length > 0) {
        results.push({ documentId: id, documentTitle: title, matches });
      }
    }

    return results;
  }

  private async getDocumentText(basePath: string, id: string): Promise<string> {
    if (this.textCache.has(id)) return this.textCache.get(id)!;
    try {
      const raw  = await this.bridge.readJsonFile(documentPath(basePath, id));
      const doc: DocumentFile = JSON.parse(raw);
      const text = tiptapToText(doc.content);
      this.textCache.set(id, text);
      return text;
    } catch { return ''; }
  }

  private getDocumentTitle(id: string): string {
    const node = this.findNode(this.project.project()?.tree ?? [], id);
    return node?.title ?? id;
  }

  private findNode(tree: TreeNode[], id: string): TreeNode | null {
    for (const n of tree) {
      if (n.id === id) return n;
      const found = this.findNode(n.children, id);
      if (found) return found;
    }
    return null;
  }

  private findMatches(text: string, pattern: RegExp): SearchMatch[] {
    const matches: SearchMatch[] = [];
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      const start   = Math.max(0, match.index - CONTEXT_RADIUS);
      const end     = Math.min(text.length, match.index + match[0].length + CONTEXT_RADIUS);
      const context = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
      matches.push({ context, matchIndex: match.index });
      if (matches.length >= MAX_MATCHES_PER_DOC) break;
    }

    return matches;
  }
}
```

---

## Parte 3: BinderFooterComponent

### `src/app/features/editor/binder/binder-footer.component.ts`

```typescript
import { Component, inject, input, output } from '@angular/core';
import { ProjectService } from '../../../core/services/project.service';

@Component({
  selector: 'app-binder-footer',
  standalone: true,
  template: `
    <div class="flex items-center justify-between px-3 py-2
                border-t border-ink-border bg-ink-panel shrink-0">
      <span class="text-ink-subtle text-xs">
        {{ formatCount(projectService.totalWordCount()) }}
      </span>
      <button
        (click)="searchToggled.emit()"
        title="Buscar en el proyecto (Ctrl+Shift+F)"
        class="p-1 rounded text-ink-subtle hover:text-ink-text
               hover:bg-ink-border transition-colors"
        [class.text-ink-accent]="searchActive()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </button>
    </div>
  `,
})
export class BinderFooterComponent {
  projectService = inject(ProjectService);
  searchActive   = input<boolean>(false);
  searchToggled  = output<void>();

  formatCount(n: number): string {
    if (n === 0) return 'Proyecto vacío';
    if (n < 1000) return `${n} palabras`;
    return `${(n / 1000).toFixed(1).replace('.', ',')}k palabras`;
  }
}
```

---

## Parte 4: BinderSearchComponent

### `src/app/features/editor/binder/binder-search.component.ts`

```typescript
import {
  Component, inject, output, signal, computed, OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SearchService, SearchResult } from '../../../core/services/search.service';

@Component({
  selector: 'app-binder-search',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-col h-full">

      <!-- Input -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-ink-border shrink-0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" class="text-ink-subtle shrink-0">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          [(ngModel)]="query"
          (ngModelChange)="onQueryChange()"
          placeholder="Buscar en el proyecto..."
          class="flex-1 bg-transparent text-ink-text text-sm
                 focus:outline-none placeholder:text-ink-muted"/>
        <button (click)="closed.emit()"
          class="p-0.5 rounded text-ink-subtle hover:text-ink-text transition-colors">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586 5.207
                     2.793a1 1 0 0 0-1.414 1.414L6.586 7l-2.793 2.793a1
                     1 0 1 0 1.414 1.414L8 8.414l2.793 2.793a1 1 0 0 0
                     1.414-1.414L9.414 7l2.793-2.793z"/>
          </svg>
        </button>
      </div>

      <!-- Opciones + estado -->
      <div class="flex items-center gap-3 px-3 py-1.5 border-b border-ink-border shrink-0">
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" [(ngModel)]="wholeWord" (ngModelChange)="onQueryChange()"
                 class="accent-ink-accent w-3 h-3"/>
          <span class="text-ink-subtle text-xs">Palabra completa</span>
        </label>
        <span class="ml-auto text-ink-subtle text-xs">
          @if (searching()) { Buscando... }
          @else if (query && results().length === 0) { Sin resultados }
          @else if (results().length > 0) {
            {{ totalMatches() }} en {{ results().length }} doc.
          }
        </span>
      </div>

      <!-- Resultados -->
      <div class="flex-1 overflow-y-auto">
        @if (!query) {
          <p class="text-ink-muted text-xs text-center mt-8 px-4 leading-relaxed">
            Escribe para buscar en todos los documentos del proyecto
          </p>
        }
        @for (result of results(); track result.documentId) {
          <div class="border-b border-ink-border last:border-0">
            <button (click)="documentSelected.emit(result.documentId)"
              class="w-full flex items-center gap-2 px-3 py-2
                     hover:bg-ink-surface transition-colors text-left">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" class="text-ink-accent shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
              <span class="text-ink-text text-xs font-medium truncate flex-1">
                {{ result.documentTitle }}
              </span>
              <span class="text-ink-muted text-xs shrink-0">{{ result.matches.length }}</span>
            </button>
            @for (match of result.matches; track match.matchIndex) {
              <button (click)="documentSelected.emit(result.documentId)"
                class="w-full px-3 py-1.5 pl-7 hover:bg-ink-surface transition-colors text-left">
                <p class="text-ink-subtle text-xs leading-relaxed line-clamp-2"
                   [innerHTML]="highlight(match.context)"></p>
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class BinderSearchComponent implements OnDestroy {
  private svc = inject(SearchService);

  documentSelected = output<string>();
  closed           = output<void>();

  query     = '';
  wholeWord = true;
  results   = signal<SearchResult[]>([]);
  searching = signal(false);
  totalMatches = computed(() => this.results().reduce((s, r) => s + r.matches.length, 0));

  private timer: ReturnType<typeof setTimeout> | null = null;

  onQueryChange(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.query.trim()) { this.results.set([]); return; }
    this.timer = setTimeout(async () => {
      this.searching.set(true);
      try {
        this.results.set(await this.svc.search(this.query, this.wholeWord));
      } finally { this.searching.set(false); }
    }, 400);
  }

  highlight(context: string): string {
    if (!this.query.trim()) return context;
    const esc = this.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return context.replace(
      new RegExp(`(${esc})`, 'gi'),
      '<mark style="background:var(--ink-accent);color:var(--ink-panel);border-radius:2px;padding:0 1px">$1</mark>',
    );
  }

  ngOnDestroy(): void { if (this.timer) clearTimeout(this.timer); }
}
```

---

## Parte 5: Modificar BinderComponent

Añadir la alternancia árbol ↔ búsqueda y el footer:

```typescript
showSearch = signal(false);
```

Template — reemplazar el área de contenido:

```html
<div class="flex flex-col h-full bg-ink-panel border-r border-ink-border">

  <!-- Header existente -->
  <div class="flex items-center justify-between px-3 py-3 border-b border-ink-border shrink-0">
    ...
  </div>

  <!-- Árbol O búsqueda -->
  <div class="flex-1 overflow-hidden">
    @if (showSearch()) {
      <app-binder-search
        (documentSelected)="onSearchDocumentSelected($event)"
        (closed)="showSearch.set(false)"/>
    } @else {
      <div class="h-full overflow-y-auto py-2 px-1">
        <!-- árbol de documentos existente -->
      </div>
    }
  </div>

  <!-- Footer siempre visible -->
  <app-binder-footer
    [searchActive]="showSearch()"
    (searchToggled)="showSearch.update(v => !v)"/>
</div>
```

Añadir método:
```typescript
onSearchDocumentSelected(id: string): void {
  this.showSearch.set(false);
  const node = this.findNode(this.projectService.project()?.tree ?? [], id);
  if (node) this.documentOpened.emit(node);
}

private findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const found = this.findNode(n.children, id);
    if (found) return found;
  }
  return null;
}
```

### Atajo Ctrl+Shift+F en EditorLayoutComponent

Añadir `@ViewChild(BinderComponent) binder?: BinderComponent` y en el HostListener:

```typescript
if (event.ctrlKey && event.shiftKey && event.key === 'F') {
  event.preventDefault();
  this.binder?.showSearch.update(v => !v);
}
```

---

## Parte 6: AuthorProfileModalComponent

### `src/app/shared/components/author-profile-modal.component.ts`

```typescript
import { Component, inject, signal, OnInit, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../core/services/project.service';
import { AuthorProfile }  from '../../core/models/project.model';
import { InkModalComponent }  from './ink-modal.component';
import { InkButtonComponent } from './ink-button.component';

const DEFAULT_PROFILE: AuthorProfile = {
  legalName: '', email: '', genre: '',
  language: 'es', copyrightYear: new Date().getFullYear(),
};

@Component({
  selector: 'app-author-profile-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Perfil de autor" (closed)="closed.emit()">
      <div class="flex flex-col gap-4">
        <p class="text-ink-subtle text-xs leading-relaxed">
          Datos guardados con el proyecto. Se usan para pre-rellenar la exportación.
        </p>
        <div class="grid grid-cols-2 gap-3">

          <div class="flex flex-col gap-1 col-span-2">
            <label class="field-label">Nombre legal *</label>
            <input [(ngModel)]="profile.legalName" placeholder="Tu nombre completo"
                   class="field-input"/>
          </div>
          <div class="flex flex-col gap-1 col-span-2">
            <label class="field-label">Nombre de pluma</label>
            <input [(ngModel)]="penName" placeholder="Si difiere del nombre legal"
                   class="field-input"/>
          </div>
          <div class="flex flex-col gap-1">
            <label class="field-label">Email *</label>
            <input [(ngModel)]="profile.email" type="email" placeholder="tu@email.com"
                   class="field-input"/>
          </div>
          <div class="flex flex-col gap-1">
            <label class="field-label">Teléfono</label>
            <input [(ngModel)]="phone" placeholder="+34 600 000 000" class="field-input"/>
          </div>
          <div class="flex flex-col gap-1 col-span-2">
            <label class="field-label">Ciudad, País</label>
            <input [(ngModel)]="address" placeholder="Madrid, España" class="field-input"/>
          </div>
          <div class="flex flex-col gap-1 col-span-2">
            <label class="field-label">Agente literario</label>
            <input [(ngModel)]="agentName" placeholder="Nombre / agencia (si aplica)"
                   class="field-input"/>
          </div>
          <div class="flex flex-col gap-1">
            <label class="field-label">Género literario *</label>
            <input [(ngModel)]="profile.genre" placeholder="Novela, Thriller…"
                   class="field-input"/>
          </div>
          <div class="flex flex-col gap-1">
            <label class="field-label">Idioma</label>
            <select [(ngModel)]="profile.language" class="field-input">
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="ca">Català</option>
              <option value="gl">Galego</option>
              <option value="eu">Euskara</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
              <option value="pt">Português</option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="field-label">Año copyright</label>
            <input [(ngModel)]="profile.copyrightYear" type="number"
                   [min]="2000" [max]="2100" class="field-input"/>
          </div>
          <div class="flex flex-col gap-1">
            <label class="field-label">Editorial</label>
            <input [(ngModel)]="publisher" placeholder="Si ya tienes editorial"
                   class="field-input"/>
          </div>

        </div>
      </div>
      <ng-container slot="actions">
        <ink-button variant="ghost" (clicked)="closed.emit()">Cancelar</ink-button>
        <ink-button variant="primary" [disabled]="!canSave()" [loading]="saving()"
                    (clicked)="save()">
          Guardar perfil
        </ink-button>
      </ng-container>
    </ink-modal>
  `,
  styles: [`
    .field-label { color:var(--ink-subtle); font-size:.7rem; font-weight:500;
                   text-transform:uppercase; letter-spacing:.05em; }
    .field-input { width:100%; padding:.4rem .6rem; border-radius:.25rem;
                   background:var(--ink-bg); border:1px solid var(--ink-border);
                   color:var(--ink-text); font-size:.8rem; }
    .field-input:focus { outline:none; border-color:var(--ink-accent); }
    .field-input::placeholder { color:var(--ink-muted); }
  `],
})
export class AuthorProfileModalComponent implements OnInit {
  private projectService = inject(ProjectService);
  closed = output<void>();

  profile: AuthorProfile = { ...DEFAULT_PROFILE };
  saving = signal(false);
  penName = ''; phone = ''; address = ''; agentName = ''; publisher = '';

  ngOnInit(): void {
    const p = this.projectService.project()?.authorProfile;
    if (p) {
      this.profile   = { ...p };
      this.penName   = p.penName   ?? '';
      this.phone     = p.phone     ?? '';
      this.address   = p.address   ?? '';
      this.agentName = p.agentName ?? '';
      this.publisher = p.publisher ?? '';
    }
  }

  canSave(): boolean {
    return !!(this.profile.legalName.trim() && this.profile.email.trim() && this.profile.genre.trim());
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.projectService.updateAuthorProfile({
        ...this.profile,
        penName:   this.penName   || undefined,
        phone:     this.phone     || undefined,
        address:   this.address   || undefined,
        agentName: this.agentName || undefined,
        publisher: this.publisher || undefined,
      });
      this.closed.emit();
    } finally { this.saving.set(false); }
  }
}
```

**Añadir botón en `InkNavComponent`** (solo con proyecto abierto):

```html
@if (projectService.isLoaded()) {
  <button (click)="showAuthorProfile.set(true)" title="Perfil de autor" class="nav-icon">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  </button>
}
@if (showAuthorProfile()) {
  <app-author-profile-modal (closed)="showAuthorProfile.set(false)"/>
}
```

**Actualizar `StepMetadataComponent` (INK-10)** para pre-rellenar desde el perfil en `ngOnInit()`.

---

## Parte 7: SynopsisModalComponent

### `src/app/features/editor/synopsis/synopsis-modal.component.ts`

```typescript
import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DocumentFile }    from '../../../core/models/document.model';
import { DocumentService } from '../../../core/services/document.service';
import { AiService }       from '../../../core/services/ai.service';
import { ProjectService }  from '../../../core/services/project.service';
import { ToastService }    from '../../../shared/services/toast.service';
import { tiptapToText }    from '../../../shared/utils/tiptap-to-text';
import { InkModalComponent }  from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';

@Component({
  selector: 'app-synopsis-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal [title]="'Sinopsis — ' + document().title" (closed)="closed.emit()">
      <div class="flex flex-col gap-4">
        <p class="text-ink-subtle text-xs leading-relaxed">
          Sinopsis breve del capítulo. Visible en la vista narrativa (INK-15).
        </p>
        <div class="flex flex-col gap-2">
          <textarea
            [(ngModel)]="synopsisText"
            placeholder="Escribe una sinopsis concisa de este capítulo..."
            rows="5" maxlength="500"
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-sm placeholder:text-ink-muted resize-none
                   focus:outline-none focus:border-ink-accent transition-colors">
          </textarea>
          <div class="flex items-center justify-between">
            <span class="text-ink-muted text-xs">{{ synopsisText.length }} / 500</span>
            @if (ai.hasApiKey()) {
              <button
                (click)="generateWithAi()"
                [disabled]="generating() || !hasContent()"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium
                       border border-ink-accent text-ink-accent
                       hover:bg-ink-accent hover:text-ink-panel transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed">
                @if (generating()) {
                  <span class="inline-block w-3 h-3 border border-current
                               border-t-transparent rounded-full animate-spin"></span>
                } @else {
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                }
                {{ generating() ? 'Generando...' : 'Generar con IA' }}
              </button>
            } @else {
              <span class="text-ink-muted text-xs">Configura la API key para usar IA</span>
            }
          </div>
          @if (!hasContent() && ai.hasApiKey()) {
            <p class="text-ink-warning text-xs">El documento está vacío.</p>
          }
        </div>
      </div>
      <ng-container slot="actions">
        <ink-button variant="ghost" (clicked)="closed.emit()">Cancelar</ink-button>
        <ink-button variant="primary" [loading]="saving()" (clicked)="save()">Guardar</ink-button>
      </ng-container>
    </ink-modal>
  `,
})
export class SynopsisModalComponent implements OnInit {
  private docService = inject(DocumentService);
  private project    = inject(ProjectService);
  private toast      = inject(ToastService);
  ai = inject(AiService);

  document  = input.required<DocumentFile>();
  saved     = output<DocumentFile>();
  closed    = output<void>();

  synopsisText = '';
  generating   = signal(false);
  saving       = signal(false);

  ngOnInit(): void { this.synopsisText = this.document().synopsis ?? ''; }

  hasContent(): boolean {
    return tiptapToText(this.document().content).trim().length > 50;
  }

  async generateWithAi(): Promise<void> {
    this.generating.set(true);
    try {
      const docText = tiptapToText(this.document().content);
      const project = this.project.project()?.name ?? '';
      const systemPrompt = `Eres un asistente literario experto.
Genera una sinopsis concisa de 2-3 frases para el capítulo proporcionado.
Captura los eventos principales, el arco emocional y las consecuencias narrativas.
Responde ÚNICAMENTE con la sinopsis, sin introducción ni explicación.
Proyecto: ${project} | Capítulo: ${this.document().title}`;

      let full = '';
      for await (const chunk of this.ai.streamMessage(
        [{ role: 'user', content: docText }],
        'analyze',
        systemPrompt,
      )) {
        full += chunk;
        this.synopsisText = full;
      }
    } catch (e) {
      this.toast.error(`Error al generar la sinopsis: ${e}`);
    } finally { this.generating.set(false); }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const updated = await this.docService.saveDocument({
        ...this.document(),
        synopsis: this.synopsisText.trim() || undefined,
      });
      this.saved.emit(updated);
      this.closed.emit();
    } catch (e) {
      this.toast.error(`Error al guardar: ${e}`);
    } finally { this.saving.set(false); }
  }
}
```

---

## Parte 8: Botón de sinopsis en BinderNodeComponent

En el template de la fila del nodo, añadir junto al título (solo en documentos, visible en hover):

```html
@if (node().type === 'document') {
  <button
    (click)="synopsisRequested.emit(node()); $event.stopPropagation()"
    title="Sinopsis"
    class="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100
           transition-all text-ink-subtle hover:text-ink-accent">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  </button>
}
```

Nuevo output:
```typescript
synopsisRequested = output<TreeNode>();
```

Propagar en `BinderComponent` → `EditorLayoutComponent`.

En `EditorLayoutComponent`:
```typescript
synopsisDocument = signal<DocumentFile | null>(null);

async onSynopsisRequested(node: TreeNode): Promise<void> {
  const doc = await this.docService.loadDocument(node.id);
  this.synopsisDocument.set(doc);
}

onSynopsisSaved(doc: DocumentFile): void {
  if (this.activeDocument()?.id === doc.id) this.activeDocument.set(doc);
  this.synopsisDocument.set(null);
}
```

```html
@if (synopsisDocument()) {
  <app-synopsis-modal
    [document]="synopsisDocument()!"
    (saved)="onSynopsisSaved($event)"
    (closed)="synopsisDocument.set(null)"/>
}
```

---

## Criterios de aceptación

**Recuento global:**
- [ ] El footer del binder muestra el total de palabras del proyecto
- [ ] El total se actualiza al guardar cualquier documento
- [ ] Proyectos sin `wordCountCache` no fallan — muestran 0 e incrementan al guardar
- [ ] Formato: "1,2k palabras" para valores ≥ 1000; "Proyecto vacío" para 0

**Búsqueda:**
- [ ] El icono lupa en el footer alterna árbol ↔ búsqueda
- [ ] `Ctrl+Shift+F` hace lo mismo (nota: este atajo ya está usado para focus mode en INK-05 — cambiarlo a `Ctrl+P` o `Ctrl+F` con la búsqueda en el binder activo)
- [ ] Resultados aparecen tras 400ms de debounce
- [ ] "Palabra completa" activo por defecto — "Ana" no coincide con "Anabel"
- [ ] Sin "Palabra completa" — "Ana" sí coincide con "Anabel"
- [ ] El término aparece resaltado en los snippets de contexto
- [ ] Click en resultado abre el documento y cierra la búsqueda
- [ ] El contador muestra "N resultados en M documentos"

**Perfil de autor:**
- [ ] Botón en la nav abre la modal (solo con proyecto abierto)
- [ ] Guardar persiste en `project.json` bajo `authorProfile`
- [ ] Reabrir la modal pre-rellena los campos guardados
- [ ] El formulario de exportación (INK-10) pre-rellena campos desde el perfil

**Sinopsis:**
- [ ] El botón de lápiz aparece en hover sobre cada documento del binder
- [ ] La modal muestra el texto guardado si existe
- [ ] Guardar persiste en `documents/{id}.json`
- [ ] Sin contenido suficiente en el documento, "Generar con IA" está deshabilitado
- [ ] La generación muestra el texto progresivamente (streaming)
- [ ] El contador de caracteres (0/500) se actualiza en tiempo real
- [ ] Guardar una sinopsis vacía elimina el campo del JSON (no guarda string vacío)

---

## Conflicto de atajo de teclado a resolver

`Ctrl+Shift+F` está asignado en INK-05 a "toggle focus mode". En esta spec se usa para búsqueda. Resolver así:

- **Búsqueda**: `Ctrl+F` cuando el foco está en el binder, o `Ctrl+Shift+K` como atajo global
- **Focus mode**: mantiene `Ctrl+Shift+F`

Actualizar `EditorLayoutComponent` y documentar en la referencia de atajos de INK-13.

---

## Lo que NO hacer en esta spec

- No implementar resaltado del término dentro del editor TipTap (requiere extensión adicional)
- No añadir el objetivo de sesión al footer (INK-13)
- No mostrar la sinopsis en la vista narrativa (INK-15)
- No pre-rellenar ISBN ni sinopsis del proyecto en la exportación (son campos de EPUB específicos del perfil de exportación, no del perfil de autor)
