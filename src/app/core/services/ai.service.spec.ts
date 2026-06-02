import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, provideZonelessChangeDetection } from '@angular/core';

import { AiService } from './ai.service';
import { ProjectService } from './project.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { AppConfigService } from './app-config.service';
import { DEFAULT_APP_CONFIG } from '../models/app-config.model';
import { aiSessionPath } from '../../shared/utils/project-paths';

const BASE_PATH = '/test/project';
const PROJECT_ID = 'proj-123';

describe('AiService', () => {
  let aiService: AiService;
  let projectService: ProjectService;
  let mockBridge: TauriBridgeService;
  let mockAppConfig: AppConfigService;

  beforeEach(() => {
    mockBridge = {
      readJsonFile: vi.fn(),
      writeJsonFile: vi.fn().mockResolvedValue(undefined),
      folderExists: vi.fn().mockResolvedValue(true),
      createFolder: vi.fn().mockResolvedValue(undefined),
    } as unknown as TauriBridgeService;

    mockAppConfig = {
      config: signal({ ...DEFAULT_APP_CONFIG }),
    } as unknown as AppConfigService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        AiService,
        ProjectService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: AppConfigService, useValue: mockAppConfig },
      ],
    });

    aiService = TestBed.inject(AiService);
    projectService = TestBed.inject(ProjectService);
  });

  describe('loadSession', () => {
    it('restaura mensajes cuando projectId coincide', async () => {
      const session = {
        projectId: PROJECT_ID,
        mode: 'brainstorm',
        messages: [{ role: 'user', content: 'hola' }],
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(session));

      await aiService.loadSession(BASE_PATH, PROJECT_ID);

      expect(aiService.messages()).toEqual(session.messages);
      expect(aiService.currentMode()).toBe('brainstorm');
    });

    it('no lanza cuando el fichero no existe', async () => {
      vi.mocked(mockBridge.readJsonFile).mockRejectedValue(new Error('not found'));

      await expect(aiService.loadSession(BASE_PATH, PROJECT_ID)).resolves.toBeUndefined();
      expect(aiService.messages()).toEqual([]);
      expect(aiService.currentMode()).toBe('analyze');
    });

    it('ignora sesión cuyo projectId no coincide', async () => {
      const session = {
        projectId: 'otro-id',
        mode: 'review',
        messages: [{ role: 'user', content: 'test' }],
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(session));

      await aiService.loadSession(BASE_PATH, PROJECT_ID);

      expect(aiService.messages()).toEqual([]);
      expect(aiService.currentMode()).toBe('analyze');
    });
  });

  describe('clearSession', () => {
    it('vacía messages y resetea modo', async () => {
      aiService.messages.set([{ role: 'user', content: 'hello' }]);
      aiService.currentMode.set('review');

      await aiService.clearSession(BASE_PATH, PROJECT_ID);

      expect(aiService.messages()).toEqual([]);
      expect(aiService.currentMode()).toBe('analyze');
    });

    it('persiste sesión vacía en disco', async () => {
      await aiService.clearSession(BASE_PATH, PROJECT_ID);

      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
      const [pathArg] = vi.mocked(mockBridge.writeJsonFile).mock.calls[0];
      expect(pathArg).toBe(aiSessionPath(BASE_PATH));
    });
  });

  describe('closeProject', () => {
    it('limpia AiService al cerrar proyecto', () => {
      aiService.messages.set([{ role: 'user', content: 'msg' }]);
      aiService.currentMode.set('synopsis');

      projectService.closeProject();

      expect(aiService.messages()).toEqual([]);
      expect(aiService.currentMode()).toBe('analyze');
    });
  });
});
