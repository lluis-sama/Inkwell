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
  'character-description': 'CONSISTENCY.TYPE_CHARACTER_DESCRIPTION',
  'character-name':        'CONSISTENCY.TYPE_CHARACTER_NAME',
  'timeline':              'CONSISTENCY.TYPE_TIMELINE',
  'location':              'CONSISTENCY.TYPE_LOCATION',
  'object':                'CONSISTENCY.TYPE_OBJECT',
  'relationship':          'CONSISTENCY.TYPE_RELATIONSHIP',
  'other':                 'CONSISTENCY.TYPE_OTHER',
};

export const ISSUE_SEVERITY_CONFIG: Record<
  ConsistencyIssue['severity'],
  { label: string; color: string }
> = {
  high:   { label: 'CONSISTENCY.SEVERITY_HIGH',   color: 'var(--ink-danger)' },
  medium: { label: 'CONSISTENCY.SEVERITY_MEDIUM', color: 'var(--ink-warning)' },
  low:    { label: 'CONSISTENCY.SEVERITY_LOW',    color: 'var(--ink-subtle)' },
};
