export function projectJsonPath(basePath: string): string {
  return `${basePath}/project.json`;
}

export function documentPath(basePath: string, id: string): string {
  return `${basePath}/documents/${id}.json`;
}

export function documentsFolderPath(basePath: string): string {
  return `${basePath}/documents`;
}

export function boardPath(basePath: string, id: string): string {
  return `${basePath}/boards/${id}.json`;
}

export function boardsFolderPath(basePath: string): string {
  return `${basePath}/boards`;
}

export function statsPath(basePath: string): string {
  return `${basePath}/stats.json`;
}

export function consistencyReportPath(basePath: string): string {
  return `${basePath}/consistency-report.json`;
}

export const DESK_NOTES_FOLDER = 'desk_notes';

export function deskNotesFolderPath(basePath: string): string {
  return `${basePath}/${DESK_NOTES_FOLDER}`;
}

export function deskNotePath(basePath: string, id: string): string {
  return `${basePath}/${DESK_NOTES_FOLDER}/${id}.json`;
}

export function aiSessionPath(basePath: string): string {
  return `${basePath}/ai_session.json`;
}
