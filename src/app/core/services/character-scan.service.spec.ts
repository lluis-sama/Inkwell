import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { CharacterScanService } from './character-scan.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { DocumentFile } from '../models/document.model';

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

const BASE_PATH = '/test/project';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CharacterScanService', () => {
  let service: CharacterScanService;
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
        CharacterScanService,
        ProjectService,
        { provide: TauriBridgeService, useValue: mockBridge },
      ],
    });

    service = TestBed.inject(CharacterScanService);
    projectService = TestBed.inject(ProjectService);
  });

  it('scanCharacter() devuelve [] si no hay proyecto', async () => {
    projectService.basePath.set(null);

    const result = await service.scanCharacter('John');

    expect(result).toEqual([]);
    expect(mockBridge.listJsonFiles).not.toHaveBeenCalled();
  });

  it('scanCharacter() devuelve [] si nombre vacío', async () => {
    projectService.basePath.set(BASE_PATH);

    const result = await service.scanCharacter('');

    expect(result).toEqual([]);
    expect(mockBridge.listJsonFiles).not.toHaveBeenCalled();
  });

  it('scanCharacter() encuentra menciones de personaje en un documento', async () => {
    projectService.basePath.set(BASE_PATH);

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue(['doc1']);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Chapter One', 'John walked into the room.')),
    );

    const result = await service.scanCharacter('John');

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe('doc1');
    expect(result[0].documentTitle).toBe('Chapter One');
    expect(result[0].matchCount).toBe(1);
  });

  it('scanCharacter() usa aliases incluyendo nombre principal', async () => {
    projectService.basePath.set(BASE_PATH);

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue(['doc1']);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Chapter One', 'Johnny was there. Later, John arrived.')),
    );

    const result = await service.scanCharacter('John', ['Johnny']);

    expect(result).toHaveLength(1);
    expect(result[0].matchCount).toBe(2);
  });

  it('scanCharacter() no cuenta substrings parciales (word boundary)', async () => {
    projectService.basePath.set(BASE_PATH);

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue(['doc1']);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Chapter One', 'Jonathan said hello to John.')),
    );

    const result = await service.scanCharacter('John');

    expect(result).toHaveLength(1);
    expect(result[0].matchCount).toBe(1);
  });

  it('scanCharacter() escapa caracteres especiales en aliases', async () => {
    projectService.basePath.set(BASE_PATH);

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue(['doc1']);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(makeDocFile('doc1', 'Chapter One', 'Mr. Smith arrived. MrXSmith did not.')),
    );

    const result = await service.scanCharacter('Mr. Smith');

    expect(result).toHaveLength(1);
    expect(result[0].matchCount).toBe(1);
  });

  it('scanCharacter() suma matchCount correctamente', async () => {
    projectService.basePath.set(BASE_PATH);

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue(['doc1']);
    vi.mocked(mockBridge.readJsonFile).mockResolvedValue(
      JSON.stringify(
        makeDocFile(
          'doc1',
          'Chapter One',
          'John entered. John looked around. John sat down.',
        ),
      ),
    );

    const result = await service.scanCharacter('John');

    expect(result).toHaveLength(1);
    expect(result[0].matchCount).toBe(3);
  });

  it('scanCharacter() ignora documentos no legibles (catch silencioso)', async () => {
    projectService.basePath.set(BASE_PATH);

    vi.mocked(mockBridge.listJsonFiles).mockResolvedValue(['doc1', 'doc2']);
    vi.mocked(mockBridge.readJsonFile).mockImplementation((path: string) => {
      if (path.includes('doc1')) {
        return Promise.resolve(
          JSON.stringify(makeDocFile('doc1', 'Good Doc', 'John was here.')),
        );
      }
      return Promise.reject(new Error('Read error'));
    });

    const result = await service.scanCharacter('John');

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe('doc1');
    expect(result[0].matchCount).toBe(1);
  });
});
