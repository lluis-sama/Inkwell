import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { signal } from '@angular/core';
import { TranscriptionService, TranscriptionResult } from './transcription.service';
import { ProjectService } from './project.service';
import { DocumentService } from './document.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { Project, ProjectSettings } from '../models/project.model';
import { DocumentFile } from '../models/document.model';

function createMockResponse(body: object, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function makeProject(overrides: any = {}): Project {
  const {
    tree, wordCountCache, id, name, description, createdAt, updatedAt,
    ...settingsOverrides
  } = overrides;

  return {
    id: id ?? 'proj-1',
    name: name ?? 'Test',
    description: description ?? '',
    createdAt: createdAt ?? new Date().toISOString(),
    updatedAt: updatedAt ?? new Date().toISOString(),
    tree: tree ?? [],
    settings: {
      autosaveInterval: 30,
      maxSnapshots: 10,
      aiModel: 'claude-sonnet-4-20250514',
      spellcheck: true,
      aiProvider: 'anthropic',
      ...settingsOverrides,
    } as ProjectSettings,
    wordCountCache: wordCountCache ?? {},
  };
}

describe('TranscriptionService', () => {
  let service: TranscriptionService;
  let mockProjectSvc: {
    project: ReturnType<typeof signal<Project | null>>;
    addNode: ReturnType<typeof vi.fn>;
  };
  let mockDocSvc: {
    createDocument: ReturnType<typeof vi.fn>;
    saveDocument: ReturnType<typeof vi.fn>;
  };
  let mockBridgeSvc: {
    readFileBytes: ReturnType<typeof vi.fn>;
  };
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();

    mockProjectSvc = {
      project: signal<Project | null>(null),
      addNode: vi.fn(),
    };
    mockDocSvc = {
      createDocument: vi.fn(),
      saveDocument: vi.fn(),
    };
    mockBridgeSvc = {
      readFileBytes: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TranscriptionService,
        { provide: ProjectService, useValue: mockProjectSvc },
        { provide: DocumentService, useValue: mockDocSvc },
        { provide: TauriBridgeService, useValue: mockBridgeSvc },
      ],
    });

    service = TestBed.inject(TranscriptionService);
    (service as any)._fetch = mockFetch;
  });

  it('isConfigured() false sin provider', () => {
    mockProjectSvc.project.set(makeProject({}));
    expect(service.isConfigured()).toBe(false);
  });

  it('isConfigured() true para openai/groq con apiKey', () => {
    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'openai', transcriptionApiKey: 'sk-123' }),
    );
    expect(service.isConfigured()).toBe(true);

    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'groq', transcriptionApiKey: 'gsk-123' }),
    );
    expect(service.isConfigured()).toBe(true);
  });

  it('isConfigured() true para local con endpoint', () => {
    mockProjectSvc.project.set(
      makeProject({
        transcriptionProvider: 'local',
        transcriptionEndpoint: 'http://localhost:8000',
      }),
    );
    expect(service.isConfigured()).toBe(true);
  });

  it('providerStatusMessage() refleja cada estado', () => {
    mockProjectSvc.project.set(makeProject({}));
    expect(service.providerStatusMessage()).toBe('Proveedor no configurado');

    mockProjectSvc.project.set(makeProject({ transcriptionProvider: 'openai' }));
    expect(service.providerStatusMessage()).toBe('API key de OpenAI no configurada');

    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'openai', transcriptionApiKey: 'sk-123' }),
    );
    expect(service.providerStatusMessage()).toBe('✓ OpenAI Whisper');

    mockProjectSvc.project.set(makeProject({ transcriptionProvider: 'groq' }));
    expect(service.providerStatusMessage()).toBe('API key de Groq no configurada');

    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'groq', transcriptionApiKey: 'gsk-123' }),
    );
    expect(service.providerStatusMessage()).toBe('✓ Groq Whisper');

    mockProjectSvc.project.set(makeProject({ transcriptionProvider: 'local' }));
    expect(service.providerStatusMessage()).toBe('URL del servidor no configurada');

    mockProjectSvc.project.set(
      makeProject({
        transcriptionProvider: 'local',
        transcriptionEndpoint: 'http://localhost:8000',
      }),
    );
    expect(service.providerStatusMessage()).toBe('✓ Local: http://localhost:8000');
  });

  it('transcribe() setea progreso en fases', async () => {
    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'openai', transcriptionApiKey: 'sk-123' }),
    );
    mockBridgeSvc.readFileBytes.mockResolvedValue([1, 2, 3]);

    let resolveFetch: (value: Response) => void = () => {};
    mockFetch.mockImplementation(() => new Promise(r => { resolveFetch = r; }));

    const promise = service.transcribe('/path/to/audio.mp3');
    expect(service.progress()).toBe('Leyendo archivo de audio...');

    await Promise.resolve();
    expect(service.progress()).toBe('Transcribiendo...');

    resolveFetch(createMockResponse({ text: 'hello' }));
    await promise;

    expect(service.progress()).toBe('');
  });

  it('transcribe() construye FormData correctamente', async () => {
    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'openai', transcriptionApiKey: 'sk-123' }),
    );
    mockBridgeSvc.readFileBytes.mockResolvedValue([1, 2, 3]);
    mockFetch.mockResolvedValue(createMockResponse({ text: 'hello world' }));

    await service.transcribe('/path/to/audio.mp3');

    const body = mockFetch.mock.calls[0][1]!.body as FormData;
    expect(body.get('model')).toBe('whisper-1');

    const file = body.get('file') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('audio.mp3');
  });

  it('transcribe() envía language si está configurado', async () => {
    mockProjectSvc.project.set(
      makeProject({
        transcriptionProvider: 'openai',
        transcriptionApiKey: 'sk-123',
        transcriptionLanguage: 'es',
      }),
    );
    mockBridgeSvc.readFileBytes.mockResolvedValue([1, 2, 3]);
    mockFetch.mockResolvedValue(createMockResponse({ text: 'hola' }));

    await service.transcribe('/audio.mp3');

    const body = mockFetch.mock.calls[0][1]!.body as FormData;
    expect(body.get('language')).toBe('es');
  });

  it('transcribe() usa endpoint correcto según provider', async () => {
    mockBridgeSvc.readFileBytes.mockResolvedValue([1, 2, 3]);
    mockFetch.mockResolvedValue(createMockResponse({ text: '' }));

    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'openai', transcriptionApiKey: 'sk-123' }),
    );
    await service.transcribe('/a.mp3');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.openai.com/v1/audio/transcriptions',
    );

    mockFetch.mockClear();

    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'groq', transcriptionApiKey: 'gsk-123' }),
    );
    await service.transcribe('/a.mp3');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.groq.com/openai/v1/audio/transcriptions',
    );

    mockFetch.mockClear();

    mockProjectSvc.project.set(
      makeProject({
        transcriptionProvider: 'local',
        transcriptionEndpoint: 'http://localhost:8000/',
      }),
    );
    await service.transcribe('/a.mp3');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:8000/v1/audio/transcriptions',
    );
  });

  it('transcribe() maneja error HTTP', async () => {
    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'openai', transcriptionApiKey: 'sk-123' }),
    );
    mockBridgeSvc.readFileBytes.mockResolvedValue([1, 2, 3]);
    mockFetch.mockResolvedValue(
      createMockResponse({ error: { message: 'Bad request' } }, false, 400),
    );

    await expect(service.transcribe('/a.mp3')).rejects.toThrow('Bad request');
    expect(service.isTranscribing()).toBe(false);
    expect(service.progress()).toBe('');
  });

  it('transcribe() devuelve durationMs > 0', async () => {
    mockProjectSvc.project.set(
      makeProject({ transcriptionProvider: 'openai', transcriptionApiKey: 'sk-123' }),
    );
    mockBridgeSvc.readFileBytes.mockResolvedValue([1, 2, 3]);
    mockFetch.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5));
      return createMockResponse({ text: 'hello' });
    });

    const result = await service.transcribe('/a.mp3');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('saveTranscriptionToProject() crea documento con header y contenido', async () => {
    const folderId = 'folder-1';
    mockProjectSvc.project.set(makeProject({}));
    mockProjectSvc.addNode.mockResolvedValue({
      id: folderId,
      title: 'Transcriptions',
      type: 'folder',
      children: [],
    });
    mockDocSvc.createDocument.mockResolvedValue({
      id: 'doc-1',
      title: 'audio — 2024-01-01 12:00',
      content: {},
      snapshots: [],
      createdAt: '',
      updatedAt: '',
    });
    mockDocSvc.saveDocument.mockImplementation((doc: DocumentFile) => Promise.resolve(doc));

    const result: TranscriptionResult = {
      text: 'Paragraph one.\n\nParagraph two.',
      sourceFile: 'audio.mp3',
      provider: 'openai',
      durationMs: 1500,
    };

    const node = await service.saveTranscriptionToProject(result);

    expect(mockDocSvc.createDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^audio — \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
      folderId,
    );

    const savedDoc = mockDocSvc.saveDocument.mock.calls[0][0] as DocumentFile;
    expect(savedDoc.content).toEqual(
      expect.objectContaining({
        type: 'doc',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'paragraph',
            content: expect.arrayContaining([
              expect.objectContaining({
                marks: [{ type: 'italic' }],
              }),
            ]),
          }),
          { type: 'horizontalRule' },
          expect.objectContaining({
            type: 'paragraph',
            content: [{ type: 'text', text: 'Paragraph one.' }],
          }),
          expect.objectContaining({
            type: 'paragraph',
            content: [{ type: 'text', text: 'Paragraph two.' }],
          }),
        ]),
      }),
    );
    expect(node.type).toBe('document');
  });

  it('saveTranscriptionToProject() reusa carpeta existente o crea nueva', async () => {
    mockProjectSvc.project.set(
      makeProject({
        tree: [
          { id: 'existing-folder', title: 'Transcriptions', type: 'folder', children: [] },
        ],
      }),
    );
    mockDocSvc.createDocument.mockResolvedValue({
      id: 'doc-1',
      title: 't',
      content: {},
      snapshots: [],
      createdAt: '',
      updatedAt: '',
    });
    mockDocSvc.saveDocument.mockImplementation((doc: DocumentFile) => Promise.resolve(doc));

    await service.saveTranscriptionToProject({
      text: '',
      sourceFile: 'a.mp3',
      provider: 'openai',
      durationMs: 1,
    });
    expect(mockProjectSvc.addNode).not.toHaveBeenCalled();
    expect(mockDocSvc.createDocument).toHaveBeenCalledWith(
      expect.any(String),
      'existing-folder',
    );

    mockProjectSvc.project.set(makeProject({ tree: [] }));
    mockProjectSvc.addNode.mockResolvedValue({
      id: 'new-folder',
      title: 'Transcriptions',
      type: 'folder',
      children: [],
    });

    await service.saveTranscriptionToProject({
      text: '',
      sourceFile: 'b.mp3',
      provider: 'openai',
      durationMs: 1,
    });
    expect(mockProjectSvc.addNode).toHaveBeenCalledWith('folder', 'Transcriptions', null);
    expect(mockDocSvc.createDocument).toHaveBeenLastCalledWith(
      expect.any(String),
      'new-folder',
    );
  });

  it('saveTranscriptionToProject() formatea título con timestamp', async () => {
    mockProjectSvc.project.set(makeProject({ tree: [] }));
    mockProjectSvc.addNode.mockResolvedValue({
      id: 'f',
      title: 'Transcriptions',
      type: 'folder',
      children: [],
    });
    mockDocSvc.createDocument.mockResolvedValue({
      id: 'd',
      title: '',
      content: {},
      snapshots: [],
      createdAt: '',
      updatedAt: '',
    });
    mockDocSvc.saveDocument.mockImplementation((doc: DocumentFile) => Promise.resolve(doc));

    await service.saveTranscriptionToProject({
      text: '',
      sourceFile: 'my-recording.mp3',
      provider: 'groq',
      durationMs: 1,
    });

    const title = mockDocSvc.createDocument.mock.calls[0][0] as string;
    expect(title).toMatch(/^my-recording — \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
