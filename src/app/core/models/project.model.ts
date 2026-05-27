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
  deskTree?: TreeNode[];
  settings: ProjectSettings;
  wordCountCache: Record<string, number>;
  authorProfile?: AuthorProfile;
}

export type DocumentStatus = 'draft' | 'revised' | 'final' | 'todo' | 'notes';

export const DOCUMENT_STATUS_CONFIG: Record<DocumentStatus, { label: string; color: string }> = {
  todo:    { label: 'BINDER.STATUS_TODO',    color: '#6c7086' },
  draft:   { label: 'BINDER.STATUS_DRAFT',   color: '#89b4fa' },
  revised: { label: 'BINDER.STATUS_REVISED', color: '#f9e2af' },
  final:   { label: 'BINDER.STATUS_FINAL',   color: '#a6e3a1' },
  notes:   { label: 'BINDER.STATUS_NOTES',   color: '#cba6f7' },
};

export interface TreeNode {
  id: string;
  title: string;
  type: 'folder' | 'document';
  children: TreeNode[];
  status?: DocumentStatus;
}

export type AiProvider = 'anthropic' | 'openai-compatible' | 'ollama';
export type ImageProvider = 'dalle' | 'openai-compatible-image';
export type ImageSize = '1024x1024' | '768x768' | '512x512' | '256x256';
export type TranscriptionProvider = 'openai' | 'groq' | 'local';

export interface ProjectSettings {
  autosaveInterval: number;
  maxSnapshots: number;
  aiModel: string;
  spellcheck: boolean;
  aiProvider:   AiProvider;
  aiEndpoint?:  string;
  aiApiKey?:    string;
  imageProvider?:  ImageProvider;
  imageEndpoint?:  string;
  imageApiKey?:    string;
  imageModel?:     string;
  imageSize?:      ImageSize;
  transcriptionProvider?:  TranscriptionProvider;
  transcriptionEndpoint?:  string;
  transcriptionApiKey?:    string;
  transcriptionModel?:     string;
  transcriptionLanguage?:  string;
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
