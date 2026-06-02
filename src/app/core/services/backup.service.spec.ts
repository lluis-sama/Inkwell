import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';

import { BackupService } from './backup.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { ToastService } from '../../shared/services/toast.service';
import { Project } from '../models/project.model';

function makeMockZip() {
  const files: Record<string, string> = {};
  return {
    file: vi.fn((name: string, content: string) => {
      files[name] = content;
    }),
    generateAsync: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    _files: files,
  };
}

describe('BackupService', () => {
  let service: BackupService;
  let mockBridge: TauriBridgeService;
  let mockProjectSvc: ProjectService;
  let mockToast: ToastService;

  beforeEach(() => {
    mockBridge = {
      saveFileDialog: vi.fn().mockResolvedValue('/backup/test.zip'),
      readJsonFile: vi.fn().mockResolvedValue('{}'),
      listJsonFiles: vi.fn().mockResolvedValue([]),
      writeBinaryFile: vi.fn().mockResolvedValue(undefined),
    } as unknown as TauriBridgeService;

    mockProjectSvc = {
      project: signal<Project | null>({
        id: 'proj-1',
        name: 'My Novel',
        description: '',
        createdAt: '',
        updatedAt: '',
        tree: [],
        settings: {
          autosaveInterval: 30,
          maxSnapshots: 10,
          aiModel: 'claude-sonnet-4-20250514',
          spellcheck: true,
          aiProvider: 'anthropic',
        },
        wordCountCache: {},
      }),
      basePath: signal('/projects/my-novel'),
    } as unknown as ProjectService;

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
    } as unknown as ToastService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        BackupService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: ProjectService, useValue: mockProjectSvc },
        { provide: ToastService, useValue: mockToast },
      ],
    });

    service = TestBed.inject(BackupService);
  });

  it('devuelve temprano si no hay proyecto', async () => {
    mockProjectSvc.project.set(null);
    await service.createBackup();
    expect(mockBridge.saveFileDialog).not.toHaveBeenCalled();
  });

  it('devuelve temprano si usuario cancela diálogo', async () => {
    (mockBridge.saveFileDialog as any).mockResolvedValue(null);
    await service.createBackup();
    expect(mockBridge.writeBinaryFile).not.toHaveBeenCalled();
  });

  it('añade project.json al ZIP', async () => {
    const mockZip = makeMockZip();
    (service as any)._JSZip = vi.fn().mockReturnValue(mockZip);
    (mockBridge.readJsonFile as any).mockResolvedValue('{"name":"My Novel"}');

    await service.createBackup();

    expect(mockZip.file).toHaveBeenCalledWith('project.json', '{"name":"My Novel"}');
  });

  it('añade documentos al ZIP', async () => {
    const mockZip = makeMockZip();
    (service as any)._JSZip = vi.fn().mockReturnValue(mockZip);
    (mockBridge.listJsonFiles as any).mockImplementation((path: string) => {
      if (path.includes('documents')) return Promise.resolve(['doc-1', 'doc-2']);
      return Promise.resolve([]);
    });
    (mockBridge.readJsonFile as any).mockImplementation((path: string) => {
      if (path.includes('doc-1')) return Promise.resolve('{"title":"Doc 1"}');
      if (path.includes('doc-2')) return Promise.resolve('{"title":"Doc 2"}');
      return Promise.resolve('{}');
    });

    await service.createBackup();

    expect(mockZip.file).toHaveBeenCalledWith('documents/doc-1.json', '{"title":"Doc 1"}');
    expect(mockZip.file).toHaveBeenCalledWith('documents/doc-2.json', '{"title":"Doc 2"}');
  });

  it('añade boards al ZIP', async () => {
    const mockZip = makeMockZip();
    (service as any)._JSZip = vi.fn().mockReturnValue(mockZip);
    (mockBridge.listJsonFiles as any).mockImplementation((path: string) => {
      if (path.includes('boards')) return Promise.resolve(['board-1']);
      return Promise.resolve([]);
    });
    (mockBridge.readJsonFile as any).mockImplementation((path: string) => {
      if (path.includes('board')) return Promise.resolve('{"title":"Board 1"}');
      return Promise.resolve('{}');
    });

    await service.createBackup();

    expect(mockZip.file).toHaveBeenCalledWith('boards/board-1.json', '{"title":"Board 1"}');
  });

  it('llama writeBinaryFile con buffer generado', async () => {
    const mockZip = makeMockZip();
    const buffer = new ArrayBuffer(8);
    mockZip.generateAsync = vi.fn().mockResolvedValue(buffer);
    (service as any)._JSZip = vi.fn().mockReturnValue(mockZip);

    await service.createBackup();

    expect(mockBridge.writeBinaryFile).toHaveBeenCalledWith('/backup/test.zip', buffer);
  });

  it('notifica éxito vía toast', async () => {
    const mockZip = makeMockZip();
    (service as any)._JSZip = vi.fn().mockReturnValue(mockZip);

    await service.createBackup();

    expect(mockToast.success).toHaveBeenCalledOnce();
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Backup guardado'));
  });

  it('notifica error vía toast si falla', async () => {
    (mockBridge.saveFileDialog as any).mockResolvedValue('/backup/test.zip');
    (mockBridge.readJsonFile as any).mockRejectedValue(new Error('disk full'));

    await service.createBackup();

    expect(mockToast.error).toHaveBeenCalledOnce();
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });
});
