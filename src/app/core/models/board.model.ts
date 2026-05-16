export interface BoardFile {
  id: string;
  title: string;
  cards: Card[];
  createdAt: string;
  updatedAt: string;
}

export type CardType = 'character' | 'note' | 'research' | 'other';

export interface CharacterData {
  aliases?: string[];
  appearsInChapters: string[];
  lastScannedAt?: string;
}

export interface Card {
  id: string;
  title: string;
  body: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: CardType;
  characterData?: CharacterData;
}

export const DEFAULT_CARD_COLORS: string[] = [
  '#313244',
  '#45475a',
  '#4a3f6b',
  '#3b4f6b',
  '#3b5e4f',
  '#6b4a3b',
];

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  character:  'Personaje',
  note:       'Nota',
  research:   'Investigación',
  other:      'Otro',
};

export const CARD_TYPE_ICONS: Record<CardType, string> = {
  character:  '👤',
  note:       '📝',
  research:   '🔍',
  other:      '📌',
};

export const DEFAULT_COLORS_BY_TYPE: Record<CardType, string> = {
  character: '#4a3f6b',
  note:      '#313244',
  research:  '#3b4f6b',
  other:     '#45475a',
};
