# INK-03 — Modelos y servicios core

## Objetivo

Definir todos los modelos TypeScript y los tres servicios core de la app: `ProjectService`, `DocumentService` y `BoardService`. Esta spec no tiene UI. Al finalizar, la lógica de negocio completa está implementada y testeable desde consola de navegador o desde los tests.

---

## Reglas de esta spec

- Sin componentes, sin templates, sin HTML.
- Los servicios usan signals para el estado. Sin `BehaviorSubject`, sin `Observable` salvo para eventos de usuario.
- Los servicios no llaman a `TauriBridgeService` directamente en el constructor. La carga es siempre explícita (llamada a un método `load*` o `open*`).
- `crypto.randomUUID()` para generar IDs. No instalar librerías de UUID externas.

---

## Parte 1: Modelos

### `src/app/core/models/project.model.ts`

```typescript
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;
  tree: TreeNode[];
  settings: ProjectSettings;
}

export interface TreeNode {
  id: string;
  title: string;
  type: 'folder' | 'document';
  children: TreeNode[];  // Siempre presente; vacío [] para nodos hoja
}

export interface ProjectSettings {
  autosaveInterval: number;  // segundos; 0 = desactivado
  maxSnapshots: number;      // default: 10
  aiModel: string;           // default: 'claude-sonnet-4-20250514'
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autosaveInterval: 30,
  maxSnapshots: 10,
  aiModel: 'claude-sonnet-4-20250514',
};
```

---

### `src/app/core/models/document.model.ts`

```typescript
export interface DocumentFile {
  id: string;
  title: string;
  content: object;        // TipTap JSON (ProseMirror document model)
  snapshots: Snapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface Snapshot {
  id: string;
  content: object;        // Copia completa del TipTap JSON
  createdAt: string;
  label?: string;         // Etiqueta opcional del usuario
}

export const EMPTY_TIPTAP_CONTENT: object = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};
```

---

### `src/app/core/models/board.model.ts`

```typescript
export interface BoardFile {
  id: string;
  title: string;
  cards: Card[];
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  title: string;
  body: string;     // Texto plano o markdown simple
  color: string;    // Hex; p.ej. '#313244'
  x: number;        // Posición en canvas (px)
  y: number;
  width: number;    // Default: 220
  height: number;   // Default: 160
}

export const DEFAULT_CARD_COLORS: string[] = [
  '#313244',  // surface0 (neutro)
  '#45475a',  // surface1
  '#4a3f6b',  // púrpura oscuro
  '#3b4f6b',  // azul oscuro
  '#3b5e4f',  // verde oscuro
  '#6b4a3b',  // terracota oscuro
];
```

---

## Parte 2: Utilidades de rutas

### `src/app/shared/utils/project-paths.ts`

Funciones puras para construir rutas de archivo. Usadas por los servicios.

```typescript
export function projectJsonPath(basePath: string): string {
  return `${basePath}/project.json`;
}

export function documentPath(basePath: string, id: string): string {
  return `${basePath}/documents/${id}.json`;
}

export function documentsFolderPath(basePath: string): string {
  return `${basePath}/documents`;
}

export function boardPath(basePath: string, id: string): string {
  return `${basePath}/boards/${id}.json`;
}

export function boardsFolderPath(basePath: string): string {
  return `${basePath}/boards`;
}
```

---

## Parte 3: ProjectService

### `src/app/core/services/project.service.ts`

