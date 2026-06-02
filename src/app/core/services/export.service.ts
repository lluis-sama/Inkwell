import { Injectable, inject } from '@angular/core';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TauriBridgeService } from './tauri-bridge.service';
import { ExportOptions, ExportMetadata } from '../models/export.model';
import { DocumentFile } from '../models/document.model';
import {
  Document, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Packer,
} from 'docx';
// @ts-expect-error — browser bundle, no separate type declarations
import epub from 'epub-gen-memory/dist/bundle.min.js';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private bridge = inject(TauriBridgeService);
  private _epub = epub;
  private _docxPacker = Packer;

  async export(
    options: ExportOptions,
    documents: DocumentFile[],
    projectTitle: string,
  ): Promise<void> {
    const ordered = options.selectedDocumentIds
      .map(id => documents.find(d => d.id === id))
      .filter((d): d is DocumentFile => !!d);

    const prependTitles = options.prependChapterTitles;

    if (options.format === 'pdf-manuscript') {
      await this.exportManuscriptPdf(ordered, options.metadata, projectTitle, prependTitles);
    } else if (options.format === 'docx') {
      await this.exportDocx(ordered, options.metadata, projectTitle, prependTitles);
    } else {
      await this.exportEpub(ordered, options.metadata, projectTitle, prependTitles);
    }
  }

  private async exportManuscriptPdf(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
    prependTitles: boolean,
  ): Promise<void> {
    const wordCount = this.countWords(docs);
    const html = this.buildManuscriptHtml(docs, meta, title, wordCount, prependTitles);
    await this.bridge.openPrintWindow(html);
  }

  buildManuscriptHtml(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
    wordCount: number,
    prependTitles: boolean,
  ): string {
    const pageSize = meta.pageSize === 'a4' ? 'A4' : 'letter';
    const authorLine = meta.penName
      ? `${meta.penName} (${meta.legalName})`
      : meta.legalName;
    const wordCountFormatted =
      `~${Math.round(wordCount / 1000) * 1000}`.replace(
        /\B(?=(\d{3})+(?!\d))/g, '.',
      ) + ' palabras';

    const chaptersHtml = docs.map((doc, i) =>
      this.buildChapterHtml(doc, i === 0, prependTitles)
    ).join('\n');

    return `<!DOCTYPE html>
<html lang="${meta.language}">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: ${pageSize};
    margin: 2.5cm;
  }
  @page :first {
    @top-right { content: ''; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 2;
    color: #000;
    background: #fff;
    text-align: left;
  }

  /* ── Vista en pantalla: simula páginas con márgenes ── */
  @media screen {
    html { background: #888; }
    body {
      max-width: ${meta.pageSize === 'a4' ? '210mm' : '215.9mm'};
      margin: 2rem auto;
      padding: 2.5cm;
      background: #fff;
      box-shadow: 0 2px 12px rgba(0,0,0,0.35);
      min-height: ${meta.pageSize === 'a4' ? '297mm' : '279.4mm'};
    }
    .print-toolbar {
      position: fixed;
      top: 0; left: 0; right: 0;
      background: #333;
      color: #fff;
      padding: 0.6rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      font-family: sans-serif;
      font-size: 13px;
      z-index: 999;
    }
    .print-toolbar button {
      background: #fff;
      color: #333;
      border: none;
      padding: 0.35rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .print-toolbar button:hover { background: #eee; }
    body { margin-top: 3.5rem; }
  }

  /* ── Estilos de impresión ── */
  @media print {
    html { background: #fff; }
    .print-toolbar { display: none; }
    body {
      max-width: none;
      margin: 0;
      padding: 0;
      box-shadow: none;
    }
  }

  .title-page {
    page-break-after: always;
    min-height: calc(${meta.pageSize === 'a4' ? '297mm' : '279.4mm'} - 5cm);
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .title-page .contact-block {
    font-size: 12pt;
    line-height: 1.5;
    position: absolute;
    top: 0; left: 0;
  }
  .title-page .wordcount-block {
    font-size: 12pt;
    position: absolute;
    top: 0; right: 0;
  }
  .title-page .center-block {
    position: absolute;
    top: 33%;
    left: 0; right: 0;
    text-align: center;
  }
  .title-page .center-block .book-title {
    font-size: 12pt;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .title-page .center-block .by-line {
    margin-top: 1em;
  }
  .title-page .genre-block {
    position: absolute;
    bottom: 0;
    left: 0; right: 0;
    text-align: center;
  }

  .chapter {
    page-break-before: always;
  }
  .chapter-title {
    text-align: center;
    padding-top: 33vh;
    padding-bottom: 2em;
    font-size: 12pt;
    font-weight: normal;
    text-transform: uppercase;
  }
  p {
    text-indent: 1.25cm;
    margin-bottom: 0;
  }
  .chapter > p:first-of-type,
  .chapter-title + p {
    text-indent: 0;
  }
  blockquote {
    margin: 1em 2.5cm;
    text-indent: 0;
  }
  h1, h2, h3 {
    font-size: 12pt;
    font-weight: normal;
    text-align: center;
    text-transform: uppercase;
    margin: 2em 0 0 0;
    page-break-after: avoid;
  }

  .manuscript-end {
    text-align: center;
    margin-top: 2em;
  }
</style>
</head>
<body>

<div class="print-toolbar">
  <span>Inkwell — Manuscrito listo para imprimir</span>
  <button onclick="window.print()">Guardar como PDF / Imprimir</button>
</div>

<div class="title-page">
  <div class="contact-block">
    ${meta.legalName}<br>
    ${meta.address ? meta.address + '<br>' : ''}
    ${meta.phone ? meta.phone + '<br>' : ''}
    ${meta.email}
    ${meta.agentName ? `<br><br>${meta.agentName}<br>${meta.agentContact ?? ''}` : ''}
  </div>
  <div class="wordcount-block">${wordCountFormatted}</div>
  <div class="center-block">
    <div class="book-title">${title}</div>
    <div class="by-line">by ${authorLine}</div>
  </div>
  <div class="genre-block">${meta.genre}</div>
</div>

${chaptersHtml}

<div class="manuscript-end"># # #</div>

</body>
</html>`;
  }

  private buildChapterHtml(doc: DocumentFile, isFirst: boolean, prependTitle: boolean): string {
    const html = generateHTML(doc.content as any, [StarterKit]);
    const titleHtml = prependTitle ? `<div class="chapter-title">${doc.title}</div>` : '';
    return `
<div class="chapter" ${isFirst ? 'style="page-break-before: avoid"' : ''}>
  ${titleHtml}
  ${html}
</div>`;
  }

  private async exportEpub(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
    prependTitles: boolean,
  ): Promise<void> {
    const savePath = await this.bridge.saveFileDialog(
      `${title}.epub`,
      'epub',
    );
    if (!savePath) return;

    const chapters = docs.map(doc => ({
      title: doc.title,
      content: generateHTML(doc.content as any, [StarterKit]),
    }));

    const blob = await this._epub(
      {
        title,
        author: meta.penName ?? meta.legalName,
        publisher: meta.publisher ?? '',
        description: meta.synopsis ?? '',
        lang: meta.language,
        prependChapterTitles: prependTitles,
      },
      chapters,
    );

    const arrayBuffer = await blob.arrayBuffer();

    await this.bridge.writeBinaryFile(savePath, arrayBuffer);
  }

  private async exportDocx(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
    prependTitles: boolean,
  ): Promise<void> {
    const savePath = await this.bridge.saveFileDialog(`${title}.docx`, 'docx');
    if (!savePath) return;

    const wordCount = this.countWords(docs);
    const docxDoc = this.buildDocxDocument(docs, meta, title, wordCount, prependTitles);
    const blob = await this._docxPacker.toBlob(docxDoc);
    const arrayBuffer = await blob.arrayBuffer();

    await this.bridge.writeBinaryFile(savePath, arrayBuffer);
  }

  private buildDocxDocument(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
    wordCount: number,
    prependTitles: boolean,
  ): Document {
    const authorLine = meta.penName ?? meta.legalName;
    const wordCountFormatted =
      `~${Math.round(wordCount / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' palabras';

    const children: Paragraph[] = [];

    // Página de título
    children.push(
      new Paragraph({ text: meta.legalName }),
      new Paragraph({ text: meta.address ?? '' }),
      new Paragraph({ text: meta.phone ?? '' }),
      new Paragraph({ text: meta.email }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: title.toUpperCase(), alignment: AlignmentType.CENTER }),
      new Paragraph({ text: `by ${authorLine}`, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: wordCountFormatted, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: meta.genre, alignment: AlignmentType.CENTER }),
    );

    // Capítulos
    for (const doc of docs) {
      if (prependTitles) {
        children.push(
          new Paragraph({
            text:            doc.title,
            heading:         HeadingLevel.HEADING_1,
            alignment:       AlignmentType.CENTER,
            pageBreakBefore: true,
          }),
        );
      }
      children.push(...this.tiptapToDocxParagraphs(doc.content));
    }

    children.push(
      new Paragraph({ text: '' }),
      new Paragraph({ text: '# # #', alignment: AlignmentType.CENTER }),
    );

    return new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      }],
      styles: {
        default: {
          document: {
            run: { font: 'Times New Roman', size: 24 },
            paragraph: { spacing: { line: 480 } },
          },
        },
      },
    });
  }

  private tiptapToDocxParagraphs(content: object): Paragraph[] {
    const doc = content as { type: string; content?: TipTapNode[] };
    return (doc.content ?? []).flatMap(node => this.nodeToDocx(node));
  }

  private nodeToDocx(node: TipTapNode): Paragraph[] {
    switch (node.type) {
      case 'paragraph':
        return [new Paragraph({
          children: this.inlineToRuns(node.content ?? []),
          indent: { firstLine: 720 },
        })];

      case 'heading': {
        const levels: typeof HeadingLevel[keyof typeof HeadingLevel][] = [
          HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
        ];
        const level = levels[(node.attrs?.['level'] as number ?? 1) - 1] ?? HeadingLevel.HEADING_1;
        return [new Paragraph({
          children: this.inlineToRuns(node.content ?? []),
          heading:  level,
          alignment: AlignmentType.CENTER,
        })];
      }

      case 'blockquote':
        return (node.content ?? []).flatMap(child => this.nodeToDocx(child));

      case 'bulletList':
      case 'orderedList':
        return (node.content ?? []).flatMap(item =>
          (item.content ?? []).flatMap(p =>
            new Paragraph({
              children: this.inlineToRuns(p.content ?? []),
              bullet: { level: 0 },
            })
          )
        );

      case 'horizontalRule':
        return [new Paragraph({ text: '* * *', alignment: AlignmentType.CENTER })];

      default:
        return [];
    }
  }

  private inlineToRuns(nodes: TipTapNode[]): TextRun[] {
    return nodes.map(n => {
      if (n.type !== 'text') return new TextRun('');
      const marks = n.marks ?? [];
      return new TextRun({
        text:    n.text ?? '',
        bold:    marks.some(m => m.type === 'bold'),
        italics: marks.some(m => m.type === 'italic'),
        strike:  marks.some(m => m.type === 'strike'),
      });
    });
  }

  countWords(docs: DocumentFile[]): number {
    return docs.reduce((total, doc) => {
      const text = generateHTML(doc.content as any, [StarterKit])
        .replace(/<[^>]+>/g, ' ')
        .trim();
      const words = text.split(/\s+/).filter(w => w.length > 0);
      return total + words.length;
    }, 0);
  }
}

interface TipTapNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string }>;
}
