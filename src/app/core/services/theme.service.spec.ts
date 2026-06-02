import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';

import { ThemeService, Theme } from './theme.service';
import { AppConfigService } from './app-config.service';
import { SettingsService } from './settings.service';
import { AppConfig, DEFAULT_APP_CONFIG } from '../models/app-config.model';
import { AppSettings, DEFAULT_APP_SETTINGS, UiFontScale } from '../models/app-settings.model';

describe('ThemeService', () => {
  let service: ThemeService;
  let mockConfigSignal: ReturnType<typeof signal<AppConfig>>;
  let mockAppConfig: { config: typeof mockConfigSignal; setTheme: ReturnType<typeof vi.fn> };
  let mockSettingsSignal: ReturnType<typeof signal<AppSettings>>;
  let mockSettingsService: { settings: typeof mockSettingsSignal };

  beforeEach(() => {
    mockConfigSignal = signal<AppConfig>({ ...DEFAULT_APP_CONFIG, theme: 'dark' });
    mockAppConfig = {
      config: mockConfigSignal,
      setTheme: vi.fn().mockResolvedValue(undefined),
    };

    mockSettingsSignal = signal<AppSettings>({ ...DEFAULT_APP_SETTINGS });
    mockSettingsService = {
      settings: mockSettingsSignal,
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AppConfigService, useValue: mockAppConfig },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    });

    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.fontSize = '';
  });

  it('theme() computado refleja valor del config', () => {
    expect(service.theme()).toBe('dark');

    mockConfigSignal.set({ ...mockConfigSignal(), theme: 'light' });
    expect(service.theme()).toBe('light');
  });

  it('toggle() alterna entre dark y light', async () => {
    mockConfigSignal.set({ ...mockConfigSignal(), theme: 'dark' });
    await service.toggle();
    expect(mockAppConfig.setTheme).toHaveBeenCalledWith('light');

    mockConfigSignal.set({ ...mockConfigSignal(), theme: 'light' });
    await service.toggle();
    expect(mockAppConfig.setTheme).toHaveBeenCalledWith('dark');
  });

  it('setTheme() delega a appConfig.setTheme', async () => {
    await service.setTheme('light');
    expect(mockAppConfig.setTheme).toHaveBeenCalledWith('light');

    await service.setTheme('dark');
    expect(mockAppConfig.setTheme).toHaveBeenCalledWith('dark');
  });

  it('Effect aplica data-theme al DOM', () => {
    const setAttrSpy = vi.spyOn(document.documentElement, 'setAttribute');

    mockConfigSignal.set({ ...mockConfigSignal(), theme: 'light' });
    TestBed.flushEffects();
    expect(setAttrSpy).toHaveBeenCalledWith('data-theme', 'light');

    setAttrSpy.mockRestore();
  });

  it('Effect aplica font-size al DOM según FONT_SCALE_MAP', () => {
    const fontSizeSpy = vi.spyOn(document.documentElement.style, 'fontSize', 'set');

    mockSettingsSignal.set({
      ...mockSettingsSignal(),
      appearance: { ...mockSettingsSignal().appearance, uiFontScale: 'lg' as UiFontScale },
    });
    TestBed.flushEffects();
    expect(fontSizeSpy).toHaveBeenCalledWith('18px');

    mockSettingsSignal.set({
      ...mockSettingsSignal(),
      appearance: { ...mockSettingsSignal().appearance, uiFontScale: 'sm' as UiFontScale },
    });
    TestBed.flushEffects();
    expect(fontSizeSpy).toHaveBeenCalledWith('14px');

    fontSizeSpy.mockRestore();
  });
});
