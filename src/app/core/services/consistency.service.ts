import { Injectable, inject, signal } from '@angular/core';
import { fetch } from '@tauri-apps/plugin-http';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { AiService }          from './ai.service';
import { DocumentFile }       from '../models/document.model';
import { ConsistencyReport, ConsistencyIssue } from '../models/consistency.model';
import { tiptapToText }       from '../../shared/utils/tiptap-to-text';
import {
  documentPath,
  boardsFolderPath,
  boardPath,
  consistencyReportPath,
} from '../../shared/utils/project-paths';
import { TreeNode } from '../models/project.model';

const EXTRACTION_PROMPT = `Eres un asistente literario. Analiza el siguiente capítulo y extrae los HECHOS ESTABLECIDOS de forma estructurada y concisa.

Incluye SOLO hechos explícitamente mencionados en el texto:
- Descripción física de personajes (color de ojos, cabello, altura, edad, cicatrices, ropa característica)
- Nombre completo y apodos de personajes
- Relaciones entre personajes (familia, amistad, enemistad, romance)
- Lugares y sus características físicas
- Objetos importantes y quién los posee
- Fechas, horas o referencias temporales mencionadas
- Eventos con consecuencias narrativas (muertes, heridas, decisiones importantes)

Formato de respuesta: texto plano, una línea por hecho. Sé conciso. Máximo 400 palabras.
Si el capítulo no establece hechos relevantes, responde: "Sin hechos relevantes."

NO incluyas suposiciones, interpretaciones ni hechos no mencionados explícitamente.`;

const ANALYSIS_PROMPT = (characterList: string) => `Eres un editor literario experto en continuidad narrativa.
Recibirás un conjunto de resúmenes de hechos establecidos capítulo a capítulo.
${characterList ? `\nPersonajes conocidos del proyecto:\n${characterList}\n` : ''}
Tu tarea es identificar INCONSISTENCIAS: hechos que se contradicen entre capítulos sin justificación narrativa.

IMPORTANTE:
- Solo reporta contradicciones claras, no ambigüedades interpretables.
- Distingue entre inconsistencias reales y recursos narrativos intencionales (un personaje que miente, un flashback, un narrador no fiable).
- Ordena los problemas de mayor a menor gravedad para la coherencia narrativa.

Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "summary": "párrafo resumen del análisis en 2-3 frases",
  "issues": [
    {
      "severity": "high|medium|low",
      "type": "character-description|character-name|timeline|location|object|relationship|other",
      "description": "descripción clara del problema",
      "documents": ["Título capítulo 1", "Título capítulo 2"],
      "quote": "fragmento relevante si existe (máx 100 chars)",
      "suggestion": "sugerencia breve de cómo resolverlo"
    }
  ]
}

Si no hay inconsistencias, retorna: {"summary": "No se detectaron inconsistencias narrativas.", "issues": []}`;

