import { Injectable, inject, signal, computed } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { Project, TreeNode, DEFAULT_PROJECT_SETTINGS } from '../models/project.model';
import { projectJsonPath } from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private bridge = inject(TauriBridgeService);

  readonly project   = signal<Project | null>(null);
  readonly basePath  = signal<string | null>(null);
  readonly isLoaded  = computed(() => this.project() !== null);

  async openProject(basePath: string): Promise<void> {
    const raw = await this.bridge.readJsonFile(projectJsonPath(basePath));
    const project: Project = JSON.parse(raw);
    this.basePath.set(basePath);
    this.project.set(project);
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
    };

    await this.bridge.writeJsonFile(
      projectJsonPath(basePath),
      JSON.stringify(project, null, 2),
    );

    this.basePath.set(basePath);
    this.project.set(project);
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

  closeProject(): void {
    this.project.set(null);
    this.basePath.set(null);
  }

  getRecentProjects(): Array<{ name: string; basePath: string; openedAt: string }> {
    const raw = localStorage.getItem('inkwell-recent-projects');
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  addRecentProject(name: string, basePath: string): void {
    const recent = this.getRecentProjects()
      .filter(p => p.basePath !== basePath)
      .slice(0, 9);
    recent.unshift({ name, basePath, openedAt: new Date().toISOString() });
    localStorage.setItem('inkwell-recent-projects', JSON.stringify(recent));
  }

  removeRecentProject(basePath: string): void {
    const recent = this.getRecentProjects().filter(p => p.basePath !== basePath);
    localStorage.setItem('inkwell-recent-projects', JSON.stringify(recent));
  }
}

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
