import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { ImportService, ImportResult } from './import.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { DocumentService } from './document.service';
import { ToastService } from '../../shared/services/toast.service';
import { DocumentFile, EMPTY_TIPTAP_CONTENT } from '../models/document.model';

describe('ImportService', () => {
  let service: ImportService;
  let mockBridge: TauriBridgeService;
  let mockDocSvc: DocumentService;
  let mockToast: ToastService;
  let mockMarkedParse: ReturnType<typeof vi.fn>;
  let mockMammothConvert: ReturnType<typeof vi.fn>;
  let mockGenerateJSON: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockMarkedParse = vi.fn().mockReturnValue('<p>html</p>');
    mockMammothConvert = vi.fn().mockResolvedValue({ value: '<p>docx</p>', messages: [] });
    mockGenerateJSON = vi.fn().mockReturnValue({ type: 'doc', content: [] });

    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('uuid-123'),
    });

    mockBridge = {
      openFilesDialog: vi.fn(),
      readJsonFile: vi.fn(),
      readFileBytes: vi.fn(),
      convertOdtToDocx: vi.fn(),
      deleteJsonFile: vi.fn().mockResolvedValue(undefined),
    } as unknown as TauriBridgeService;

    mockDocSvc = {
      createDocument: vi.fn().mockImplementation((title: string, _parentId?: string | null) =>
        Promise.resolve({
          id: 'doc-1',
          title,
          content: EMPTY_TIPTAP_CONTENT,
          snapshots: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        } as DocumentFile),
      ),
      saveDocument: vi.fn().mockImplementation((doc: DocumentFile) => Promise.resolve(doc)),
    } as unknown as DocumentService;

    mockToast = {
      error: vi.fn(),
    } as unknown as ToastService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ImportService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: DocumentService, useValue: mockDocSvc },
        { provide: ToastService, useValue: mockToast },
      ],
    });

    service = TestBed.inject(ImportService);
    (service as any)._markedParse = mockMarkedParse;
    (service as any)._mammothConvert = mockMammothConvert;
    (service as any)._generateJSON = mockGenerateJSON;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('openAndImport', () => {
    it('devuelve [] si usuario cancela diálogo', async () => {
      (mockBridge.openFilesDialog as any).mockResolvedValue([]);
      const result = await service.openAndImport('folder-1');
      expect(result).toEqual([]);
      expect(mockBridge.openFilesDialog).toHaveBeenCalledWith(
        ['txt', 'md', 'docx', 'odt'],
        true,
      );
    });

    it('maneja error de un fichero y notifica toast', async () => {
      (mockBridge.openFilesDialog as any).mockResolvedValue([
        '/path/bad.exe',
        '/path/good.txt',
      ]);
      (mockBridge.readJsonFile as any).mockResolvedValue('Hello');

      const result = await service.openAndImport('folder-1');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Good');
      expect(mockDocSvc.createDocument).toHaveBeenCalledWith('Good', 'folder-1');
      expect(mockToast.error).toHaveBeenCalledOnce();
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('bad.exe'),
      );
    });
  });

  describe('importFile', () => {
    it('lanza error si extensión no soportada', async () => {
      await expect(service.importFile('/path/file.exe')).rejects.toThrow(
        'Formato no soportado: .exe',
      );
    });

    it('detecta extensión txt y delega a parser correcto', async () => {
      (mockBridge.readJsonFile as any).mockResolvedValue('Hello world');

      const result = await service.importFile('/path/my-file.txt', 'folder-1');

      expect(mockBridge.readJsonFile).toHaveBeenCalledWith('/path/my-file.txt');
      expect(mockDocSvc.createDocument).toHaveBeenCalledWith('My file', 'folder-1');
      expect(mockDocSvc.saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Hello world' }],
              },
            ],
          },
        }),
      );
      expect(result).toEqual<ImportResult>({
        documentId: 'doc-1',
        title: 'My file',
        warnings: [],
      });
    });

    it('detecta extensión md y delega a parser correcto', async () => {
      (mockBridge.readJsonFile as any).mockResolvedValue('# Hello');

      const result = await service.importFile('/path/my-file.md');

      expect(mockBridge.readJsonFile).toHaveBeenCalledWith('/path/my-file.md');
      expect(mockMarkedParse).toHaveBeenCalledWith('# Hello');
      expect(mockGenerateJSON).toHaveBeenCalledWith('<p>html</p>', [expect.any(Object)]);
      expect(mockDocSvc.createDocument).toHaveBeenCalledWith('My file', null);
      expect(result.warnings).toEqual([]);
    });

    it('detecta extensión docx y delega a parser correcto', async () => {
      (mockBridge.readFileBytes as any).mockResolvedValue([1, 2, 3]);

      const result = await service.importFile('/path/my-file.docx');

      expect(mockBridge.readFileBytes).toHaveBeenCalledWith('/path/my-file.docx');
      expect(mockMammothConvert).toHaveBeenCalledWith(
        expect.objectContaining({ arrayBuffer: expect.any(ArrayBuffer) }),
      );
      expect(mockGenerateJSON).toHaveBeenCalledWith('<p>docx</p>', [expect.any(Object)]);
      expect(result.warnings).toEqual([]);
    });

    it('detecta extensión odt y delega a parser correcto', async () => {
      (mockBridge.convertOdtToDocx as any).mockResolvedValue('/tmp/converted.docx');
      (mockBridge.readFileBytes as any).mockResolvedValue([4, 5, 6]);
      mockMammothConvert.mockResolvedValue({
        value: '<p>odt</p>',
        messages: [],
      });

      const result = await service.importFile('/path/my-file.odt');

      expect(mockBridge.convertOdtToDocx).toHaveBeenCalledWith('/path/my-file.odt');
      expect(mockBridge.readFileBytes).toHaveBeenCalledWith('/tmp/converted.docx');
      expect(mockBridge.deleteJsonFile).toHaveBeenCalledWith('/tmp/converted.docx');
      expect(mockGenerateJSON).toHaveBeenCalledWith('<p>odt</p>', [expect.any(Object)]);
      expect(result.warnings).toEqual([]);
    });

    it('extrae nombre limpio y capitaliza', async () => {
      (mockBridge.readJsonFile as any).mockResolvedValue('content');

      await service.importFile('/some/path/my-test_file.TXT');

      expect(mockDocSvc.createDocument).toHaveBeenCalledWith('My test file', null);
    });
  });

  describe('importTxt', () => {
    it('divide párrafos por doble salto de línea', async () => {
      (mockBridge.readJsonFile as any).mockResolvedValue('Line 1\nLine 2\n\nLine 3');

      const result = await (service as any).importTxt('/path/file.txt');

      expect(result).toEqual({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line 1' },
              { type: 'hardBreak' },
              { type: 'text', text: 'Line 2' },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Line 3' }],
          },
        ],
      });
    });

    it('maneja fichero vacío', async () => {
      (mockBridge.readJsonFile as any).mockResolvedValue('');

      const result = await (service as any).importTxt('/path/file.txt');

      expect(result).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    });
  });

  describe('importMarkdown', () => {
    it('convierte markdown a TipTap JSON', async () => {
      (mockBridge.readJsonFile as any).mockResolvedValue('# Hello');
      mockGenerateJSON.mockReturnValue({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 1 } }],
      });

      const result = await (service as any).importMarkdown('/path/file.md');

      expect(mockMarkedParse).toHaveBeenCalledWith('# Hello');
      expect(mockGenerateJSON).toHaveBeenCalledWith('<p>html</p>', [expect.any(Object)]);
      expect(result).toEqual({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 1 } }],
      });
    });
  });

  describe('importDocx', () => {
    it('pasa warnings de mammoth', async () => {
      (mockBridge.readFileBytes as any).mockResolvedValue([1, 2, 3]);
      mockMammothConvert.mockResolvedValue({
        value: '<p>warn</p>',
        messages: [
          { type: 'warning', message: 'warning-1' },
          { type: 'info', message: 'info-1' },
        ],
      });

      const result = await (service as any).importDocx('/path/file.docx');

      expect(result.warnings).toEqual(['warning-1']);
      expect(result.content).toEqual({ type: 'doc', content: [] });
    });
  });

  describe('importOdt', () => {
    it('usa conversión temporal y limpia fichero', async () => {
      (mockBridge.convertOdtToDocx as any).mockResolvedValue('/tmp/converted.docx');
      (mockBridge.readFileBytes as any).mockResolvedValue([4, 5, 6]);
      mockMammothConvert.mockResolvedValue({
        value: '<p>odt</p>',
        messages: [],
      });

      const result = await (service as any).importOdt('/path/file.odt');

      expect(mockBridge.convertOdtToDocx).toHaveBeenCalledWith('/path/file.odt');
      expect(mockBridge.readFileBytes).toHaveBeenCalledWith('/tmp/converted.docx');
      expect(mockBridge.deleteJsonFile).toHaveBeenCalledWith('/tmp/converted.docx');
      expect(result.content).toEqual({ type: 'doc', content: [] });
      expect(result.warnings).toEqual([]);
    });
  });
});