@Injectable({ providedIn: 'root' })
export class ConsistencyService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);
  private ai      = inject(AiService);

  readonly isAnalyzing = signal(false);
  readonly progress    = signal({ current: 0, total: 0, phase: '' });
  readonly lastReport  = signal<ConsistencyReport | null>(null);

  get documentCount(): number {
    return this.flattenDocumentIds(this.project.project()?.tree ?? []).length;
  }

  async analyze(onProgress?: (msg: string) => void): Promise<ConsistencyReport> {
    this.isAnalyzing.set(true);
    this.progress.set({ current: 0, total: 0, phase: 'Preparando...' });

    try {
      const basePath = this.project.basePath()!;
      const proj     = this.project.project()!;

      const docIds = this.flattenDocumentIds(proj.tree);

      this.progress.set({ current: 0, total: docIds.length + 1, phase: 'Cargando documentos...' });

      const docs: DocumentFile[] = [];
      for (const id of docIds) {
        try {
          const raw = await this.bridge.readJsonFile(documentPath(basePath, id));
          docs.push(JSON.parse(raw));
        } catch { /* ignorar documentos no legibles */ }
      }

      const characterList = await this.loadCharacterList(basePath);

      this.progress.update(p => ({ ...p, phase: 'Extrayendo hechos por capítulo...' }));

      const factsPerDoc: Array<{ title: string; facts: string }> = [];

      for (let i = 0; i < docs.length; i++) {
        const doc  = docs[i];
        const text = tiptapToText(doc.content).trim();

        this.progress.set({
          current: i + 1,
          total:   docs.length + 1,
          phase:   `Analizando: ${doc.title}`,
        });

        if (text.trim().split(/\s+/).filter(w => w.length > 0).length < 100) {
          factsPerDoc.push({ title: doc.title, facts: 'Documento sin contenido suficiente.' });
          continue;
        }

        try {
          const facts = await this.extractFacts(text, doc.title);
          factsPerDoc.push({ title: doc.title, facts });
        } catch {
          factsPerDoc.push({ title: doc.title, facts: 'Error al analizar este capítulo.' });
        }

        onProgress?.(`Analizado: ${doc.title} (${i + 1}/${docs.length})`);
      }

      this.progress.set({
        current: docs.length,
        total:   docs.length + 1,
        phase:   'Buscando inconsistencias...',
      });

      onProgress?.('Analizando inconsistencias entre capítulos...');

      const report = await this.detectInconsistencies(
        factsPerDoc,
        characterList,
        proj.id,
        docs.length,
      );

      await this.bridge.writeJsonFile(
        consistencyReportPath(basePath),
        JSON.stringify(report, null, 2),
      );

      this.lastReport.set(report);
      return report;

    } finally {
      this.isAnalyzing.set(false);
      this.progress.set({ current: 0, total: 0, phase: '' });
    }
  }

  async loadSavedReport(): Promise<ConsistencyReport | null> {
    const basePath = this.project.basePath();
    if (!basePath) return null;
    try {
      const raw    = await this.bridge.readJsonFile(consistencyReportPath(basePath));
      const report = JSON.parse(raw) as ConsistencyReport;
      this.lastReport.set(report);
      return report;
    } catch { return null; }
  }

  private async extractFacts(text: string, title: string): Promise<string> {
    const truncated = text.length > 30000
      ? text.slice(0, 30000) + '\n[...texto truncado]'
      : text;

    const response = await this.callAiOnce(
      `CAPÍTULO: ${title}\n\n${truncated}`,
      EXTRACTION_PROMPT,
    );

    return response.trim();
  }

  private async detectInconsistencies(
    factsPerDoc: Array<{ title: string; facts: string }>,
    characterList: string,
    projectId: string,
    documentsAnalyzed: number,
  ): Promise<ConsistencyReport> {
    const context = factsPerDoc
      .map(d => `=== ${d.title} ===\n${d.facts}`)
      .join('\n\n');

    const rawResponse = await this.callAiOnce(context, ANALYSIS_PROMPT(characterList));

    try {
      const parsed = JSON.parse(rawResponse.replace(/```json|```/g, '').trim());

      return {
        projectId,
        generatedAt:       new Date().toISOString(),
        documentsAnalyzed,
        summary:           parsed.summary ?? 'Análisis completado.',
        issues:            (parsed.issues ?? []).map((issue: Omit<ConsistencyIssue, 'id'>) => ({
          ...issue,
          id: crypto.randomUUID(),
        })),
      };
    } catch {
      return {
        projectId,
        generatedAt:       new Date().toISOString(),
        documentsAnalyzed,
        summary:           'Error al parsear el análisis. Inténtalo de nuevo.',
        issues:            [],
      };
    }
  }

  private async callAiOnce(userContent: string, systemPrompt: string): Promise<string> {
    const apiKey = this.ai.apiKey();
    if (!apiKey) throw new Error('API key no configurada');

    const model = this.project.project()?.settings.aiModel ?? 'claude-sonnet-4-20250514';

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('x-api-key', apiKey);
    headers.set('anthropic-version', '2023-06-01');
    headers.set('anthropic-dangerous-direct-browser-access', 'true');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { error?: { message?: string } }).error?.message
        ?? `Error ${response.status}`
      );
    }

    const data = await response.json();
    return (data as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '';
  }

  private flattenDocumentIds(tree: TreeNode[]): string[] {
    return tree.flatMap(n =>
      n.type === 'folder' ? this.flattenDocumentIds(n.children) : [n.id]
    );
  }

  private async loadCharacterList(basePath: string): Promise<string> {
    try {
      const boardIds = await this.bridge.listJsonFiles(boardsFolderPath(basePath));
      const lines: string[] = [];

      for (const id of boardIds) {
        const raw   = await this.bridge.readJsonFile(boardPath(basePath, id));
        const board = JSON.parse(raw);
        for (const card of board.cards ?? []) {
          if (card.type === 'character' && card.title) {
            const aliases = card.characterData?.aliases?.length
              ? ` (también: ${card.characterData.aliases.join(', ')})`
              : '';
            lines.push(`- ${card.title}${aliases}${card.body ? ': ' + card.body.slice(0, 80) : ''}`);
          }
        }
      }

      return lines.join('\n');
    } catch { return ''; }
  }
}
