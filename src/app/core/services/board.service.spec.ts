import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { BoardService } from './board.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { TranslocoService } from '@jsverse/transloco';
import { BoardFile, Card, DEFAULT_COLORS_BY_TYPE } from '../models/board.model';
import { boardPath, boardsFolderPath } from '../../shared/utils/project-paths';

const mockBridge = {
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  deleteJsonFile: vi.fn(),
  listJsonFiles: vi.fn(),
};

const mockProject = {
  basePath: vi.fn(() => '/test/project' as string | null),
};

const mockTransloco = {
  translate: vi.fn((key: string) => key),
};

describe('BoardService', () => {
  let service: BoardService;

  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'test-uuid-1234'),
    });

    mockProject.basePath.mockReturnValue('/test/project');

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        BoardService,
        { provide: TauriBridgeService, useValue: mockBridge },
        { provide: ProjectService, useValue: mockProject },
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    });

    service = TestBed.inject(BoardService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('addCard adds card without mutating original board', () => {
    const board: BoardFile = {
      id: 'board-1',
      title: 'Test Board',
      cards: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const result = service.addCard(board, { x: 10, y: 20 });

    expect(board.cards).toHaveLength(0);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].id).toBe('test-uuid-1234');
    expect(result.cards[0].x).toBe(10);
    expect(result.cards[0].y).toBe(20);
    expect(result.cards[0].title).toBe('Nueva tarjeta');
  });

  it('addCard assigns default color for note type', () => {
    const board: BoardFile = {
      id: 'board-1',
      title: 'Test Board',
      cards: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const result = service.addCard(board, { x: 0, y: 0 });

    expect(result.cards[0].color).toBe(DEFAULT_COLORS_BY_TYPE['note']);
    expect(result.cards[0].type).toBe('note');
  });

  it('updateCard modifies existing card fields', () => {
    const card: Card = {
      id: 'card-1',
      title: 'Old Title',
      body: 'Old body',
      color: '#ffffff',
      type: 'note',
      x: 0,
      y: 0,
      width: 220,
      height: 160,
    };

    const board: BoardFile = {
      id: 'board-1',
      title: 'Test Board',
      cards: [card],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const updatedCard: Card = { ...card, title: 'New Title', body: 'New body' };
    const result = service.updateCard(board, updatedCard);

    expect(result.cards[0].title).toBe('New Title');
    expect(result.cards[0].body).toBe('New body');
    expect(board.cards[0].title).toBe('Old Title');
  });

  it('deleteCard removes card by id', () => {
    const cards: Card[] = [
      { id: 'card-1', title: 'A', body: '', color: '#fff', type: 'note', x: 0, y: 0, width: 220, height: 160 },
      { id: 'card-2', title: 'B', body: '', color: '#fff', type: 'note', x: 0, y: 0, width: 220, height: 160 },
    ];

    const board: BoardFile = {
      id: 'board-1',
      title: 'Test Board',
      cards,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const result = service.deleteCard(board, 'card-1');

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].id).toBe('card-2');
    expect(board.cards).toHaveLength(2);
  });

  it('loadBoard parses JSON and adds default type to cards without type', async () => {
    const boardData = {
      id: 'board-1',
      title: 'Loaded Board',
      cards: [
        { id: 'c1', title: 'Card 1', body: '', color: '#fff', x: 0, y: 0, width: 220, height: 160 },
        { id: 'c2', title: 'Card 2', body: '', color: '#fff', type: 'character', x: 0, y: 0, width: 220, height: 160 },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    mockBridge.readJsonFile.mockResolvedValue(JSON.stringify(boardData));

    const result = await service.loadBoard('board-1');

    expect(mockBridge.readJsonFile).toHaveBeenCalledWith(boardPath('/test/project', 'board-1'));
    expect(result.cards[0].type).toBe('note');
    expect(result.cards[1].type).toBe('character');
  });

  it('saveBoard updates updatedAt and calls writeJsonFile', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));

    const board: BoardFile = {
      id: 'board-1',
      title: 'Test Board',
      cards: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    mockBridge.writeJsonFile.mockResolvedValue(undefined);

    const result = await service.saveBoard(board);

    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z');
    expect(mockBridge.writeJsonFile).toHaveBeenCalledWith(
      boardPath('/test/project', 'board-1'),
      JSON.stringify(result, null, 2),
    );
  });

  it('createBoard generates id and dates then delegates to saveBoard', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));

    mockBridge.writeJsonFile.mockResolvedValue(undefined);

    const result = await service.createBoard('My New Board');

    expect(result.id).toBe('test-uuid-1234');
    expect(result.title).toBe('My New Board');
    expect(result.cards).toEqual([]);
    expect(result.createdAt).toBe('2024-06-15T12:00:00.000Z');
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z');
    expect(mockBridge.writeJsonFile).toHaveBeenCalledWith(
      boardPath('/test/project', 'test-uuid-1234'),
      JSON.stringify(result, null, 2),
    );
  });

  it('deleteBoard calls deleteJsonFile with correct path', async () => {
    mockBridge.deleteJsonFile.mockResolvedValue(undefined);

    await service.deleteBoard('board-1');

    expect(mockBridge.deleteJsonFile).toHaveBeenCalledWith(
      boardPath('/test/project', 'board-1'),
    );
  });

  it('listBoardIds calls listJsonFiles in boards folder', async () => {
    mockBridge.listJsonFiles.mockResolvedValue(['board-1.json', 'board-2.json']);

    const result = await service.listBoardIds();

    expect(mockBridge.listJsonFiles).toHaveBeenCalledWith(
      boardsFolderPath('/test/project'),
    );
    expect(result).toEqual(['board-1.json', 'board-2.json']);
  });

  it('throws translated error when no project is open', async () => {
    mockProject.basePath.mockReturnValue(null);

    await expect(service.loadBoard('board-1')).rejects.toThrow('COMMON.NO_PROJECT_OPEN');
    await expect(service.saveBoard({} as BoardFile)).rejects.toThrow('COMMON.NO_PROJECT_OPEN');
    await expect(service.deleteBoard('board-1')).rejects.toThrow('COMMON.NO_PROJECT_OPEN');
    await expect(service.listBoardIds()).rejects.toThrow('COMMON.NO_PROJECT_OPEN');

    expect(mockTransloco.translate).toHaveBeenCalledWith('COMMON.NO_PROJECT_OPEN');
  });
});
