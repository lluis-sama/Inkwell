import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, computed, provideZonelessChangeDetection } from '@angular/core';

import { ConsistencyService } from './consistency.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { AiService } from './ai.service';
import { Project, TreeNode, DEFAULT_PROJECT_SETTINGS } from '../models/project.model';
import { DocumentFile } from '../models/document.model';
import { ConsistencyReport } from '../models/consistency.model';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTipTapContent(text: string): object {
  return {
    type: 'doc',
    content: text.split('\n').map(line => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}

function makeLongText(wordCount: number): string {
  return Array.from({ length: wordCount }, (_, i) => `palabra${i}`).join(' ');
}

function makeDoc(overrides?: Partial<DocumentFile>): DocumentFile {
  return {
    id: 'doc-1',
    title: 'Doc 1',
    content: makeTipTapContent(makeLongText(120)),
    snapshots: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as DocumentFile;
}

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    tree: [],
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    wordCountCache: {},
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConsistencyService', () => {
  let service: ConsistencyService;
  let mockBridge: TauriBridgeService;
  let mockProject: ProjectService;
  let mockAi: AiService;

  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('uuid-123'),
    });

    mockBridge = {
      readJsonFile: vi.fn(),
      writeJsonFile: vi.fn().mockResolvedValue(undefined),
      listJsonFiles: vi.fn().mockResolvedValue([]),
    } as unknown as TauriBridgeService;

    mockProject = {
      project: signal(makeProject()),
      basePath: signal('/test/project'),
      isLoaded: computed(() => true),
    } as unknown as ProjectService;

    mockAi = {
      callOnce: vi.fn().mockResolvedValue('Hechos extraídos.'),
    } as unknown as AiService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ConsistencyService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: ProjectService, useValue: mockProject },
        { provide: AiService, useValue: mockAi },
      ],
    });

    service = TestBed.inject(ConsistencyService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── documentCount ─────────────────────────────────────────────────────────

  it('documentCount cuenta solo documentos (no carpetas) del árbol', () => {
    mockProject.project.set(makeProject({
      tree: [
        { id: 'd1', title: 'Doc 1', type: 'document', children: [] },
        { id: 'f1', title: 'Folder 1', type: 'folder', children: [
          { id: 'd2', title: 'Doc 2', type: 'document', children: [] },
        ]},
        { id: 'd3', title: 'Doc 3', type: 'document', children: [] },
      ],
    }));

    expect(service.documentCount).toBe(3);
  });

  // ─── analyze() ─────────────────────────────────────────────────────────────

  it('analyze() setea isAnalyzing(true) al inicio y false al final', async () => {
    mockProject.project.set(makeProject({
      tree: [{ id: 'd1', title: 'Doc 1', type: 'document', children: [] }],
    }));
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDoc({ id: 'd1', title: 'Doc 1' })),
    );
    vi.mocked(mockAi.callOnce).mockResolvedValue(
      JSON.stringify({ summary: 'Sin inconsistencias.', issues: [] }),
    );

    const promise = service.analyze();
    expect(service.isAnalyzing()).toBe(true);

    await promise;
    expect(service.isAnalyzing()).toBe(false);
  });

  it('analyze() actualiza progress() durante fases', async () => {
    const setSpy = vi.spyOn(service.progress, 'set');
    const updateSpy = vi.spyOn(service.progress, 'update');

    mockProject.project.set(makeProject({
      tree: [{ id: 'd1', title: 'Doc 1', type: 'document', children: [] }],
    }));
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDoc({ id: 'd1', title: 'Doc 1' })),
    );
    vi.mocked(mockAi.callOnce).mockResolvedValue(
      JSON.stringify({ summary: 'Sin inconsistencias.', issues: [] }),
    );

    await service.analyze();

    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ phase: 'Preparando...' }));
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ phase: 'Cargando documentos...' }));
    expect(updateSpy).toHaveBeenCalledWith(expect.any(Function));
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ phase: 'Analizando: Doc 1' }));
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ phase: 'Buscando inconsistencias...' }));
  });

  it('analyze() salta documentos con < 100 palabras', async () => {
    mockProject.project.set(makeProject({
      tree: [
        { id: 'd-long', title: 'Long Doc', type: 'document', children: [] },
        { id: 'd-short', title: 'Short Doc', type: 'document', children: [] },
      ],
    }));

    vi.mocked(mockBridge.readJsonFile).mockImplementation(async (path: string) => {
      if (path.includes('d-long')) {
        return JSON.stringify(makeDoc({
          id: 'd-long',
          title: 'Long Doc',
          content: makeTipTapContent(makeLongText(120)),
        }));
      }
      if (path.includes('d-short')) {
        return JSON.stringify(makeDoc({
          id: 'd-short',
          title: 'Short Doc',
          content: makeTipTapContent(makeLongText(50)),
        }));
      }
      return '{}';
    });

    vi.mocked(mockAi.callOnce).mockResolvedValue(
      JSON.stringify({ summary: 'Sin inconsistencias.', issues: [] }),
    );

    const report = await service.analyze();

    const extractionCalls = vi.mocked(mockAi.callOnce).mock.calls.filter(
      ([, systemPrompt]) =>
        typeof systemPrompt === 'string' && systemPrompt.includes('asistente literario'),
    );

    expect(extractionCalls.length).toBe(1);
    expect(extractionCalls[0][0]).toContain('Long Doc');
    expect(report.documentsAnalyzed).toBe(2);
  });

  it('analyze() maneja error de IA por capítulo sin abortar todo', async () => {
    mockProject.project.set(makeProject({
      tree: [
        { id: 'd-ok', title: 'Ok Doc', type: 'document', children: [] },
        { id: 'd-fail', title: 'Fail Doc', type: 'document', children: [] },
      ],
    }));

    vi.mocked(mockBridge.readJsonFile).mockImplementation(async (path: string) => {
      if (path.includes('d-ok')) {
        return JSON.stringify(makeDoc({ id: 'd-ok', title: 'Ok Doc' }));
      }
      if (path.includes('d-fail')) {
        return JSON.stringify(makeDoc({ id: 'd-fail', title: 'Fail Doc' }));
      }
      return '{}';
    });

    vi.mocked(mockAi.callOnce).mockImplementation(async (userContent: string, systemPrompt: string) => {
      if (typeof systemPrompt === 'string' && systemPrompt.includes('asistente literario') && typeof userContent === 'string' && userContent.includes('Fail Doc')) {
        throw new Error('IA falló');
      }
      if (typeof systemPrompt === 'string' && systemPrompt.includes('editor literario experto en continuidad narrativa')) {
        return JSON.stringify({ summary: 'Sin inconsistencias.', issues: [] });
      }
      return 'Hechos ok.';
    });

    const report = await service.analyze();
    expect(report.summary).toBe('Sin inconsistencias.');
    expect(service.isAnalyzing()).toBe(false);
  });

  it('analyze() persiste reporte en disco vía writeJsonFile', async () => {
    mockProject.project.set(makeProject({
      tree: [{ id: 'd1', title: 'Doc 1', type: 'document', children: [] }],
    }));
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDoc({ id: 'd1', title: 'Doc 1' })),
    );
    vi.mocked(mockAi.callOnce).mockResolvedValue(
      JSON.stringify({ summary: 'Todo bien.', issues: [] }),
    );

    await service.analyze();

    expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
    const [pathArg, contentArg] = vi.mocked(mockBridge.writeJsonFile).mock.calls[0];
    expect(pathArg).toBe('/test/project/consistency-report.json');
    const parsed = JSON.parse(contentArg as string) as ConsistencyReport;
    expect(parsed.projectId).toBe('proj-1');
    expect(parsed.summary).toBe('Todo bien.');
  });

  it('analyze() setea lastReport() con resultado parseado', async () => {
    mockProject.project.set(makeProject({
      tree: [{ id: 'd1', title: 'Doc 1', type: 'document', children: [] }],
    }));
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDoc({ id: 'd1', title: 'Doc 1' })),
    );
    vi.mocked(mockAi.callOnce).mockResolvedValue(
      JSON.stringify({
        summary: 'Problema encontrado.',
        issues: [{
          severity: 'high',
          type: 'character-description',
          description: 'Ojos cambiaron de color.',
          documents: ['Doc 1'],
        }],
      }),
    );

    const report = await service.analyze();
    expect(service.lastReport()).toEqual(report);
    expect(service.lastReport()?.issues[0].description).toBe('Ojos cambiaron de color.');
  });

  it('analyze() maneja respuesta de IA malformada (fallback a JSON con error)', async () => {
    mockProject.project.set(makeProject({
      tree: [{ id: 'd1', title: 'Doc 1', type: 'document', children: [] }],
    }));
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDoc({ id: 'd1', title: 'Doc 1' })),
    );

    vi.mocked(mockAi.callOnce).mockImplementation(async (_userContent: string, systemPrompt: string) => {
      if (typeof systemPrompt === 'string' && systemPrompt.includes('editor literario experto en continuidad narrativa')) {
        return 'Esto no es JSON válido {';
      }
      return 'Hechos extraídos.';
    });

    const report = await service.analyze();
    expect(report.summary).toBe('Error al parsear el análisis. Inténtalo de nuevo.');
    expect(report.issues).toEqual([]);
    expect(report.documentsAnalyzed).toBe(1);
  });

  // ─── loadSavedReport() ─────────────────────────────────────────────────────

  it('loadSavedReport() lee y parsea reporte existente', async () => {
    const existingReport: ConsistencyReport = {
      projectId: 'proj-1',
      generatedAt: '2024-01-01T00:00:00.000Z',
      documentsAnalyzed: 3,
      summary: 'Resumen previo.',
      issues: [],
    };
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(existingReport));

    const result = await service.loadSavedReport();
    expect(result).toEqual(existingReport);
    expect(service.lastReport()).toEqual(existingReport);
    expect(mockBridge.readJsonFile).toHaveBeenCalledWith('/test/project/consistency-report.json');
  });

  it('loadSavedReport() devuelve null si no existe', async () => {
    vi.mocked(mockBridge.readJsonFile).mockRejectedValue(new Error('File not found'));

    const result = await service.loadSavedReport();
    expect(result).toBeNull();
    expect(service.lastReport()).toBeNull();
  });
});
