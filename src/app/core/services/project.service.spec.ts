import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, provideZonelessChangeDetection } from '@angular/core';

import {
  ProjectService,
  insertNode,
  deleteNode,
  findNode,
  insertAfter,
  insertInside,
  isDescendant,
} from './project.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { AppConfigService } from './app-config.service';
import { AiService } from './ai.service';
import { DEFAULT_APP_CONFIG } from '../models/app-config.model';
import { DEFAULT_PROJECT_SETTINGS, Project, TreeNode } from '../models/project.model';
import { projectJsonPath } from '../../shared/utils/project-paths';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(id: string, type: 'folder' | 'document', title = id): TreeNode {
  return { id, title, type, children: [] };
}

const mockProject = (overrides?: Partial<Project>): Project => ({
  id: 'p1',
  name: 'Test Project',
  description: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tree: [],
  settings: { ...DEFAULT_PROJECT_SETTINGS },
  wordCountCache: {},
  ...overrides,
});

// ─── Bloque A: funciones puras del árbol ─────────────────────────────────────

describe('funciones puras del árbol', () => {
  describe('insertNode', () => {
    it('inserta en raíz cuando parentId es un nodo raíz', () => {
      const root = makeNode('f1', 'folder');
      const child = makeNode('d1', 'document');

      const result = insertNode([root], 'f1', child);

      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('d1');
    });

    it('inserta en carpeta anidada a profundidad 2', () => {
      const inner = makeNode('f2', 'folder');
      const root: TreeNode = { ...makeNode('f1', 'folder'), children: [inner] };
      const child = makeNode('d1', 'document');

      const result = insertNode([root], 'f2', child);

      expect(findNode(result, 'f2')!.children[0].id).toBe('d1');
    });

    it('lanza al insertar hijo en un documento', () => {
      const root = makeNode('d1', 'document');
      const child = makeNode('x1', 'document');

      expect(() => insertNode([root], 'd1', child)).toThrow();
    });
  });

  describe('deleteNode', () => {
    it('elimina nodo de nivel 0', () => {
      const tree = [makeNode('a', 'folder'), makeNode('b', 'document')];

      const result = deleteNode(tree, 'a');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b');
    });

    it('elimina nodo anidado sin afectar hermanos', () => {
      const childA = makeNode('ca', 'document');
      const childB = makeNode('cb', 'document');
      const root: TreeNode = { ...makeNode('f1', 'folder'), children: [childA, childB] };

      const result = deleteNode([root], 'ca');

      expect(findNode(result, 'f1')!.children).toHaveLength(1);
      expect(findNode(result, 'cb')).not.toBeNull();
    });
  });

  describe('findNode', () => {
    it('encuentra nodo existente', () => {
      const node = makeNode('target', 'document');
      const tree = [{ ...makeNode('f1', 'folder'), children: [node] }];

      expect(findNode(tree, 'target')!.id).toBe('target');
    });

    it('devuelve null si no existe', () => {
      expect(findNode([], 'x')).toBeNull();
    });
  });

  describe('isDescendant', () => {
    it('devuelve true para nodo dentro de carpeta ancestro', () => {
      const child = makeNode('c1', 'document');
      const tree = [{ ...makeNode('a1', 'folder'), children: [{ ...makeNode('a2', 'folder'), children: [child] }] }];

      expect(isDescendant(tree, 'a1', 'c1')).toBe(true);
      expect(isDescendant(tree, 'a2', 'c1')).toBe(true);
    });

    it('devuelve false para nodo hermano o raíz', () => {
      const tree = [makeNode('r1', 'folder'), makeNode('r2', 'folder')];

      expect(isDescendant(tree, 'r1', 'r2')).toBe(false);
      expect(isDescendant(tree, 'r1', 'r1')).toBe(false);
    });
  });

  describe('insertAfter', () => {
    it('inserta nodo después del target en mismo nivel (raíz)', () => {
      const a = makeNode('a', 'folder');
      const b = makeNode('b', 'folder');
      const c = makeNode('c', 'document');
      const tree = [a, b];

      const result = insertAfter(tree, 'a', c);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('c');
      expect(result[2].id).toBe('b');
      expect(tree).toHaveLength(2);
    });

    it('funciona en profundidad anidada', () => {
      const f2 = makeNode('f2', 'folder');
      const f1: TreeNode = { ...makeNode('f1', 'folder'), children: [f2] };
      const tree = [f1];
      const node = makeNode('d1', 'document');

      const result = insertAfter(tree, 'f2', node);

      expect(findNode(result, 'f1')!.children).toHaveLength(2);
      expect(findNode(result, 'f1')!.children[1].id).toBe('d1');
    });

    it('no inserta si target no existe y no muta el árbol original', () => {
      const a = makeNode('a', 'folder');
      const tree = [a];
      const node = makeNode('c', 'document');

      const result = insertAfter(tree, 'x', node);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
      expect(tree[0]).toBe(a);
    });
  });

  describe('insertInside', () => {
    it('inserta como primer hijo de carpeta en raíz', () => {
      const f1 = makeNode('f1', 'folder');
      const tree = [f1];
      const node = makeNode('d1', 'document');

      const result = insertInside(tree, 'f1', node);

      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('d1');
      expect(f1.children).toHaveLength(0);
    });

    it('funciona en profundidad anidada', () => {
      const f2 = makeNode('f2', 'folder');
      const f1: TreeNode = { ...makeNode('f1', 'folder'), children: [f2] };
      const tree = [f1];
      const node = makeNode('d1', 'document');

      const result = insertInside(tree, 'f2', node);

      expect(findNode(result, 'f2')!.children).toHaveLength(1);
      expect(findNode(result, 'f2')!.children[0].id).toBe('d1');
    });
  });
});

