/** Etiquetas fixas e não sensíveis (enum `journal_tag`). Únicos filtros além de data e humor. */
export const JOURNAL_TAGS = [
  'work',
  'study',
  'family',
  'friends',
  'rest',
  'movement',
  'leisure',
  'nature',
  'routine',
  'other',
] as const;
export type JournalTag = (typeof JOURNAL_TAGS)[number];

/** Entrada do diário. `content` só vem decifrado quando a tela pede o texto. */
export interface JournalRecord {
  id: string;
  day: string;
  mood: number | null;
  tags: JournalTag[];
  content: string | null;
}