```typescript
import { Injectable, inject, signal, computed } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { Project, TreeNode, DEFAULT_PROJECT_SETTINGS } from '../models/project.model';
import { projectJsonPath } from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private bridge = inject(TauriBridgeService);

  // ─── Estado ───────────────────────────────────────────────────────────────

  readonly project   = signal<Project | null>(null);
  readonly basePath  = signal<string | null>(null);
  readonly isLoaded  = computed(() => this.project() !== null);

  // ─── Abrir proyecto existente ─────────────────────────────────────────────

  /**
   * Carga un proyecto desde una ruta base en disco.
   * Lee project.json y actualiza los signals.
   * Lanza error si project.json no existe o está malformado.
   */
  async openProject(basePath: string): Promise<void> {
    const raw = await this.bridge.readJsonFile(projectJsonPath(basePath));
    const project: Project = JSON.parse(raw);
    this.basePath.set(basePath);
    this.project.set(project);
  }

  // ─── Crear proyecto nuevo ─────────────────────────────────────────────────

  /**
   * Crea la estructura de carpetas y project.json en basePath.
   * Actualiza los signals con el nuevo proyecto.
   */
  async createProject(basePath: string, name: string, description = ''): Promise<Project> {
    await this.bridge.createProjectStructure(basePath);

    const project: Project = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tree: [],
      settings: { ...DEFAULT_PROJECT_SETTINGS },
    };

    await this.bridge.writeJsonFile(
      projectJsonPath(basePath),
      JSON.stringify(project, null, 2),
    );

    this.basePath.set(basePath);
    this.project.set(project);
    return project;
  }

  // ─── Guardar ──────────────────────────────────────────────────────────────

  /**
   * Persiste el estado actual del proyecto en disco.
   * Actualiza updatedAt antes de guardar.
   */
  async save(): Promise<void> {
    const project = this.project();
    const basePath = this.basePath();
    if (!project || !basePath) return;

    const updated = { ...project, updatedAt: new Date().toISOString() };
    await this.bridge.writeJsonFile(
      projectJsonPath(basePath),
      JSON.stringify(updated, null, 2),
    );
    this.project.set(updated);
  }

  // ─── Árbol de documentos ──────────────────────────────────────────────────

  /**
   * Reemplaza el árbol completo y guarda.
   * Usar cuando se reordena el binder por drag & drop.
   */
  async updateTree(tree: TreeNode[]): Promise<void> {
    this.project.update(p => p ? { ...p, tree } : p);
    await this.save();
  }

  /**
   * Añade un nodo al árbol.
   * Si parentId es null, añade en la raíz.
   * Si parentId es el ID de una carpeta, añade como hijo de esa carpeta.
   * Los documentos no pueden tener hijos; si parentId apunta a un documento, lanza error.
   */
  async addNode(
    type: 'folder' | 'document',
    title: string,
    parentId: string | null = null,
  ): Promise<TreeNode> {
    const node: TreeNode = {
      id: crypto.randomUUID(),
      title,
      type,
      children: [],
    };

    this.project.update(p => {
      if (!p) return p;
      const tree = parentId
        ? insertNode(p.tree, parentId, node)
        : [...p.tree, node];
      return { ...p, tree };
    });

    await this.save();
    return node;
  }

  /**
   * Elimina un nodo del árbol por ID.
   * Si el nodo es una carpeta, elimina también todos sus descendientes.
   * No elimina los archivos de disco (eso es responsabilidad del llamador).
   */
  async removeNode(id: string): Promise<void> {
    this.project.update(p =>
      p ? { ...p, tree: deleteNode(p.tree, id) } : p
    );
    await this.save();
  }

  /**
   * Renombra un nodo en el árbol.
   */
  async renameNode(id: string, title: string): Promise<void> {
    this.project.update(p =>
      p ? { ...p, tree: renameNode(p.tree, id, title) } : p
    );
    await this.save();
  }

  /**
   * Actualiza los settings del proyecto y guarda.
   */
  async updateSettings(settings: Partial<Project['settings']>): Promise<void> {
    this.project.update(p =>
      p ? { ...p, settings: { ...p.settings, ...settings } } : p
    );
    await this.save();
  }

  /**
   * Cierra el proyecto activo (limpia los signals).
   */
  closeProject(): void {
    this.project.set(null);
    this.basePath.set(null);
  }

  // ─── Helpers para recentProjects (localStorage) ───────────────────────────

  getRecentProjects(): Array<{ name: string; basePath: string; openedAt: string }> {
    const raw = localStorage.getItem('inkwell-recent-projects');
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  addRecentProject(name: string, basePath: string): void {
    const recent = this.getRecentProjects()
      .filter(p => p.basePath !== basePath)   // elimina duplicados
      .slice(0, 9);                            // máximo 10 entradas
    recent.unshift({ name, basePath, openedAt: new Date().toISOString() });
    localStorage.setItem('inkwell-recent-projects', JSON.stringify(recent));
  }

  removeRecentProject(basePath: string): void {
    const recent = this.getRecentProjects().filter(p => p.basePath !== basePath);
    localStorage.setItem('inkwell-recent-projects', JSON.stringify(recent));
  }
}

// ─── Helpers de árbol (funciones puras, no exportadas) ────────────────────────

function insertNode(tree: TreeNode[], parentId: string, node: TreeNode): TreeNode[] {
  return tree.map(n => {
    if (n.id === parentId) {
      if (n.type === 'document') throw new Error('No se pueden añadir hijos a un documento');
      return { ...n, children: [...n.children, node] };
    }
    return { ...n, children: insertNode(n.children, parentId, node) };
  });
}

function deleteNode(tree: TreeNode[], id: string): TreeNode[] {
  return tree
    .filter(n => n.id !== id)
    .map(n => ({ ...n, children: deleteNode(n.children, id) }));
}

function renameNode(tree: TreeNode[], id: string, title: string): TreeNode[] {
  return tree.map(n => {
    if (n.id === id) return { ...n, title };
    return { ...n, children: renameNode(n.children, id, title) };
  });
}
```

