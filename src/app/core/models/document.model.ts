export interface DocumentFile {
  id: string;
  title: string;
  synopsis?: string;
  content: object;
  snapshots: Snapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface Snapshot {
  id: string;
  content: object;
  createdAt: string;
  label?: string;
}

export const EMPTY_TIPTAP_CONTENT: object = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};
