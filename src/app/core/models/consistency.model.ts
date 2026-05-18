export interface ConsistencyReport {
  projectId:         string;
  generatedAt:       string;
  documentsAnalyzed: number;
  issues:            ConsistencyIssue[];
  summary:           string;
}

export interface ConsistencyIssue {
  id:          string;
  severity:    'high' | 'medium' | 'low';
  type:        IssueType;
  description: string;
  documents:   string[];
  quote?:      string;
  suggestion?: string;
}

export type IssueType =
  | 'character-description'
  | 'character-name'
  | 'timeline'
  | 'location'
  | 'object'
  | 'relationship'
  | 'other';

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  'character-description': 'Descripción de personaje',
  'character-name':        'Nombre de personaje',
  'timeline':              'Línea temporal',
  'location':              'Descripción de lugar',
  'object':                'Objeto o elemento',
  'relationship':          'Relación entre personajes',
  'other':                 'Otro',
};

export const ISSUE_SEVERITY_CONFIG: Record<
  ConsistencyIssue['severity'],
  { label: string; color: string }
> = {
  high:   { label: 'Alta',  color: 'var(--ink-danger)' },
  medium: { label: 'Media', color: 'var(--ink-warning)' },
  low:    { label: 'Baja',  color: 'var(--ink-subtle)' },
};
