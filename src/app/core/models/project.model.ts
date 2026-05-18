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

export type DocumentStatus = 'draft' | 'revised' | 'final' | 'todo' | 'notes';

export const DOCUMENT_STATUS_CONFIG: Record<DocumentStatus, { label: string; color: string }> = {
  todo:    { label: 'Por escribir', color: '#6c7086' },
  draft:   { label: 'Borrador',     color: '#89b4fa' },
  revised: { label: 'En revisión',  color: '#f9e2af' },
  final:   { label: 'Finalizado',   color: '#a6e3a1' },
  notes:   { label: 'Solo notas',   color: '#cba6f7' },
};

export interface TreeNode {
  id: string;
  title: string;
  type: 'folder' | 'document';
  children: TreeNode[];
  status?: DocumentStatus;
}

export type AiProvider = 'anthropic' | 'openai-compatible' | 'ollama';

export interface ProjectSettings {
  autosaveInterval: number;
  maxSnapshots: number;
  aiModel: string;
  spellcheck: boolean;
  aiProvider:   AiProvider;
  aiEndpoint?:  string;
  aiApiKey?:    string;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autosaveInterval: 30,
  maxSnapshots: 10,
  aiModel: 'claude-sonnet-4-20250514',
  spellcheck: true,
  aiProvider: 'anthropic',
};

export interface ProjectTemplate {
  id:          string;
  name:        string;
  description: string;
  icon:        string;
  structure:   TemplateNode[];
}

export interface TemplateNode {
  title:    string;
  type:     'folder' | 'document';
  children: TemplateNode[];
}
