import { TestBed } from '@angular/core/testing';
import { AiService, AiMessage, AiMode } from './ai.service';
import { ProjectService } from './project.service';
import { TauriBridgeService } from './tauri-bridge.service';

describe('AiService — INK-25 session persistence', () => {
  let aiService: AiService;
  let mockBridge: jasmine.SpyObj<TauriBridgeService>;

  beforeEach(() => {
    mockBridge = jasmine.createSpyObj('TauriBridgeService', [
      'readJsonFile', 'writeJsonFile', 'folderExists', 'createFolder',
    ]);

    // folderExists/createFolder son llamados por ProjectService.ensureDeskNotesFolder
    // en openProject(); no se invocan en estos tests pero los stubs evitan errores
    mockBridge.folderExists.and.returnValue(Promise.resolve(true));
    mockBridge.createFolder.and.returnValue(Promise.resolve());

    TestBed.configureTestingModule({
      providers: [
        AiService,
        ProjectService,
        { provide: TauriBridgeService, useValue: mockBridge },
      ],
    });

    aiService = TestBed.inject(AiService);
  });

  it('loadSession() restaura messages y mode cuando el fichero existe y el projectId coincide', async () => {
    const messages: AiMessage[] = [
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Hola, ¿en qué te ayudo?' },
    ];
    const session = {
      projectId: 'proj-1',
      mode: 'brainstorm' as AiMode,
      messages,
      updatedAt: new Date().toISOString(),
    };
    mockBridge.readJsonFile.and.returnValue(Promise.resolve(JSON.stringify(session)));

    await aiService.loadSession('/path/to/project', 'proj-1');

    expect(aiService.messages()).toEqual(messages);
    expect(aiService.currentMode()).toBe('brainstorm');
  });

  it('loadSession() no lanza error cuando el fichero no existe, estado queda vacío', async () => {
    mockBridge.readJsonFile.and.returnValue(Promise.reject(new Error('file not found')));

    await expectAsync(aiService.loadSession('/path/to/project', 'proj-1')).toBeResolved();
    expect(aiService.messages()).toEqual([]);
    expect(aiService.currentMode()).toBe('analyze');
  });

  it('loadSession() ignora el fichero cuando el projectId no coincide', async () => {
    const session = {
      projectId: 'other-proj',
      mode: 'review' as AiMode,
      messages: [{ role: 'user' as const, content: 'texto' }],
      updatedAt: new Date().toISOString(),
    };
    mockBridge.readJsonFile.and.returnValue(Promise.resolve(JSON.stringify(session)));

    await aiService.loadSession('/path/to/project', 'proj-1');

    expect(aiService.messages()).toEqual([]);
    expect(aiService.currentMode()).toBe('analyze');
  });

  it('clearSession() deja messages vacío y llama a writeJsonFile', async () => {
    // Prepopular estado
    aiService.messages.set([{ role: 'user', content: 'test' }]);
    mockBridge.writeJsonFile.and.returnValue(Promise.resolve());

    await aiService.clearSession('/path/to/project', 'proj-1');

    expect(aiService.messages()).toEqual([]);
    expect(mockBridge.writeJsonFile).toHaveBeenCalledOnceWith(
      '/path/to/project/ai_session.json',
      jasmine.any(String),
    );
  });
});

describe('ProjectService.closeProject() — INK-25', () => {
  let projectService: ProjectService;
  let aiService: AiService;
  let mockBridge: jasmine.SpyObj<TauriBridgeService>;

  beforeEach(() => {
    mockBridge = jasmine.createSpyObj('TauriBridgeService', [
      'readJsonFile', 'writeJsonFile', 'folderExists', 'createFolder',
    ]);

    mockBridge.folderExists.and.returnValue(Promise.resolve(true));
    mockBridge.createFolder.and.returnValue(Promise.resolve());

    TestBed.configureTestingModule({
      providers: [
        ProjectService,
        AiService,
        { provide: TauriBridgeService, useValue: mockBridge },
      ],
    });

    projectService = TestBed.inject(ProjectService);
    aiService = TestBed.inject(AiService);
  });

  it('closeProject() deja AiService.messages() vacío', () => {
    aiService.messages.set([{ role: 'user', content: 'algo' }]);

    projectService.closeProject();

    expect(aiService.messages()).toEqual([]);
  });
});
