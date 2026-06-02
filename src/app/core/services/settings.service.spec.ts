import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { AppConfigService } from './app-config.service';
import type { AppSettings, DeskPosition, UiFontScale } from '../models/app-settings.model';
import type { AppConfig } from '../models/app-config.model';

describe('SettingsService', () => {
  let service: SettingsService;
  let appConfigMock: {
    config: ReturnType<typeof signal<AppConfig>>;
    setAppSettings: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    const initialSettings: AppSettings = {
      editor: { fontFamily: 'Inter', fontSize: 16 },
      appearance: { theme: 'dark', uiFontScale: 'md' as UiFontScale },
      aiPanel: { width: 320 },
      deskPanel: { position: 'bottom' as DeskPosition, bottomHeight: 300, sideWidth: 250 },
    };

    appConfigMock = {
      config: signal<AppConfig>({
        appSettings: initialSettings,
      } as AppConfig),
      setAppSettings: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        SettingsService,
        { provide: AppConfigService, useValue: appConfigMock },
      ],
    });

    service = TestBed.inject(SettingsService);
  });

  it('settings() computado refleja appSettings del config', () => {
    expect(service.settings()).toEqual(appConfigMock.config().appSettings);
  });

  it('setEditorFontFamily() delega a setAppSettings con fontFamily', async () => {
    await service.setEditorFontFamily('Fira Code');
    expect(appConfigMock.setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        editor: expect.objectContaining({ fontFamily: 'Fira Code' }),
      })
    );
  });

  it('setEditorFontSize() hace clamp entre 12 y 32', async () => {
    await service.setEditorFontSize(8);
    expect(appConfigMock.setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        editor: expect.objectContaining({ fontSize: 12 }),
      })
    );

    await service.setEditorFontSize(40);
    expect(appConfigMock.setAppSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        editor: expect.objectContaining({ fontSize: 32 }),
      })
    );
  });

  it('setEditorFontSize() acepta valores dentro del rango', async () => {
    await service.setEditorFontSize(16);
    expect(appConfigMock.setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        editor: expect.objectContaining({ fontSize: 16 }),
      })
    );

    await service.setEditorFontSize(24);
    expect(appConfigMock.setAppSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        editor: expect.objectContaining({ fontSize: 24 }),
      })
    );
  });

  it('setUiFontScale() delega correctamente', async () => {
    await service.setUiFontScale('lg' as UiFontScale);
    expect(appConfigMock.setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({ uiFontScale: 'lg' }),
      })
    );
  });

  it('setAiPanelWidth() hace clamp entre 240 y 600', async () => {
    await service.setAiPanelWidth(200);
    expect(appConfigMock.setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiPanel: expect.objectContaining({ width: 240 }),
      })
    );

    await service.setAiPanelWidth(700);
    expect(appConfigMock.setAppSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aiPanel: expect.objectContaining({ width: 600 }),
      })
    );
  });

  it('setDeskPosition() delega correctamente', async () => {
    await service.setDeskPosition('left' as DeskPosition);
    expect(appConfigMock.setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        deskPanel: expect.objectContaining({ position: 'left' }),
      })
    );
  });

  it('setDeskBottomHeight() hace clamp usando window.innerHeight * 0.70 como max', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 1000, writable: true });
    const maxHeight = Math.floor(1000 * 0.70);

    await service.setDeskBottomHeight(200);
    expect(appConfigMock.setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        deskPanel: expect.objectContaining({ bottomHeight: 200 }),
      })
    );

    await service.setDeskBottomHeight(900);
    expect(appConfigMock.setAppSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deskPanel: expect.objectContaining({ bottomHeight: maxHeight }),
      })
    );
  });

  it('setDeskSideWidth() hace clamp usando window.innerWidth * 0.60 como max', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    const maxWidth = Math.floor(1920 * 0.60);

    await service.setDeskSideWidth(300);
    expect(appConfigMock.setAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        deskPanel: expect.objectContaining({ sideWidth: 300 }),
      })
    );

    await service.setDeskSideWidth(1500);
    expect(appConfigMock.setAppSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deskPanel: expect.objectContaining({ sideWidth: maxWidth }),
      })
    );
  });
});
