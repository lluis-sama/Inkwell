import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let uuidCounter = 0;

  beforeEach(() => {
    uuidCounter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `test-uuid-${++uuidCounter}`,
    });

    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    service = TestBed.inject(ToastService);
    service.toasts.set([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('success() añade toast con type success y duration 3000', () => {
    service.success('Todo bien');

    const list = service.toasts();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'test-uuid-1',
      message: 'Todo bien',
      type: 'success',
      duration: 3000,
    });
  });

  it('error() añade toast con type error y duration 5000', () => {
    service.error('Algo falló');

    const list = service.toasts();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'test-uuid-1',
      message: 'Algo falló',
      type: 'error',
      duration: 5000,
    });
  });

  it('toasts() señal refleja array tras llamada', () => {
    service.success('Primero');
    service.error('Segundo');

    const list = service.toasts();
    expect(list).toHaveLength(2);
    expect(list[0].message).toBe('Primero');
    expect(list[1].message).toBe('Segundo');
  });

  it('dismiss() elimina toast por id', () => {
    service.success('Borrable');
    const id = service.toasts()[0].id;

    service.dismiss(id);

    expect(service.toasts()).toHaveLength(0);
  });

  it('auto-dismiss elimina toast tras timeout', () => {
    vi.useFakeTimers();

    service.success('Temporal');

    expect(service.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(3000);

    expect(service.toasts()).toHaveLength(0);
  });
});
