import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, provideZonelessChangeDetection } from '@angular/core';

import { DocumentService } from './document.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { SearchService } from './search.service';
import { TranslocoService } from '@jsverse/transloco';
import { DocumentFile, EMPTY_TIPTAP_CONTENT } from '../models/document.model';
import { Project, DEFAULT_PROJECT_SETTINGS, TreeNode } from '../models/project.model';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDoc(overrides?: Partial<DocumentFile>): DocumentFile {
  return {
    id: 'doc-1',
    title: 'Test Doc',
    content: EMPTY_TIPTAP_CONTENT,
    snapshots: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: 'p1',
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

describe('DocumentService', () => {
  let service: DocumentService;
  let mockBridge: TauriBridgeService;
  let mockProject: ProjectService;
  let mockSearch: SearchService;
  let mockTransloco: TranslocoService;

  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('uuid-123'),
    });

    mockBridge = {
      readJsonFile: vi.fn(),
      writeJsonFile: vi.fn().mockResolvedValue(undefined),
      deleteJsonFile: vi.fn().mockResolvedValue(undefined),
    } as unknown as TauriBridgeService;

    mockProject = {
      project: signal(makeProject()),
      basePath: signal('/test/project'),
      updateWordCountCache: vi.fn().mockResolvedValue(undefined),
      removeNode: vi.fn().mockResolvedValue(undefined),
      addDeskDocumentNode: vi.fn().mockResolvedValue(undefined),
      addNode: vi.fn().mockResolvedValue({
        id: 'node-1',
        title: 'New Doc',
        type: 'document',
        children: [],
      } as TreeNode),
    } as unknown as ProjectService;

    mockSearch = {
      invalidate: vi.fn(),
    } as unknown as SearchService;

    mockTransloco = {
      translate: vi.fn((key: string, _params?: Record<string, unknown>) => key),
    } as unknown as TranslocoService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DocumentService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: ProjectService, useValue: mockProject },
        { provide: SearchService, useValue: mockSearch },
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    });

    service = TestBed.inject(DocumentService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── Funciones puras ─────────────────────────────────────────────────────

  describe('createSnapshot', () => {
    it('genera snapshot con id único y timestamp', () => {
      const doc = makeDoc();
      const result = service.createSnapshot(doc);

      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0].id).toBe('uuid-123');
      expect(result.snapshots[0].createdAt).toBeTypeOf('string');
      expect(result.snapshots[0].content).toEqual(doc.content);
    });

    it('usa maxSnapshots del proyecto (default 10 si no hay proyecto)', () => {
      mockProject.project.set(null);
      const doc = makeDoc({
        snapshots: Array.from({ length: 12 }, (_, i) => ({
          id: `s${i}`,
          content: {},
          createdAt: '2024-01-01T00:00:00.000Z',
        })),
      });
      const result = service.createSnapshot(doc);

      expect(result.snapshots).toHaveLength(10);
      expect(result.snapshots[0].id).toBe('s3');
      expect(result.snapshots[9].id).toBe('uuid-123');
    });

    it('elimina snapshots más antiguos al exceder límite', () => {
      mockProject.project.set(
        makeProject({ settings: { ...DEFAULT_PROJECT_SETTINGS, maxSnapshots: 3 } }),
      );
      const doc = makeDoc({
        snapshots: [
          { id: 'old-0', content: { v: 0 }, createdAt: '2024-01-01T00:00:00.000Z' },
          { id: 'old-1', content: { v: 1 }, createdAt: '2024-01-01T00:00:00.000Z' },
          { id: 'old-2', content: { v: 2 }, createdAt: '2024-01-01T00:00:00.000Z' },
          { id: 'old-3', content: { v: 3 }, createdAt: '2024-01-01T00:00:00.000Z' },
          { id: 'old-4', content: { v: 4 }, createdAt: '2024-01-01T00:00:00.000Z' },
        ],
      });
      const result = service.createSnapshot(doc);

      expect(result.snapshots).toHaveLength(3);
      expect(result.snapshots[0].id).toBe('old-3');
      expect(result.snapshots[1].id).toBe('old-4');
      expect(result.snapshots[2].id).toBe('uuid-123');
    });
  });

  describe('restoreSnapshot', () => {
    it('reemplaza contenido por snapshot', () => {
      const snapshotContent = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'restored' }] }],
      };
      const doc = makeDoc({
        snapshots: [
          {
            id: 'snap-1',
            content: snapshotContent,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
      const result = service.restoreSnapshot(doc, 'snap-1');

      expect(result.content).toEqual(snapshotContent);
    });

    it('crea snapshot automático del estado actual antes de restaurar', () => {
      const snapshotContent = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'restored' }] }],
      };
      const doc = makeDoc({
        content: EMPTY_TIPTAP_CONTENT,
        snapshots: [
          {
            id: 'snap-1',
            content: snapshotContent,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
      const result = service.restoreSnapshot(doc, 'snap-1');

      expect(result.snapshots).toHaveLength(2);
      expect(result.snapshots[0].id).toBe('snap-1');
      expect(result.snapshots[1].id).toBe('uuid-123');
      expect(result.snapshots[1].label).toBe('DOC.SNAPSHOT_LABEL');
      expect(result.snapshots[1].content).toEqual(EMPTY_TIPTAP_CONTENT);
    });

    it('lanza si snapshotId no existe', () => {
      const doc = makeDoc({ snapshots: [] });
      expect(() => service.restoreSnapshot(doc, 'nonexistent')).toThrow(
        'DOC.SNAPSHOT_NOT_FOUND',
      );
    });
  });

  describe('deleteSnapshot', () => {
    it('elimina snapshot por id', () => {
      const doc = makeDoc({
        snapshots: [
          { id: 'snap-1', content: {}, createdAt: '2024-01-01T00:00:00.000Z' },
          { id: 'snap-2', content: {}, createdAt: '2024-01-01T00:00:00.000Z' },
        ],
      });
      const result = service.deleteSnapshot(doc, 'snap-1');

      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0].id).toBe('snap-2');
    });
  });

  // ─── Async ───────────────────────────────────────────────────────────────

  describe('loadDocument', () => {
    it('parsea JSON y devuelve DocumentFile', async () => {
      const expected = makeDoc({ id: 'doc-2', title: 'Loaded' });
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(expected));

      const result = await service.loadDocument('doc-2');

      expect(result).toEqual(expected);
      expect(mockBridge.readJsonFile).toHaveBeenCalledWith(
        '/test/project/documents/doc-2.json',
      );
    });
  });

  describe('saveDocument', () => {
    it('actualiza updatedAt, llama writeJsonFile, invalida search, updatea word count cache', async () => {
      const doc = makeDoc({
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'hello world' }],
            },
          ],
        },
      });
      vi.mocked(mockBridge.writeJsonFile).mockResolvedValue(undefined);

      const result = await service.saveDocument(doc);

      expect(result.id).toBe('doc-1');
      expect(result.updatedAt).not.toBe(doc.updatedAt);
      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
      const [pathArg, contentArg] = vi.mocked(mockBridge.writeJsonFile).mock.calls[0];
      expect(pathArg).toBe('/test/project/documents/doc-1.json');
      expect(JSON.parse(contentArg as string)).toEqual(
        expect.objectContaining({ id: 'doc-1', updatedAt: result.updatedAt }),
      );
      expect(mockSearch.invalidate).toHaveBeenCalledWith('doc-1');
      expect(mockProject.updateWordCountCache).toHaveBeenCalledWith('doc-1', 2);
    });
  });

  describe('createDocument', () => {
    it('crea nodo vía project.addNode() y documento vacío', async () => {
      vi.mocked(mockProject.addNode).mockResolvedValue({
        id: 'new-node',
        title: 'My Doc',
        type: 'document',
        children: [],
      });
      vi.mocked(mockBridge.writeJsonFile).mockResolvedValue(undefined);

      const result = await service.createDocument('My Doc', 'folder-1');

      expect(mockProject.addNode).toHaveBeenCalledWith('document', 'My Doc', 'folder-1');
      expect(result.id).toBe('new-node');
      expect(result.title).toBe('My Doc');
      expect(result.content).toEqual(EMPTY_TIPTAP_CONTENT);
      expect(result.snapshots).toEqual([]);
    });
  });

  describe('deleteDocument', () => {
    it('borra fichero y elimina nodo del árbol', async () => {
      vi.mocked(mockBridge.deleteJsonFile).mockResolvedValue(undefined);
      vi.mocked(mockProject.removeNode).mockResolvedValue(undefined);

      await service.deleteDocument('doc-1');

      expect(mockBridge.deleteJsonFile).toHaveBeenCalledWith(
        '/test/project/documents/doc-1.json',
      );
      expect(mockProject.removeNode).toHaveBeenCalledWith('doc-1');
    });
  });

  describe('loadDeskDocument', () => {
    it('lee desde desk_notes', async () => {
      const expected = makeDoc({ id: 'desk-1', title: 'Desk Note' });
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(expected));

      const result = await service.loadDeskDocument('desk-1');

      expect(result).toEqual(expected);
      expect(mockBridge.readJsonFile).toHaveBeenCalledWith(
        '/test/project/desk_notes/desk-1.json',
      );
    });
  });

  describe('saveDeskDocument', () => {
    it('escribe en desk_notes', async () => {
      const doc = makeDoc({ id: 'desk-1' });
      vi.mocked(mockBridge.writeJsonFile).mockResolvedValue(undefined);

      await service.saveDeskDocument(doc);

      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
      const [pathArg] = vi.mocked(mockBridge.writeJsonFile).mock.calls[0];
      expect(pathArg).toBe('/test/project/desk_notes/desk-1.json');
    });
  });
});