---

## Parte 4: DocumentService

### `src/app/core/services/document.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { DocumentFile, Snapshot, EMPTY_TIPTAP_CONTENT } from '../models/document.model';
import { documentPath } from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async loadDocument(id: string): Promise<DocumentFile> {
    const basePath = this.requireBasePath();
    const raw = await this.bridge.readJsonFile(documentPath(basePath, id));
    return JSON.parse(raw) as DocumentFile;
  }

  async saveDocument(doc: DocumentFile): Promise<DocumentFile> {
    const basePath = this.requireBasePath();
    const updated = { ...doc, updatedAt: new Date().toISOString() };
    await this.bridge.writeJsonFile(
      documentPath(basePath, updated.id),
      JSON.stringify(updated, null, 2),
    );
    return updated;
  }

  /**
   * Crea un nuevo DocumentFile vacío en disco.
   * También añade el nodo al árbol del proyecto.
   */
  async createDocument(title: string, parentId: string | null = null): Promise<DocumentFile> {
    const node = await this.project.addNode('document', title, parentId);

    const doc: DocumentFile = {
      id: node.id,
      title,
      content: EMPTY_TIPTAP_CONTENT,
      snapshots: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.saveDocument(doc);
  }

  /**
   * Elimina el archivo de disco y el nodo del árbol.
   */
  async deleteDocument(id: string): Promise<void> {
    const basePath = this.requireBasePath();
    await this.bridge.deleteJsonFile(documentPath(basePath, id));
    await this.project.removeNode(id);
  }

  // ─── Snapshots ────────────────────────────────────────────────────────────

  /**
   * Añade un snapshot del estado actual del documento.
   * Si se supera maxSnapshots, elimina el más antiguo (FIFO).
   */
  createSnapshot(doc: DocumentFile, label?: string): DocumentFile {
    const maxSnapshots = this.project.project()?.settings.maxSnapshots ?? 10;

    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      content: structuredClone(doc.content),
      createdAt: new Date().toISOString(),
      label,
    };

    let snapshots = [...doc.snapshots, snapshot];

    // Aplicar límite FIFO
    if (snapshots.length > maxSnapshots) {
      snapshots = snapshots.slice(snapshots.length - maxSnapshots);
    }

    return { ...doc, snapshots };
  }

  /**
   * Restaura el contenido de un snapshot.
   * Guarda el estado actual como snapshot antes de restaurar (con label 'Antes de restaurar').
   * Retorna el documento actualizado (sin guardar en disco; el llamador debe llamar a saveDocument).
   */
  restoreSnapshot(doc: DocumentFile, snapshotId: string): DocumentFile {
    const snapshot = doc.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} no encontrado`);

    // Guardar estado actual antes de restaurar
    const withCurrentSnapshot = this.createSnapshot(doc, 'Antes de restaurar');

    return {
      ...withCurrentSnapshot,
      content: structuredClone(snapshot.content),
    };
  }

  /**
   * Elimina un snapshot por ID.
   * Retorna el documento actualizado (sin guardar en disco).
   */
  deleteSnapshot(doc: DocumentFile, snapshotId: string): DocumentFile {
    return {
      ...doc,
      snapshots: doc.snapshots.filter(s => s.id !== snapshotId),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private requireBasePath(): string {
    const basePath = this.project.basePath();
    if (!basePath) throw new Error('No hay ningún proyecto abierto');
    return basePath;
  }
}
```

---

## Parte 5: BoardService

