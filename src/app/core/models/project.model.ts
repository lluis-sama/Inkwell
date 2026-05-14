export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tree: TreeNode[];
  settings: ProjectSettings;
}

export interface TreeNode {
  id: string;
  title: string;
  type: 'folder' | 'document';
  children: TreeNode[];
}

export interface ProjectSettings {
  autosaveInterval: number;
  maxSnapshots: number;
  aiModel: string;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autosaveInterval: 30,
  maxSnapshots: 10,
  aiModel: 'claude-sonnet-4-20250514',
};
