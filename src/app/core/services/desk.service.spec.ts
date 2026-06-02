import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { DeskService } from './desk.service';

describe('DeskService', () => {
  let service: DeskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), DeskService],
    });

    service = TestBed.inject(DeskService);
  });

  it('notifyNewDocument() emite valor por newDocument$', () => {
    let emittedValue: string | undefined;
    service.newDocument$.subscribe((name) => {
      emittedValue = name;
    });

    service.notifyNewDocument('Chapter 1');

    expect(emittedValue).toBe('Chapter 1');
  });

  it('newDocument$ es multicast: múltiples suscriptores reciben el valor', () => {
    const received: string[] = [];
    service.newDocument$.subscribe((name) => received.push(name));
    service.newDocument$.subscribe((name) => received.push(name));

    service.notifyNewDocument('Scene A');

    expect(received).toEqual(['Scene A', 'Scene A']);
  });
});
