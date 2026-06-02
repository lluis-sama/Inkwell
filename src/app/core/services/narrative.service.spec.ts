import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';

import { NarrativeService, NarrativeCard } from './narrative.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { BoardService } from './board.service';
import { Project, TreeNode, DEFAULT_PROJECT_SETTINGS } from '../models/project.model';
import { DocumentFile } from '../models/document.model';
import { BoardFile, Card } from '../models/board.model';

function makeNode(
  id: string,
  type: 'folder' | 'document',
  title = id,
  children: TreeNode[] = [],
): TreeNode {
  return { id, title, type, children };
}

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tree: [],
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    wordCountCache: {},
    ...overrides,
  } as Project;
}

describe('NarrativeService', () => {
  let service: NarrativeService;
  let mockBridge: {
    readJsonFile: ReturnType<typeof vi.fn>;
  };
  let mockProjectService: {
    project: ReturnType<typeof signal<Project | null>>;
    basePath: ReturnType<typeof signal<string | null>>;
    isLoaded: ReturnType<typeof computed<boolean>>;
  };
  let mockBoardService: {
    listBoardIds: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockBridge = {
      readJsonFile: vi.fn(),
    };

    const projectSig = signal<Project | null>(null);
    const basePathSig = signal<string | null>(null);

    mockProjectService = {
      project: projectSig,
      basePath: basePathSig,
      isLoaded: computed(() => projectSig() !== null),
    };

    mockBoardService = {
      listBoardIds: vi.fn().mockResolvedValue([]),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        NarrativeService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: BoardService, useValue: mockBoardService },
      ],
    });

    service = TestBed.inject(NarrativeService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('devuelve [] si proyecto no cargado', async () => {
    mockProjectService.project.set(null);
    mockProjectService.basePath.set('/test/project');

    const result = await service.buildNarrativeCards();

    expect(result).toEqual([]);
  });

  it('devuelve [] si no hay basePath', async () => {
    mockProjectService.project.set(makeProject());
    mockProjectService.basePath.set(null);

    const result = await service.buildNarrativeCards();

    expect(result).toEqual([]);
  });

  it('incluye folders como isSection=true con wordCount=0', async () => {
    const tree: TreeNode[] = [makeNode('folder-1', 'folder', 'Capítulos')];

    mockProjectService.project.set(makeProject({ tree }));
    mockProjectService.basePath.set('/test/project');

    const result = await service.buildNarrativeCards();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'folder-1',
      title: 'Capítulos',
      synopsis: '',
      wordCount: 0,
      characters: [],
      isSection: true,
    } as NarrativeCard);
  });

  it('incluye documentos con wordCount del cache', async () => {
    const tree: TreeNode[] = [makeNode('doc-1', 'document', 'Capítulo 1')];

    mockProjectService.project.set(
      makeProject({
        tree,
        wordCountCache: { 'doc-1': 1500 },
      }),
    );
    mockProjectService.basePath.set('/test/project');

    const docFile: DocumentFile = {
      id: 'doc-1',
      title: 'Capítulo 1',
      content: {},
      snapshots: [],
      createdAt: '',
      updatedAt: '',
    };

    mockBridge.readJsonFile.mockImplementation((path: string) => {
      if (path.includes('documents/doc-1')) {
        return Promise.resolve(JSON.stringify(docFile));
      }
      return Promise.resolve('{}');
    });

    const result = await service.buildNarrativeCards();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('doc-1');
    expect(result[0].wordCount).toBe(1500);
    expect(result[0].isSection).toBe(false);
  });

  it('incluye personajes vinculados por appearsInChapters', async () => {
    const tree: TreeNode[] = [makeNode('doc-1', 'document', 'Capítulo 1')];

    mockProjectService.project.set(makeProject({ tree }));
    mockProjectService.basePath.set('/test/project');

    mockBoardService.listBoardIds.mockResolvedValue(['board-1']);

    const boardFile: BoardFile = {
      id: 'board-1',
      title: 'Personajes',
      cards: [
        {
          id: 'char-1',
          title: 'Alice',
          body: '',
          color: '#4a3f6b',
          type: 'character',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          characterData: {
            aliases: ['Alicia'],
            appearsInChapters: ['doc-1'],
          },
        } as Card,
      ],
      createdAt: '',
      updatedAt: '',
    };

    const docFile: DocumentFile = {
      id: 'doc-1',
      title: 'Capítulo 1',
      content: {},
      snapshots: [],
      createdAt: '',
      updatedAt: '',
    };

    mockBridge.readJsonFile.mockImplementation((path: string) => {
      if (path.includes('boards/board-1')) {
        return Promise.resolve(JSON.stringify(boardFile));
      }
      if (path.includes('documents/doc-1')) {
        return Promise.resolve(JSON.stringify(docFile));
      }
      return Promise.resolve('{}');
    });

    const result = await service.buildNarrativeCards();

    const docCard = result.find(c => c.id === 'doc-1');
    expect(docCard).toBeDefined();
    expect(docCard?.characters).toContain('Alice');
  });

  it('incluye synopsis del documento', async () => {
    const tree: TreeNode[] = [makeNode('doc-1', 'document', 'Capítulo 1')];

    mockProjectService.project.set(makeProject({ tree }));
    mockProjectService.basePath.set('/test/project');

    const docFile: DocumentFile = {
      id: 'doc-1',
      title: 'Capítulo 1',
      synopsis: 'Era una noche oscura y tormentosa.',
      content: {},
      snapshots: [],
      createdAt: '',
      updatedAt: '',
    };

    mockBridge.readJsonFile.mockImplementation((path: string) => {
      if (path.includes('documents/doc-1')) {
        return Promise.resolve(JSON.stringify(docFile));
      }
      return Promise.resolve('{}');
    });

    const result = await service.buildNarrativeCards();

    const docCard = result.find(c => c.id === 'doc-1');
    expect(docCard).toBeDefined();
    expect(docCard?.synopsis).toBe('Era una noche oscura y tormentosa.');
  });

  it('maneja error al leer documento (synopsis vacío)', async () => {
    const tree: TreeNode[] = [makeNode('doc-1', 'document', 'Capítulo 1')];

    mockProjectService.project.set(makeProject({ tree }));
    mockProjectService.basePath.set('/test/project');

    mockBridge.readJsonFile.mockRejectedValue(new Error('File not found'));

    const result = await service.buildNarrativeCards();

    const docCard = result.find(c => c.id === 'doc-1');
    expect(docCard).toBeDefined();
    expect(docCard?.synopsis).toBe('');
  });

  it('mantiene orden depth-first preorder del árbol', async () => {
    const tree: TreeNode[] = [
      makeNode('folder-1', 'folder', 'Parte 1', [
        makeNode('doc-1', 'document', 'Capítulo 1'),
        makeNode('doc-2', 'document', 'Capítulo 2'),
      ]),
      makeNode('folder-2', 'folder', 'Parte 2', [
        makeNode('doc-3', 'document', 'Capítulo 3'),
      ]),
    ];

    mockProjectService.project.set(makeProject({ tree }));
    mockProjectService.basePath.set('/test/project');

    const docFile: DocumentFile = {
      id: 'doc-x',
      title: 'Doc',
      content: {},
      snapshots: [],
      createdAt: '',
      updatedAt: '',
    };

    mockBridge.readJsonFile.mockResolvedValue(JSON.stringify(docFile));

    const result = await service.buildNarrativeCards();

    const ids = result.map(c => c.id);
    expect(ids).toEqual([
      'folder-1',
      'doc-1',
      'doc-2',
      'folder-2',
      'doc-3',
    ]);
  });
});
