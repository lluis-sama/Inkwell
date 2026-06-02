import { describe, it, expect } from 'vitest';
import {
  projectJsonPath,
  documentPath,
  documentsFolderPath,
  boardPath,
  boardsFolderPath,
  statsPath,
  consistencyReportPath,
  deskNotesFolderPath,
  deskNotePath,
  aiSessionPath,
} from './project-paths';

describe('project-paths', () => {
  const basePath = '/test/project';

  it('projectJsonPath() concatena correctamente basePath + /project.json', () => {
    expect(projectJsonPath(basePath)).toBe('/test/project/project.json');
  });

  it('documentPath() incluye extensión .json y subcarpeta documents', () => {
    expect(documentPath(basePath, 'abc-123')).toBe(
      '/test/project/documents/abc-123.json'
    );
  });

  it('documentsFolderPath() es carpeta sin archivo (solo /documents)', () => {
    expect(documentsFolderPath(basePath)).toBe('/test/project/documents');
  });

  it('boardPath() vs boardsFolderPath() diferencian fichero y carpeta', () => {
    expect(boardPath(basePath, 'board-1')).toBe(
      '/test/project/boards/board-1.json'
    );
    expect(boardsFolderPath(basePath)).toBe('/test/project/boards');
  });

  it('statsPath() y consistencyReportPath() rutas correctas', () => {
    expect(statsPath(basePath)).toBe('/test/project/stats.json');
    expect(consistencyReportPath(basePath)).toBe(
      '/test/project/consistency-report.json'
    );
  });

  it('deskNotePath() incluye subcarpeta desk_notes y extensión .json', () => {
    expect(deskNotePath(basePath, 'note-1')).toBe(
      '/test/project/desk_notes/note-1.json'
    );
  });

  it('deskNotesFolderPath() es carpeta sin archivo (solo /desk_notes)', () => {
    expect(deskNotesFolderPath(basePath)).toBe('/test/project/desk_notes');
  });

  it('aiSessionPath() correcto', () => {
    expect(aiSessionPath(basePath)).toBe('/test/project/ai_session.json');
  });
});
