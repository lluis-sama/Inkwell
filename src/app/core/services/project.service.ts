import { Injectable, inject, signal, computed, Injector } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { AiService } from './ai.service';
import { AppConfigService } from './app-config.service';
import { Project, TreeNode, DEFAULT_PROJECT_SETTINGS, AuthorProfile, DocumentStatus } from '../models/project.model';
import { projectJsonPath, deskNotesFolderPath, deskNotePath } from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private bridge = inject(TauriBridgeService);
  private appConfig = inject(AppConfigService);
  private injector = inject(Injector);

  readonly project   = signal<Project | null>(null);
  readonly basePath  = signal<string | null>(null);
  readonly isLoaded  = computed(() => this.project() !== null);
  readonly totalWordCount = computed(() => {
    const cache = this.project()?.wordCountCache ?? {};
    return Object.values(cache).reduce((sum, n) => sum + n, 0);
  });

  async openProject(basePath: string): Promise<void> {
    const raw = await this.bridge.readJsonFile(projectJsonPath(basePath));
    const project: Project = JSON.parse(raw);
    if (project.wordCountCache === undefined) {
      project.wordCountCache = {};
    }
    this.basePath.set(basePath);
    this.project.set(project);
    await this.ensureDeskNotesFolder();
    const aiService = this.injector.get(AiService);
    await aiService.loadSession(basePath, project.id);
  }

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
      wordCountCache: {},
    };

    await this.bridge.writeJsonFile(
      projectJsonPath(basePath),
      JSON.stringify(project, null, 2),
    );

    this.basePath.set(basePath);
    this.project.set(project);
    await this.ensureDeskNotesFolder();
    return project;
  }

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

  async updateTree(tree: TreeNode[]): Promise<void> {
    this.project.update(p => p ? { ...p, tree } : p);
    await this.save();
  }

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

  async removeNode(id: string): Promise<void> {
    this.project.update(p =>
      p ? { ...p, tree: deleteNode(p.tree, id) } : p
    );
    await this.save();
  }

  async renameNode(id: string, title: string): Promise<void> {
    this.project.update(p =>
      p ? { ...p, tree: renameNode(p.tree, id, title) } : p
    );
    await this.save();
  }

  async updateSettings(settings: Partial<Project['settings']>): Promise<void> {
    this.project.update(p =>
      p ? { ...p, settings: { ...p.settings, ...settings } } : p
    );
    await this.save();
  }

  async updateWordCountCache(documentId: string, wordCount: number): Promise<void> {
    this.project.update(p =>
      p ? { ...p, wordCountCache: { ...p.wordCountCache, [documentId]: wordCount } } : p
    );
    await this.saveProjectOnly();
  }

  async updateAuthorProfile(profile: AuthorProfile): Promise<void> {
    this.project.update(p =>
      p ? { ...p, authorProfile: profile } : p
    );
    await this.saveProjectOnly();
  }

  async updateNodeStatus(id: string, status: DocumentStatus | undefined): Promise<void> {
    this.project.update(p =>
      p ? { ...p, tree: setNodeStatus(p.tree, id, status) } : p
    );
    await this.saveProjectOnly();
  }

  private async saveProjectOnly(): Promise<void> {
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

  closeProject(): void {
    const aiService = this.injector.get(AiService);
    aiService.messages.set([]);
    aiService.currentMode.set('analyze');
    this.project.set(null);
    this.basePath.set(null);
  }

  getRecentProjects(): Array<{ name: string; basePath: string; openedAt: string }> {
    return this.appConfig.getRecentProjects();
  }

  async addRecentProject(name: string, basePath: string): Promise<void> {
    await this.appConfig.addRecentProject(name, basePath);
  }

  async removeRecentProject(basePath: string): Promise<void> {
    await this.appConfig.removeRecentProject(basePath);
  }

  async ensureDeskNotesFolder(): Promise<void> {
    const basePath = this.basePath();
    if (!basePath) return;
    const exists = await this.bridge.folderExists(deskNotesFolderPath(basePath));
    if (!exists) {
      await this.bridge.createFolder(deskNotesFolderPath(basePath));
    }
  }

  async loadDeskNotesTree(): Promise<TreeNode[]> {
    const project = this.project();
    if (project?.deskTree && project.deskTree.length > 0) {
      return project.deskTree;
    }

    const basePath = this.basePath();
    if (!basePath) return [];
    const ids = await this.bridge.listJsonFiles(deskNotesFolderPath(basePath));
    const nodes: TreeNode[] = [];
    for (const id of ids) {
      try {
        const raw = await this.bridge.readJsonFile(deskNotePath(basePath, id));
        const doc = JSON.parse(raw);
        nodes.push({ id: doc.id, title: doc.title, type: 'document', children: [] });
      } catch {
      }
    }

    if (nodes.length > 0) {
      await this.updateDeskTree(nodes);
    }
    return nodes;
  }

  async updateDeskTree(tree: TreeNode[]): Promise<void> {
    this.project.update(p => p ? { ...p, deskTree: tree } : p);
    await this.save();
  }

  async addDeskNode(
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
      const deskTree = p.deskTree ?? [];
      const tree = parentId
        ? insertNode(deskTree, parentId, node)
        : [...deskTree, node];
      return { ...p, deskTree: tree };
    });

    await this.save();
    return node;
  }

  async removeDeskNode(id: string): Promise<void> {
    this.project.update(p => {
      if (!p) return p;
      const deskTree = p.deskTree ?? [];
      return { ...p, deskTree: this.deleteDeskNodeAndFlatten(deskTree, id) };
    });
    await this.save();
  }

  async renameDeskNode(id: string, title: string): Promise<void> {
    this.project.update(p => {
      if (!p) return p;
      const deskTree = p.deskTree ?? [];
      return { ...p, deskTree: renameNode(deskTree, id, title) };
    });
    await this.save();
  }

  async addDeskDocumentNode(node: TreeNode): Promise<void> {
    this.project.update(p => {
      if (!p) return p;
      const deskTree = p.deskTree ?? [];
      return { ...p, deskTree: [...deskTree, node] };
    });
    await this.save();
  }

  private flattenDocuments(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    for (const n of nodes) {
      if (n.type === 'document') result.push({ ...n, children: [] });
      else result.push(...this.flattenDocuments(n.children));
    }
    return result;
  }

  private deleteDeskNodeAndFlatten(tree: TreeNode[], id: string): TreeNode[] {
    const result: TreeNode[] = [];
    for (const n of tree) {
      if (n.id === id) {
        result.push(...this.flattenDocuments(n.children));
      } else {
        result.push({ ...n, children: this.deleteDeskNodeAndFlatten(n.children, id) });
      }
    }
    return result;
  }
}

