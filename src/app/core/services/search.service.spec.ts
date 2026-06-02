import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { SearchService } from './search.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { DocumentFile } from '../models/document.model';
import { Project, DEFAULT_PROJECT_SETTINGS } from '../models/project.model';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDocFile(id: string, title: string, text: string): DocumentFile {
  return {
    id,
    title,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    },
    snapshots: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Test Project',
    description: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tree: [],
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    wordCountCache: {},
    ...overrides,
  };
}

const BASE_PATH = '/test/project';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SearchService', () => {
  let service: SearchService;
  let projectService: ProjectService;
  let mockBridge: TauriBridgeService;

  beforeEach(() => {
    mockBridge = {
      readJsonFile: vi.fn(),
      listJsonFiles: vi.fn(),
    } as unknown as TauriBridgeService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        SearchService,
        ProjectService,
        { provide: TauriBridgeService, useValue: mockBridge },
      ],
    });

    service = TestBed.inject(SearchService);
    projectService = TestBed.inject(ProjectService);
  });

  it('search() devuelve [] con query vacía', async () => {
    const result = await service.search('');

    expect(result).toEqual([]);
    expect(mockBridge.listJsonFiles).not.toHaveBeenCalled();
  });

  it('search() devuelve [] sin proyecto abierto (basePath() null)', async () => {
    projectService.basePath.set(null);

    const result = await service.search('test');

    expect(result).toEqual([]);
    expect(mockBridge.listJsonFiles).not.toHaveBeenCalled();
  });

  it('search() encuentra matches simples en un documento', async () => {
    projectService.basePath.set(BASE_PATH);
    projectService.project.set(
      makeProject({
        tree: [
          { id: 'doc1', title: 'Document 1', type: 'document', children: [] },
        ],
      }),
    );

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue([
      `${BASE_PATH}/documents/doc1.json`,
    ]);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Document 1', 'hello world test')),
    );

    const result = await service.search('world');

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe('doc1');
    expect(result[0].documentTitle).toBe('Document 1');
    expect(result[0].matches).toHaveLength(1);
    expect(result[0].matches[0].matchIndex).toBe(6);
  });

  it('search() respeta límite de 5 matches por documento', async () => {
    projectService.basePath.set(BASE_PATH);
    projectService.project.set(
      makeProject({
        tree: [
          { id: 'doc1', title: 'Doc', type: 'document', children: [] },
        ],
      }),
    );

    const repeatedText = Array(10).fill('test').join(' ');
    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue([
      `${BASE_PATH}/documents/doc1.json`,
    ]);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Doc', repeatedText)),
    );

    const result = await service.search('test');

    expect(result[0].matches).toHaveLength(5);
  });

  it('search() extrae contexto con radius de 60 chars y elipsis', async () => {
    projectService.basePath.set(BASE_PATH);
    projectService.project.set(
      makeProject({
        tree: [
          { id: 'doc1', title: 'Doc', type: 'document', children: [] },
        ],
      }),
    );

    const prefix = 'a'.repeat(80);
    const suffix = 'b'.repeat(80);
    const text = `${prefix} TARGET ${suffix}`;
    const docFile = makeDocFile('doc1', 'Doc', text);

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue([
      `${BASE_PATH}/documents/doc1.json`,
    ]);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(docFile),
    );

    const result = await service.search('TARGET');

    const match = result[0].matches[0];
    expect(match.context.startsWith('…')).toBe(true);
    expect(match.context.endsWith('…')).toBe(true);
    expect(match.context).toContain('TARGET');
    expect(match.context.length).toBeLessThanOrEqual(
      60 + 'TARGET'.length + 60 + 2,
    );
  });

  it('search() usa coincidencia de palabra completa cuando wholeWord=true', async () => {
    projectService.basePath.set(BASE_PATH);
    projectService.project.set(
      makeProject({
        tree: [
          { id: 'doc1', title: 'Doc', type: 'document', children: [] },
        ],
      }),
    );

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue([
      `${BASE_PATH}/documents/doc1.json`,
    ]);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Doc', 'world worldview')),
    );

    const result = await service.search('world', true);

    expect(result[0].matches).toHaveLength(1);
  });

  it('search() usa regex parcial cuando wholeWord=false', async () => {
    projectService.basePath.set(BASE_PATH);
    projectService.project.set(
      makeProject({
        tree: [
          { id: 'doc1', title: 'Doc', type: 'document', children: [] },
        ],
      }),
    );

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue([
      `${BASE_PATH}/documents/doc1.json`,
    ]);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Doc', 'world worldview')),
    );

    const result = await service.search('world', false);

    expect(result[0].matches).toHaveLength(2);
  });

  it('search() escapa caracteres especiales en query', async () => {
    projectService.basePath.set(BASE_PATH);
    projectService.project.set(
      makeProject({
        tree: [
          { id: 'doc1', title: 'Doc', type: 'document', children: [] },
        ],
      }),
    );

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue([
      `${BASE_PATH}/documents/doc1.json`,
    ]);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Doc', 'test.file testXfile')),
    );

    const result = await service.search('test.file');

    expect(result[0].matches).toHaveLength(1);
    expect(result[0].matches[0].context).toContain('test.file');
  });

  it('invalidate() limpia caché de texto', async () => {
    projectService.basePath.set(BASE_PATH);
    projectService.project.set(
      makeProject({
        tree: [
          { id: 'doc1', title: 'Doc', type: 'document', children: [] },
        ],
      }),
    );

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue([
      `${BASE_PATH}/documents/doc1.json`,
    ]);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Doc', 'hello world')),
    );

    await service.search('hello');
    expect(mockBridge.readJsonFile).toHaveBeenCalledTimes(1);

    service.invalidate('doc1');
    await service.search('hello');
    expect(mockBridge.readJsonFile).toHaveBeenCalledTimes(2);
  });

  it('search() reutiliza caché en segunda búsqueda', async () => {
    projectService.basePath.set(BASE_PATH);
    projectService.project.set(
      makeProject({
        tree: [
          { id: 'doc1', title: 'Doc', type: 'document', children: [] },
        ],
      }),
    );

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue([
      `${BASE_PATH}/documents/doc1.json`,
    ]);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Doc', 'hello world')),
    );

    await service.search('hello');
    await service.search('world');

    expect(mockBridge.readJsonFile).toHaveBeenCalledTimes(1);
  });
});
