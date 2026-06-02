import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { AppConfigService } from './app-config.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { DEFAULT_APP_CONFIG } from '../models/app-config.model';

const mockProject = (name: string, basePath: string) => ({
  name,
  basePath,
  openedAt: new Date().toISOString(),
});

describe('AppConfigService', () => {
  let service: AppConfigService;
  let mockBridge: TauriBridgeService;
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
    });

    mockBridge = {
      readAppConfig: vi.fn(),
      writeAppConfig: vi.fn().mockResolvedValue(undefined),
    } as unknown as TauriBridgeService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        AppConfigService,
        { provide: TauriBridgeService, useValue: mockBridge },
      ],
    });

    service = TestBed.inject(AppConfigService);
  });

  describe('load', () => {
    it('parsea JSON válido y setea config', async () => {
      const stored = { ...DEFAULT_APP_CONFIG, apiKey: 'secret', theme: 'light' as const };
      vi.mocked(mockBridge.readAppConfig).mockResolvedValue(JSON.stringify(stored));

      await service.load();

      expect(service.config().apiKey).toBe('secret');
      expect(service.config().theme).toBe('light');
    });

    it('con string vacío usa defaults y persiste', async () => {
      vi.mocked(mockBridge.readAppConfig).mockResolvedValue('');

      await service.load();

      expect(service.config().apiKey).toBe(DEFAULT_APP_CONFIG.apiKey);
      expect(mockBridge.writeAppConfig).toHaveBeenCalledOnce();
    });

    it('con error de I/O no lanza y usa defaults', async () => {
      vi.mocked(mockBridge.readAppConfig).mockRejectedValue(new Error('io'));

      await expect(service.load()).resolves.toBeUndefined();
      expect(service.config().apiKey).toBe(DEFAULT_APP_CONFIG.apiKey);
    });
  });

  describe('setApiKey', () => {
    it('actualiza signal', async () => {
      await service.setApiKey('my-key');

      expect(service.config().apiKey).toBe('my-key');
    });

    it('llama writeAppConfig con JSON que contiene la key', async () => {
      await service.setApiKey('my-key');

      expect(mockBridge.writeAppConfig).toHaveBeenCalled();
      const [jsonArg] = vi.mocked(mockBridge.writeAppConfig).mock.calls[0];
      const parsed = JSON.parse(jsonArg);
      expect(parsed.apiKey).toBe('my-key');
    });
  });

  describe('addRecentProject', () => {
    it('añade proyecto nuevo al frente', async () => {
      await service.addRecentProject('Novela', '/path/1');

      expect(service.config().recentProjects[0]).toEqual(
        expect.objectContaining({ name: 'Novela', basePath: '/path/1' }),
      );
    });

    it('deduplica por basePath', async () => {
      await service.addRecentProject('A', '/path/1');
      await service.addRecentProject('B', '/path/1');

      expect(service.config().recentProjects).toHaveLength(1);
      expect(service.config().recentProjects[0].name).toBe('B');
    });
  });

  describe('addLtDisabledRule', () => {
    it('deduplica ruleId', async () => {
      await service.addLtDisabledRule('RULE_1');
      await service.addLtDisabledRule('RULE_1');
      await service.addLtDisabledRule('RULE_2');

      expect(service.config().ltDisabledRules).toEqual(['RULE_1', 'RULE_2']);
    });
  });
});
