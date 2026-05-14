export interface BoardFile {
  id: string;
  title: string;
  cards: Card[];
  createdAt: string;
  updatedAt: string;
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
}

export const DEFAULT_CARD_COLORS: string[] = [
  '#313244',
  '#45475a',
  '#4a3f6b',
  '#3b4f6b',
  '#3b5e4f',
  '#6b4a3b',
];
