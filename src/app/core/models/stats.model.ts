export interface WritingStats {
  entries: StatsEntry[];
}

export interface StatsEntry {
  date:       string;
  wordsAdded: number;
  sessions:   number;
}
