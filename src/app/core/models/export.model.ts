export type ExportFormat = 'pdf-manuscript' | 'epub' | 'docx';
export type PageSize = 'a4' | 'letter';

export interface ExportMetadata {
  // Autor
  legalName: string;
  penName?: string;
  email: string;
  phone?: string;
  address?: string;
  agentName?: string;
  agentContact?: string;

  // Obra
  genre: string;
  pageSize: PageSize;
  language: string;         // BCP 47, default: 'es'
  copyrightYear: number;    // default: current year

  // EPUB adicional
  isbn?: string;
  publisher?: string;
  synopsis?: string;
}

export interface ExportOptions {
  format: ExportFormat;
  selectedDocumentIds: string[];   // IDs de los documentos a incluir, en orden
  metadata: ExportMetadata;
  prependChapterTitles: boolean;
}

export const DEFAULT_EXPORT_METADATA: ExportMetadata = {
  legalName: '',
  email: '',
  genre: '',
  pageSize: 'a4',
  language: 'es',
  copyrightYear: new Date().getFullYear(),
};
