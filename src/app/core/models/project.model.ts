export interface AuthorProfile {
  legalName: string;
  penName?: string;
  email: string;
  phone?: string;
  address?: string;
  agentName?: string;
  agentContact?: string;
  genre: string;
  language: string;
  copyrightYear: number;
  publisher?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tree: TreeNode[];
  settings: ProjectSettings;
  wordCountCache: Record<string, number>;
  authorProfile?: AuthorProfile;
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
