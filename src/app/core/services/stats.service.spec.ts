import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, computed, provideZonelessChangeDetection } from '@angular/core';

import { StatsService } from './stats.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { WritingStats, StatsEntry } from '../models/stats.model';
import { statsPath } from '../../shared/utils/project-paths';

describe('StatsService', () => {
  let service: StatsService;
  let mockBridge: TauriBridgeService;
  let mockProject: ProjectService;
  let totalWordCountSignal: ReturnType<typeof signal<number>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15'));

    mockBridge = {
      readJsonFile: vi.fn(),
      writeJsonFile: vi.fn().mockResolvedValue(undefined),
    } as unknown as TauriBridgeService;

    totalWordCountSignal = signal(0);
    mockProject = {
      basePath: signal('/test/project'),
      totalWordCount: computed(() => totalWordCountSignal()),
    } as unknown as ProjectService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StatsService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: ProjectService, useValue: mockProject },
      ],
    });

    service = TestBed.inject(StatsService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('load', () => {
    it('devuelve { entries: [] } cuando no hay proyecto', async () => {
      mockProject.basePath.set(null);
      const result = await service.load();
      expect(result).toEqual({ entries: [] });
      expect(mockBridge.readJsonFile).not.toHaveBeenCalled();
    });

    it('devuelve { entries: [] } cuando fichero no existe', async () => {
      vi.mocked(mockBridge.readJsonFile).mockRejectedValue(new Error('no file'));
      const result = await service.load();
      expect(result).toEqual({ entries: [] });
      expect(mockBridge.readJsonFile).toHaveBeenCalledWith(statsPath('/test/project'));
    });

    it('parsea JSON existente correctamente', async () => {
      const stats: WritingStats = {
        entries: [{ date: '2025-01-14', wordsAdded: 100, sessions: 2 }],
      };
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(stats));
      const result = await service.load();
      expect(result).toEqual(stats);
    });
  });

  describe('trackSessionStart', () => {
    it('incrementa sessions del día existente', async () => {
      const stats: WritingStats = {
        entries: [{ date: '2025-01-15', wordsAdded: 50, sessions: 1 }],
      };
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(stats));
      await service.trackSessionStart();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
      const [, content] = vi.mocked(mockBridge.writeJsonFile).mock.calls[0];
      const saved: WritingStats = JSON.parse(content as string);
      expect(saved.entries).toHaveLength(1);
      expect(saved.entries[0].sessions).toBe(2);
      expect(saved.entries[0].wordsAdded).toBe(50);
    });

    it('crea entrada nueva si no existe día', async () => {
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify({ entries: [] }));
      await service.trackSessionStart();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
      const [, content] = vi.mocked(mockBridge.writeJsonFile).mock.calls[0];
      const saved: WritingStats = JSON.parse(content as string);
      expect(saved.entries).toHaveLength(1);
      expect(saved.entries[0]).toEqual({ date: '2025-01-15', wordsAdded: 0, sessions: 1 });
    });

    it('no hace nada si ya se trackeó (sessionTracked)', async () => {
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify({ entries: [] }));
      await service.trackSessionStart();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
      await service.trackSessionStart();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
    });
  });

  describe('updateTodayWords', () => {
    it('actualiza wordsAdded con delta respecto a todayWordBase', async () => {
      totalWordCountSignal.set(1000);
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify({ entries: [] }));
      await service.trackSessionStart();
      totalWordCountSignal.set(1500);
      await service.updateTodayWords();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledTimes(2);
      const [, content] = vi.mocked(mockBridge.writeJsonFile).mock.calls[1];
      const saved: WritingStats = JSON.parse(content as string);
      expect(saved.entries[0].wordsAdded).toBe(500);
    });

    it('no hace nada si sessionTracked es false', async () => {
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify({ entries: [] }));
      await service.updateTodayWords();
      expect(mockBridge.writeJsonFile).not.toHaveBeenCalled();
    });
  });

  describe('getLastNDays', () => {
    it('rellena días sin datos con ceros', async () => {
      const stats: WritingStats = {
        entries: [{ date: '2025-01-15', wordsAdded: 100, sessions: 1 }],
      };
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(stats));
      const result = await service.getLastNDays(3);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ date: '2025-01-13', wordsAdded: 0, sessions: 0 });
      expect(result[1]).toEqual({ date: '2025-01-14', wordsAdded: 0, sessions: 0 });
      expect(result[2]).toEqual({ date: '2025-01-15', wordsAdded: 100, sessions: 1 });
    });

    it('respeta el parámetro n', async () => {
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify({ entries: [] }));
      const result = await service.getLastNDays(5);
      expect(result).toHaveLength(5);
      expect(result[0].date).toBe('2025-01-11');
      expect(result[4].date).toBe('2025-01-15');
    });
  });

  describe('totalWordsLastNDays', () => {
    it('suma solo valores positivos', async () => {
      const stats: WritingStats = {
        entries: [
          { date: '2025-01-15', wordsAdded: 100, sessions: 1 },
          { date: '2025-01-14', wordsAdded: -50, sessions: 1 },
          { date: '2025-01-13', wordsAdded: 30, sessions: 1 },
        ],
      };
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(stats));
      const total = await service.totalWordsLastNDays(3);
      expect(total).toBe(130);
    });
  });

  describe('currentStreak', () => {
    it('cuenta días consecutivos con wordsAdded > 0', async () => {
      const stats: WritingStats = {
        entries: [
          { date: '2025-01-15', wordsAdded: 100, sessions: 1 },
          { date: '2025-01-14', wordsAdded: 50, sessions: 1 },
          { date: '2025-01-13', wordsAdded: 20, sessions: 1 },
        ],
      };
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(stats));
      const streak = await service.currentStreak();
      expect(streak).toBe(3);
    });

    it('rompe streak en gap (día sin escritura)', async () => {
      const stats: WritingStats = {
        entries: [
          { date: '2025-01-15', wordsAdded: 100, sessions: 1 },
          { date: '2025-01-14', wordsAdded: 50, sessions: 1 },
          { date: '2025-01-12', wordsAdded: 20, sessions: 1 },
        ],
      };
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify(stats));
      const streak = await service.currentStreak();
      expect(streak).toBe(2);
    });
  });

  describe('resetSession', () => {
    it('limpia estado interno', async () => {
      totalWordCountSignal.set(1000);
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify({ entries: [] }));
      await service.trackSessionStart();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();

      service.resetSession();

      totalWordCountSignal.set(2000);
      await service.updateTodayWords();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();

      await service.trackSessionStart();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('save', () => {
    it('recorta entries a 365 días', async () => {
      const entries: StatsEntry[] = [];
      for (let i = 0; i < 366; i++) {
        const d = new Date('2025-01-15');
        d.setDate(d.getDate() - i);
        entries.push({ date: d.toISOString().slice(0, 10), wordsAdded: 1, sessions: 1 });
      }
      vi.mocked(mockBridge.readJsonFile).mockResolvedValue(JSON.stringify({ entries }));
      await service.trackSessionStart();
      expect(mockBridge.writeJsonFile).toHaveBeenCalledOnce();
      const [, content] = vi.mocked(mockBridge.writeJsonFile).mock.calls[0];
      const saved: WritingStats = JSON.parse(content as string);
      expect(saved.entries).toHaveLength(365);
      expect(saved.entries[0].date).toBe('2024-01-17');
      expect(saved.entries[364].date).toBe('2025-01-15');
    });
  });
});
