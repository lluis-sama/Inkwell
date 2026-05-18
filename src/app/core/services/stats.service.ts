import { Injectable, inject } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { WritingStats, StatsEntry } from '../models/stats.model';
import { statsPath }          from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);

  private cache: WritingStats | null = null;
  private todayWordBase = 0;
  private sessionTracked = false;

  async load(): Promise<WritingStats> {
    const basePath = this.project.basePath();
    if (!basePath) return { entries: [] };

    try {
      const raw  = await this.bridge.readJsonFile(statsPath(basePath));
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = { entries: [] };
    }

    return this.cache!;
  }

  async trackSessionStart(): Promise<void> {
    if (this.sessionTracked) return;
    this.sessionTracked = true;
    this.todayWordBase  = this.project.totalWordCount();

    const stats = await this.loadOrCreate();
    const today = this.today();
    const entry = stats.entries.find(e => e.date === today);

    if (entry) {
      entry.sessions++;
    } else {
      stats.entries.push({ date: today, wordsAdded: 0, sessions: 1 });
    }

    await this.save(stats);
  }

  async updateTodayWords(): Promise<void> {
    if (!this.sessionTracked) return;

    const currentTotal = this.project.totalWordCount();
    const delta        = currentTotal - this.todayWordBase;
    const stats        = await this.loadOrCreate();
    const today        = this.today();
    const entry        = stats.entries.find(e => e.date === today);

    if (entry) {
      entry.wordsAdded = delta;
    } else {
      stats.entries.push({ date: today, wordsAdded: delta, sessions: 1 });
    }

    await this.save(stats);
  }

  async getLastNDays(n = 30): Promise<StatsEntry[]> {
    const stats = await this.loadOrCreate();
    const result: StatsEntry[] = [];

    for (let i = n - 1; i >= 0; i--) {
      const date  = this.daysAgo(i);
      const entry = stats.entries.find(e => e.date === date);
      result.push(entry ?? { date, wordsAdded: 0, sessions: 0 });
    }

    return result;
  }

  async totalWordsLastNDays(n = 30): Promise<number> {
    const entries = await this.getLastNDays(n);
    return entries.reduce((sum, e) => sum + Math.max(0, e.wordsAdded), 0);
  }

  async currentStreak(): Promise<number> {
    const stats = await this.loadOrCreate();
    let streak  = 0;
    let i       = 0;

    while (true) {
      const date  = this.daysAgo(i);
      const entry = stats.entries.find(e => e.date === date);
      if (!entry || entry.wordsAdded <= 0) break;
      streak++;
      i++;
    }

    return streak;
  }

  resetSession(): void {
    this.sessionTracked = false;
    this.todayWordBase  = 0;
    this.cache          = null;
  }

  private async loadOrCreate(): Promise<WritingStats> {
    if (this.cache) return this.cache;
    return this.load();
  }

  private async save(stats: WritingStats): Promise<void> {
    const basePath = this.project.basePath();
    if (!basePath) return;

    if (stats.entries.length > 365) {
      stats.entries.sort((a, b) => a.date.localeCompare(b.date));
      stats.entries = stats.entries.slice(-365);
    }

    this.cache = stats;
    await this.bridge.writeJsonFile(statsPath(basePath), JSON.stringify(stats, null, 2));
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