### `src/app/core/services/board.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { BoardFile, Card, DEFAULT_CARD_COLORS } from '../models/board.model';
import { boardPath, boardsFolderPath } from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class BoardService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  // ─── CRUD de tableros ─────────────────────────────────────────────────────

  async loadBoard(id: string): Promise<BoardFile> {
    const basePath = this.requireBasePath();
    const raw = await this.bridge.readJsonFile(boardPath(basePath, id));
    return JSON.parse(raw) as BoardFile;
  }

  async saveBoard(board: BoardFile): Promise<BoardFile> {
    const basePath = this.requireBasePath();
    const updated = { ...board, updatedAt: new Date().toISOString() };
    await this.bridge.writeJsonFile(
      boardPath(basePath, updated.id),
      JSON.stringify(updated, null, 2),
    );
    return updated;
  }

  async createBoard(title: string): Promise<BoardFile> {
    const board: BoardFile = {
      id: crypto.randomUUID(),
      title,
      cards: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.saveBoard(board);
  }

  async deleteBoard(id: string): Promise<void> {
    const basePath = this.requireBasePath();
    await this.bridge.deleteJsonFile(boardPath(basePath, id));
  }

  /**
   * Lista todos los IDs de tableros del proyecto activo.
   */
  async listBoardIds(): Promise<string[]> {
    const basePath = this.requireBasePath();
    return this.bridge.listJsonFiles(boardsFolderPath(basePath));
  }

  // ─── CRUD de tarjetas ─────────────────────────────────────────────────────

  /**
   * Añade una tarjeta al tablero.
   * position: coordenadas iniciales en el canvas.
   * Retorna el tablero actualizado (sin guardar en disco; el llamador llama a saveBoard).
   */
  addCard(
    board: BoardFile,
    position: { x: number; y: number },
    title = 'Nueva tarjeta',
  ): BoardFile {
    const color = DEFAULT_CARD_COLORS[board.cards.length % DEFAULT_CARD_COLORS.length];

    const card: Card = {
      id: crypto.randomUUID(),
      title,
      body: '',
      color,
      x: position.x,
      y: position.y,
      width: 220,
      height: 160,
    };

    return { ...board, cards: [...board.cards, card] };
  }

  /**
   * Actualiza una tarjeta existente (contenido, posición o tamaño).
   * Retorna el tablero actualizado (sin guardar en disco).
   */
  updateCard(board: BoardFile, updatedCard: Card): BoardFile {
    return {
      ...board,
      cards: board.cards.map(c => c.id === updatedCard.id ? updatedCard : c),
    };
  }

  /**
   * Elimina una tarjeta del tablero.
   * Retorna el tablero actualizado (sin guardar en disco).
   */
  deleteCard(board: BoardFile, cardId: string): BoardFile {
    return {
      ...board,
      cards: board.cards.filter(c => c.id !== cardId),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private requireBasePath(): string {
    const basePath = this.project.basePath();
    if (!basePath) throw new Error('No hay ningún proyecto abierto');
    return basePath;
  }
}
```

---

## Parte 6: Barrel exports

### `src/app/core/models/index.ts`

```typescript
export * from './project.model';
export * from './document.model';
export * from './board.model';
```

### `src/app/core/services/index.ts`

```typescript
export * from './tauri-bridge.service';
export * from './theme.service';
export * from './project.service';
export * from './document.service';
export * from './board.service';
```

---

## Criterios de aceptación

Todos los criterios se verifican desde la consola de navegador en `tauri dev` o desde un componente de prueba temporal.

**ProjectService:**
- [ ] `createProject('/tmp/ink-test', 'Mi Novela')` crea `project.json` en disco con la estructura correcta
- [ ] `openProject('/tmp/ink-test')` carga el proyecto y actualiza los signals
- [ ] `addNode('folder', 'Parte I')` añade un nodo al árbol y guarda en disco
- [ ] `addNode('document', 'Capítulo 1', <id-de-parte-I>)` añade un hijo correctamente
- [ ] `addNode('document', 'Capítulo 2', <id-de-carpeta>)` añade otro hijo
- [ ] `removeNode(<id>)` elimina el nodo y sus descendientes del árbol
- [ ] `renameNode(<id>, 'Nuevo nombre')` actualiza el título en el árbol
- [ ] `getRecentProjects()` / `addRecentProject()` funcionan correctamente en localStorage

**DocumentService:**
- [ ] `createDocument('Capítulo 1')` crea el archivo en `documents/` y añade el nodo al árbol
- [ ] `loadDocument(<id>)` retorna el documento correcto
- [ ] `saveDocument(doc)` persiste cambios en disco
- [ ] `createSnapshot(doc)` añade un snapshot; el undécimo snapshot elimina el primero (FIFO)
- [ ] `restoreSnapshot(doc, snapshotId)` guarda el estado actual como snapshot y restaura el elegido
- [ ] `deleteDocument(<id>)` elimina el archivo de disco y el nodo del árbol

**BoardService:**
- [ ] `createBoard('Ideas generales')` crea el archivo en `boards/`
- [ ] `loadBoard(<id>)` retorna el tablero correcto
- [ ] `addCard(board, { x: 100, y: 100 })` añade una tarjeta con posición y color rotativo
- [ ] `updateCard(board, { ...card, title: 'Nuevo título' })` actualiza la tarjeta
- [ ] `deleteCard(board, cardId)` elimina la tarjeta del array
- [ ] `deleteBoard(<id>)` elimina el archivo de disco

---

## Lo que NO hacer en esta spec

- Sin componentes, sin templates, sin HTML
- Sin lógica de autosave con timers (eso va en INK-05 dentro del componente editor)
- Sin lógica de navegación entre rutas
- Sin integración con la API de IA
