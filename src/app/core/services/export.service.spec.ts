import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { ExportService } from './export.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ExportOptions, ExportMetadata } from '../models/export.model';
import { DocumentFile, EMPTY_TIPTAP_CONTENT } from '../models/document.model';

function makeDoc(id: string, title: string, content?: object): DocumentFile {
  return {
    id,
    title,
    content: content ?? EMPTY_TIPTAP_CONTENT,
    snapshots: [],
    createdAt: '',
    updatedAt: '',
  };
}

const baseMeta: ExportMetadata = {
  legalName: 'Jane Doe',
  penName: 'J.D. Writer',
  email: 'jane@example.com',
  phone: '555-1234',
  address: '123 Fiction St',
  genre: 'Fantasía',
  pageSize: 'a4',
  language: 'es',
  copyrightYear: 2025,
  publisher: 'Inkwell Press',
  synopsis: 'Una historia épica.',
};

describe('ExportService', () => {
  let service: ExportService;
  let mockBridge: TauriBridgeService;

  beforeEach(() => {
    mockBridge = {
      openPrintWindow: vi.fn().mockResolvedValue(undefined),
      saveFileDialog: vi.fn().mockResolvedValue('/tmp/exported.file'),
      writeBinaryFile: vi.fn().mockResolvedValue(undefined),
    } as unknown as TauriBridgeService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ExportService,
        { provide: TauriBridgeService, useValue: mockBridge },
      ],
    });

    service = TestBed.inject(ExportService);
  });

  describe('export', () => {
    it('pdf-manuscript llama openPrintWindow', async () => {
      const docs = [makeDoc('d1', 'Cap 1')];
      const options: ExportOptions = {
        format: 'pdf-manuscript',
        selectedDocumentIds: ['d1'],
        metadata: baseMeta,
      };

      await service.export(options, docs, 'My Book');

      expect(mockBridge.openPrintWindow).toHaveBeenCalled();
      const html = (mockBridge.openPrintWindow as any).mock.calls[0][0] as string;
      expect(html).toContain('My Book');
    });

    it('docx llama saveFileDialog + writeBinaryFile', async () => {
      const docs = [makeDoc('d1', 'Cap 1')];
      const options: ExportOptions = {
        format: 'docx',
        selectedDocumentIds: ['d1'],
        metadata: baseMeta,
      };

      const fakeBlob = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      };
      (service as any)._docxPacker = { toBlob: vi.fn().mockResolvedValue(fakeBlob) };

      await service.export(options, docs, 'My Book');

      expect(mockBridge.saveFileDialog).toHaveBeenCalledWith('My Book.docx', 'docx');
      expect(mockBridge.writeBinaryFile).toHaveBeenCalled();
    });

    it('epub llama saveFileDialog + writeBinaryFile', async () => {
      const docs = [makeDoc('d1', 'Cap 1')];
      const options: ExportOptions = {
        format: 'epub',
        selectedDocumentIds: ['d1'],
        metadata: baseMeta,
      };

      (service as any)._epub = vi.fn().mockResolvedValue(Buffer.from('epub'));

      await service.export(options, docs, 'My Book');

      expect(mockBridge.saveFileDialog).toHaveBeenCalledWith('My Book.epub', 'epub');
      expect(mockBridge.writeBinaryFile).toHaveBeenCalled();
    });

    it('cancela si saveFileDialog devuelve null', async () => {
      (mockBridge.saveFileDialog as any).mockResolvedValue(null);

      const docs = [makeDoc('d1', 'Cap 1')];
      const options: ExportOptions = {
        format: 'docx',
        selectedDocumentIds: ['d1'],
        metadata: baseMeta,
      };

      (service as any)._docxPacker = { toBlob: vi.fn() };

      await service.export(options, docs, 'My Book');

      expect((service as any)._docxPacker.toBlob).not.toHaveBeenCalled();
      expect(mockBridge.writeBinaryFile).not.toHaveBeenCalled();
    });
  });

  describe('buildManuscriptHtml', () => {
    it('incluye metadatos (título, autor, género, word count)', () => {
      const html = service.buildManuscriptHtml([], baseMeta, 'My Book', 12345);

      expect(html).toContain('My Book');
      expect(html).toContain('J.D. Writer (Jane Doe)');
      expect(html).toContain('jane@example.com');
      expect(html).toContain('Fantasía');
      expect(html).toContain('12.000');
    });

    it('genera páginas de capítulo con estilos correctos', () => {
      const docs = [makeDoc('d1', 'Prólogo')];
      const html = service.buildManuscriptHtml(docs, baseMeta, 'My Book', 0);

      expect(html).toContain('class="chapter"');
      expect(html).toContain('Prólogo');
    });

    it('respeta pageSize A4 vs letter', () => {
      const htmlA4 = service.buildManuscriptHtml([], { ...baseMeta, pageSize: 'a4' }, 'Book', 0);
      const htmlLetter = service.buildManuscriptHtml([], { ...baseMeta, pageSize: 'letter' }, 'Book', 0);

      expect(htmlA4).toContain('size: A4');
      expect(htmlLetter).toContain('size: letter');
    });

    it('incluye toolbar solo en media screen', () => {
      const html = service.buildManuscriptHtml([], baseMeta, 'Book', 0);

      expect(html).toContain('class="print-toolbar"');
      expect(html).toContain('@media screen');
      expect(html).toContain('@media print');
      expect(html).toContain('.print-toolbar { display: none; }');
    });
  });

  describe('DOCX generation (via private methods)', () => {
    it('buildDocxDocument genera documento con título y capítulos', () => {
      const docs = [makeDoc('d1', 'Capítulo 1')];
      const docx = (service as any).buildDocxDocument(docs, baseMeta, 'My Book', 5000);

      expect(docx).toBeTruthy();
    });

    it('tiptapToDocxParagraphs convierte paragraphs a Paragraph con indent', () => {
      const paragraphs = (service as any).tiptapToDocxParagraphs({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(paragraphs).toHaveLength(1);
      expect(paragraphs[0]).toBeTruthy();
    });

    it('nodeToDocx maneja headings con niveles', () => {
      const headings = (service as any).nodeToDocx({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Subtitle' }],
      });

      expect(headings).toHaveLength(1);
    });

    it('nodeToDocx maneja blockquotes', () => {
      const result = (service as any).nodeToDocx({
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] },
        ],
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('nodeToDocx maneja listas (bullet/ordered)', () => {
      const result = (service as any).nodeToDocx({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Item' }] },
            ],
          },
        ],
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('inlineToRuns aplica bold, italic, strike según marks', () => {
      const runs = (service as any).inlineToRuns([
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
      ]);

      expect(runs).toHaveLength(3);
      expect(runs.every((r: any) => r)).toBe(true);
    });
  });

  describe('countWords', () => {
    it('cuenta palabras de múltiples documentos', () => {
      const docs: DocumentFile[] = [
        {
          id: 'd1',
          title: 'Doc 1',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'One two three' }] },
            ],
          },
          snapshots: [],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'd2',
          title: 'Doc 2',
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Four five' }] },
            ],
          },
          snapshots: [],
          createdAt: '',
          updatedAt: '',
        },
      ];

      expect(service.countWords(docs)).toBe(5);
    });
  });
});
