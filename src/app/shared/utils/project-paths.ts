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
