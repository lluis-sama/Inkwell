import { Injectable, inject } from '@angular/core';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TauriBridgeService } from './tauri-bridge.service';
import { ExportOptions, ExportMetadata } from '../models/export.model';
import { DocumentFile } from '../models/document.model';
// @ts-expect-error — browser bundle, no separate type declarations
import epub from 'epub-gen-memory/dist/bundle.min.js';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private bridge = inject(TauriBridgeService);

  async export(
    options: ExportOptions,
    documents: DocumentFile[],
    projectTitle: string,
  ): Promise<void> {
    const ordered = options.selectedDocumentIds
      .map(id => documents.find(d => d.id === id))
      .filter((d): d is DocumentFile => !!d);

    if (options.format === 'pdf-manuscript') {
      await this.exportManuscriptPdf(ordered, options.metadata, projectTitle);
    } else {
      await this.exportEpub(ordered, options.metadata, projectTitle);
    }
  }

  private async exportManuscriptPdf(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
  ): Promise<void> {
    const wordCount = this.countWords(docs);
    const html = this.buildManuscriptHtml(docs, meta, title, wordCount);
    await this.bridge.openPrintWindow(html);
  }

  buildManuscriptHtml(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
    wordCount: number,
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
      this.buildChapterHtml(doc, i === 0)
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

  private buildChapterHtml(doc: DocumentFile, isFirst: boolean): string {
    const html = generateHTML(doc.content as any, [StarterKit]);
    return `
<div class="chapter" ${isFirst ? 'style="page-break-before: avoid"' : ''}>
  <div class="chapter-title">${doc.title}</div>
  ${html}
</div>`;
  }

  private async exportEpub(
    docs: DocumentFile[],
    meta: ExportMetadata,
    title: string,
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

    const buffer = await epub(
      {
        title,
        author: meta.penName ?? meta.legalName,
        publisher: meta.publisher ?? '',
        description: meta.synopsis ?? '',
        lang: meta.language,
      },
      chapters,
    );

    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    await this.bridge.writeBinaryFile(savePath, arrayBuffer);
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