// ─── Bloque B: ProjectService señales ────────────────────────────────────────

describe('ProjectService', () => {
  let service: ProjectService;
  let mockBridge: TauriBridgeService;
  let mockAppConfig: AppConfigService;
  let mockAiService: AiService;

  beforeEach(() => {
    mockBridge = {
      readJsonFile: vi.fn(),
      writeJsonFile: vi.fn().mockResolvedValue(undefined),
      folderExists: vi.fn().mockResolvedValue(true),
      createFolder: vi.fn().mockResolvedValue(undefined),
      listJsonFiles: vi.fn().mockResolvedValue([]),
    } as unknown as TauriBridgeService;

    mockAppConfig = {
      config: signal({ ...DEFAULT_APP_CONFIG }),
      addRecentProject: vi.fn().mockResolvedValue(undefined),
      removeRecentProject: vi.fn().mockResolvedValue(undefined),
      getRecentProjects: vi.fn().mockReturnValue([]),
    } as unknown as AppConfigService;

    mockAiService = {
      messages: signal([]),
      currentMode: signal('analyze'),
      loadSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as AiService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ProjectService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: AppConfigService, useValue: mockAppConfig },
        { provide: AiService, useValue: mockAiService },
      ],
    });

    service = TestBed.inject(ProjectService);
  });

  it('isLoaded() es false al inicio', () => {
    expect(service.isLoaded()).toBe(false);
  });

  it('isLoaded() es true tras openProject', async () => {
    const project = mockProject();
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(project));

    await service.openProject('/test/project');

    expect(service.isLoaded()).toBe(true);
    expect(service.project()?.id).toBe('p1');
  });

  it('totalWordCount() suma correctamente', () => {
    service.project.set(mockProject({ wordCountCache: { a: 100, b: 200 } }));

    expect(service.totalWordCount()).toBe(300);
  });

  it('closeProject() limpia señales', () => {
    service.project.set(mockProject());
    service.basePath.set('/test/project');

    service.closeProject();

    expect(service.project()).toBeNull();
    expect(service.basePath()).toBeNull();
  });
});
