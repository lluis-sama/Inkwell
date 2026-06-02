import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { UpdateService } from './update.service';
import { TauriBridgeService, UpdateInfo } from './tauri-bridge.service';

describe('UpdateService', () => {
  let service: UpdateService;
  let bridgeMock: {
    checkForUpdate: ReturnType<typeof vi.fn>;
    openReleasesPage: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    bridgeMock = {
      checkForUpdate: vi.fn(),
      openReleasesPage: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: TauriBridgeService, useValue: bridgeMock },
      ],
    });

    service = TestBed.inject(UpdateService);
  });

  it('checked() es false al inicio', () => {
    expect(service.checked()).toBe(false);
  });

  it('checkOnce() llama checkForUpdate una sola vez', async () => {
    bridgeMock.checkForUpdate.mockResolvedValue(null);

    await service.checkOnce();

    expect(bridgeMock.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('checkOnce() no llama checkForUpdate si checked() ya es true', async () => {
    bridgeMock.checkForUpdate.mockResolvedValue(null);

    await service.checkOnce();
    await service.checkOnce();

    expect(bridgeMock.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('checkOnce() setea updateInfo() si hay update', async () => {
    const info: UpdateInfo = {
      version: '1.2.3',
      release_notes: 'Nueva versión',
      url: 'https://example.com/release',
    };
    bridgeMock.checkForUpdate.mockResolvedValue(info);

    await service.checkOnce();

    expect(service.updateInfo()).toEqual(info);
  });

  it('checkOnce() maneja error silencioso', async () => {
    bridgeMock.checkForUpdate.mockRejectedValue(new Error('network'));

    await expect(service.checkOnce()).resolves.not.toThrow();
    expect(service.checked()).toBe(true);
    expect(service.updateInfo()).toBeNull();
  });

  it('dismiss() limpia updateInfo()', async () => {
    const info: UpdateInfo = {
      version: '1.2.3',
      release_notes: 'Nueva versión',
      url: 'https://example.com/release',
    };
    bridgeMock.checkForUpdate.mockResolvedValue(info);
    await service.checkOnce();

    service.dismiss();

    expect(service.updateInfo()).toBeNull();
  });

  it('openReleasesPage() llama openReleasesPage del bridge y luego dismiss', async () => {
    const info: UpdateInfo = {
      version: '1.2.3',
      release_notes: 'Nueva versión',
      url: 'https://example.com/release',
    };
    bridgeMock.checkForUpdate.mockResolvedValue(info);
    await service.checkOnce();

    await service.openReleasesPage();

    expect(bridgeMock.openReleasesPage).toHaveBeenCalledWith(info.url);
    expect(service.updateInfo()).toBeNull();
  });
});