export function insertNode(tree: TreeNode[], parentId: string, node: TreeNode): TreeNode[] {
  return tree.map(n => {
    if (n.id === parentId) {
      if (n.type === 'document') throw new Error('No se pueden añadir hijos a un documento');
      return { ...n, children: [...n.children, node] };
    }
    return { ...n, children: insertNode(n.children, parentId, node) };
  });
}

export function deleteNode(tree: TreeNode[], id: string): TreeNode[] {
  return tree
    .filter(n => n.id !== id)
    .map(n => ({ ...n, children: deleteNode(n.children, id) }));
}

function setNodeStatus(tree: TreeNode[], id: string, status: DocumentStatus | undefined): TreeNode[] {
  return tree.map(n => {
    if (n.id === id) return { ...n, status };
    return { ...n, children: setNodeStatus(n.children, id, status) };
  });
}

function renameNode(tree: TreeNode[], id: string, title: string): TreeNode[] {
  return tree.map(n => {
    if (n.id === id) return { ...n, title };
    return { ...n, children: renameNode(n.children, id, title) };
  });
}

export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

export function insertAfter(tree: TreeNode[], targetId: string, node: TreeNode): TreeNode[] {
  const result: TreeNode[] = [];
  for (const n of tree) {
    result.push({ ...n, children: insertAfter(n.children, targetId, node) });
    if (n.id === targetId) result.push(node);
  }
  return result;
}

export function insertInside(tree: TreeNode[], targetId: string, node: TreeNode): TreeNode[] {
  return tree.map(n => {
    if (n.id === targetId) {
      return { ...n, children: [node, ...n.children] };
    }
    return { ...n, children: insertInside(n.children, targetId, node) };
  });
}

export function isDescendant(tree: TreeNode[], ancestorId: string, nodeId: string): boolean {
  const ancestor = findNode(tree, ancestorId);
  if (!ancestor) return false;
  return findNode(ancestor.children, nodeId) !== null;
}
