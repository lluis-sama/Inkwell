import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { LanguageToolService, type LtProgress } from './language-tool.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { AppConfigService } from './app-config.service';
import { ProjectService } from './project.service';

describe('LanguageToolService', () => {
  let service: LanguageToolService;
  let progressCb: ((p: LtProgress) => void) | null;
  let installCompleteCb: (() => void) | null;
  let mockUnlisten: ReturnType<typeof vi.fn>;
  let mockBridge: {
    ltIsInstalled: ReturnType<typeof vi.fn>;
    ltStartServer: ReturnType<typeof vi.fn>;
    ltStopServer: ReturnType<typeof vi.fn>;
    ltDownloadAndInstall: ReturnType<typeof vi.fn>;
    ltOnProgress: ReturnType<typeof vi.fn>;
    ltOnInstallComplete: ReturnType<typeof vi.fn>;
    ltServerReady: ReturnType<typeof vi.fn>;
    ltUninstall: ReturnType<typeof vi.fn>;
  };
  let configSignal: ReturnType<typeof signal<{ ltLanguage: string | null; lang: string }>>;
  let projectSignal: ReturnType<typeof signal<{ authorProfile: { language?: string } | null }>>;

  beforeEach(() => {
    vi.useFakeTimers();

    progressCb = null;
    installCompleteCb = null;
    mockUnlisten = vi.fn();

    configSignal = signal({ ltLanguage: null, lang: 'es' });
    projectSignal = signal({ authorProfile: null });

    mockBridge = {
      ltIsInstalled: vi.fn().mockResolvedValue(false),
      ltStartServer: vi.fn().mockResolvedValue(undefined),
      ltStopServer: vi.fn().mockResolvedValue(undefined),
      ltDownloadAndInstall: vi.fn().mockResolvedValue(undefined),
      ltOnProgress: vi.fn().mockImplementation((cb: (p: LtProgress) => void) => {
        progressCb = cb;
        return Promise.resolve(mockUnlisten);
      }),
      ltOnInstallComplete: vi.fn().mockImplementation((cb: () => void) => {
        installCompleteCb = cb;
        return Promise.resolve(mockUnlisten);
      }),
      ltServerReady: vi.fn().mockResolvedValue(false),
      ltUninstall: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        LanguageToolService,
        provideZonelessChangeDetection(),
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: AppConfigService, useValue: { config: configSignal } },
        { provide: ProjectService, useValue: { project: projectSignal } },
      ],
    });

    service = TestBed.inject(LanguageToolService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolvedLanguage() devuelve ltLanguage del config si existe', () => {
    configSignal.set({ ltLanguage: 'en', lang: 'es' });
    projectSignal.set({ authorProfile: null });
    expect(service.resolvedLanguage()).toBe('en');
  });

  it('resolvedLanguage() hace fallback a idioma del autor del proyecto', () => {
    configSignal.set({ ltLanguage: null, lang: 'es' });
    projectSignal.set({ authorProfile: { language: 'fr' } });
    expect(service.resolvedLanguage()).toBe('fr');
  });

  it('resolvedLanguage() hace fallback a config.lang', () => {
    configSignal.set({ ltLanguage: null, lang: 'de' });
    projectSignal.set({ authorProfile: null });
    expect(service.resolvedLanguage()).toBe('de');
  });

  it('resolvedLanguage() devuelve "es" si nada disponible', () => {
    configSignal.set({ ltLanguage: null, lang: '' });
    projectSignal.set({ authorProfile: null });
    expect(service.resolvedLanguage()).toBe('es');
  });

  it('resolvedLanguage() mapea códigos de autor a códigos LT (ca → ca-ES, pt → pt-PT)', () => {
    configSignal.set({ ltLanguage: null, lang: 'es' });
    projectSignal.set({ authorProfile: { language: 'ca' } });
    expect(service.resolvedLanguage()).toBe('ca-ES');

    projectSignal.set({ authorProfile: { language: 'pt' } });
    expect(service.resolvedLanguage()).toBe('pt-PT');
  });

  it('initialize() con ltIsInstalled=false setea not-installed', async () => {
    mockBridge.ltIsInstalled.mockResolvedValue(false);
    await service.initialize();
    expect(service.installState()).toBe('not-installed');
  });

  it('initialize() con ltIsInstalled=true setea ready', async () => {
    mockBridge.ltIsInstalled.mockResolvedValue(true);
    await service.initialize();
    expect(service.installState()).toBe('ready');
  });

  it('initialize(autoStart=true) inicia servidor y setea serverReady=true', async () => {
    mockBridge.ltIsInstalled.mockResolvedValue(true);
    mockBridge.ltServerReady.mockResolvedValue(true);

    await service.initialize(true);

    expect(mockBridge.ltStartServer).toHaveBeenCalled();
    expect(service.serverReady()).toBe(true);
  });

  it('install() transita downloading → ready vía callbacks', async () => {
    mockBridge.ltDownloadAndInstall.mockImplementation(async () => {
      await Promise.resolve();
      if (installCompleteCb) {
        await installCompleteCb();
      }
    });
    mockBridge.ltServerReady.mockResolvedValue(true);

    await service.install();

    expect(service.installState()).toBe('ready');
  });

  it('install() maneja error seteando error', async () => {
    mockBridge.ltDownloadAndInstall.mockRejectedValue(new Error('fail'));
    await service.install();
    expect(service.installState()).toBe('error');
  });

  it('install() limpia listeners anteriores (_unlisteners)', async () => {
    const unlisten1 = vi.fn();
    const unlisten2 = vi.fn();

    mockBridge.ltOnProgress.mockImplementationOnce((cb: (p: LtProgress) => void) => {
      progressCb = cb;
      return Promise.resolve(unlisten1);
    });
    mockBridge.ltOnInstallComplete.mockImplementationOnce((cb: () => void) => {
      installCompleteCb = cb;
      return Promise.resolve(unlisten2);
    });
    mockBridge.ltDownloadAndInstall.mockResolvedValue(undefined);

    await service.install();

    mockBridge.ltDownloadAndInstall.mockResolvedValue(undefined);
    await service.install();

    expect(unlisten1).toHaveBeenCalled();
    expect(unlisten2).toHaveBeenCalled();
  });

  it('stopServer() setea serverReady(false)', async () => {
    service.serverReady.set(true);
    await service.stopServer();
    expect(service.serverReady()).toBe(false);
  });

  it('uninstall() limpia estado a not-installed', async () => {
    service.installState.set('ready');
    await service.uninstall();
    expect(service.installState()).toBe('not-installed');
  });

  it('progress() se actualiza vía callback de ltOnProgress', async () => {
    mockBridge.ltDownloadAndInstall.mockResolvedValue(undefined);
    await service.install();

    const progress: LtProgress = { phase: 'jre', percent: 50, message: 'downloading jre' };
    progressCb!(progress);

    expect(service.progress()).toEqual(progress);
  });
});
