# INK-18 — Buscador de inconsistencias narrativas

## Objetivo

Implementar un analizador que usa IA para detectar inconsistencias a lo largo de los documentos del proyecto: contradicciones en la descripción de personajes, inconsistencias temporales, errores de continuidad, y elementos que cambian de nombre o características entre capítulos. El análisis es batch — el usuario lo lanza manualmente y recibe un informe estructurado.

---

## Diseño del sistema

### Problema técnico central

Un modelo de IA tiene una ventana de contexto finita. Una novela de 80.000 palabras no cabe en un solo prompt. La solución es un análisis en dos fases:

**Fase 1 — Extracción por documento**: por cada documento, se extrae un resumen estructurado de los "hechos establecidos" (descripciones de personajes, lugares, fechas mencionadas, objetos importantes, relaciones entre personajes). Este resumen es compacto — unas 200-400 palabras por capítulo.

**Fase 2 — Análisis de inconsistencias**: se envía al modelo el conjunto de resúmenes de todos los capítulos (que sí cabe en contexto) junto con la lista de personajes del proyecto (INK-14), y se le pide que identifique contradicciones entre ellos.

Este enfoque permite analizar novelas largas sin truncar el texto.

---

## Nuevas dependencias

Ninguna. Usa `AiService` existente con llamadas no-streaming (para el análisis batch).

---

## Modelos de datos

### `src/app/core/models/consistency.model.ts`

```typescript
export interface ConsistencyReport {
  projectId:    string;
  generatedAt:  string;   // ISO 8601
  documentsAnalyzed: number;
  issues:       ConsistencyIssue[];
  summary:      string;   // párrafo resumen del análisis
}

export interface ConsistencyIssue {
  id:           string;
  severity:     'high' | 'medium' | 'low';
  type:         IssueType;
  description:  string;   // descripción del problema en lenguaje natural
  documents:    string[]; // títulos de los documentos involucrados
  quote?:       string;   // fragmento relevante si está disponible (máx 100 chars)
  suggestion?:  string;   // sugerencia de cómo resolver la inconsistencia
}

export type IssueType =
  | 'character-description'   // descripción física o psicológica contradictoria
  | 'character-name'          // variación de nombre no justificada
  | 'timeline'                // inconsistencia temporal o de fechas
  | 'location'                // descripción contradictoria de un lugar
  | 'object'                  // objeto que aparece o desaparece sin explicación
  | 'relationship'            // relación entre personajes que cambia sin justificación
  | 'other';                  // otros tipos de inconsistencia

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  'character-description': 'Descripción de personaje',
  'character-name':        'Nombre de personaje',
  'timeline':              'Línea temporal',
  'location':              'Descripción de lugar',
  'object':                'Objeto o elemento',
  'relationship':          'Relación entre personajes',
  'other':                 'Otro',
};

export const ISSUE_SEVERITY_CONFIG: Record<
  ConsistencyIssue['severity'],
  { label: string; color: string }
> = {
  high:   { label: 'Alta',  color: 'var(--ink-danger)' },
  medium: { label: 'Media', color: 'var(--ink-warning)' },
  low:    { label: 'Baja',  color: 'var(--ink-subtle)' },
};
```

### `src/app/shared/utils/project-paths.ts` — añadir ruta

```typescript
export function consistencyReportPath(basePath: string): string {
  return `${basePath}/consistency-report.json`;
}
```

---

## ConsistencyService

### `src/app/core/services/consistency.service.ts`

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService }     from './project.service';
import { DocumentService }    from './document.service';
import { AiService }          from './ai.service';
import { BoardService }       from './board.service';
import { DocumentFile }       from '../models/document.model';
import { ConsistencyReport, ConsistencyIssue } from '../models/consistency.model';
import { tiptapToText }       from '../../shared/utils/tiptap-to-text';
import {
  documentPath, documentsFolderPath,
  boardsFolderPath, boardPath,
  consistencyReportPath,
} from '../../shared/utils/project-paths';

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

const BATCH_SIZE = 5; // documentos por llamada de extracción (para no saturar la API)

@Injectable({ providedIn: 'root' })
export class ConsistencyService {
  private bridge  = inject(TauriBridgeService);
  private project = inject(ProjectService);
  private ai      = inject(AiService);

  // Estado del análisis en progreso
  readonly isAnalyzing   = signal(false);
  readonly progress      = signal({ current: 0, total: 0, phase: '' });
  readonly lastReport    = signal<ConsistencyReport | null>(null);

  // ─── Análisis principal ───────────────────────────────────────────────────

  async analyze(onProgress?: (msg: string) => void): Promise<ConsistencyReport> {
    this.isAnalyzing.set(true);
    this.progress.set({ current: 0, total: 0, phase: 'Preparando...' });

    try {
      const basePath = this.project.basePath()!;
      const project  = this.project.project()!;

      // 1. Obtener lista de documentos en orden del binder
      const docIds    = this.flattenDocumentIds(project.tree);
      const docTitles = this.flattenDocumentTitles(project.tree);

      this.progress.set({ current: 0, total: docIds.length + 1, phase: 'Cargando documentos...' });

      // 2. Cargar los documentos
      const docs: DocumentFile[] = [];
      for (const id of docIds) {
        try {
          const raw = await this.bridge.readJsonFile(documentPath(basePath, id));
          docs.push(JSON.parse(raw));
        } catch { /* ignorar documentos no legibles */ }
      }

      // 3. Cargar personajes de los tableros
      const characterList = await this.loadCharacterList(basePath);

      // 4. Fase 1: extraer hechos por documento
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

        if (text.length < 100) {
          // Documento muy corto — omitir extracción
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

      // 5. Fase 2: análisis de inconsistencias
      this.progress.set({
        current: docs.length,
        total:   docs.length + 1,
        phase:   'Buscando inconsistencias...',
      });

      onProgress?.('Analizando inconsistencias entre capítulos...');

      const report = await this.detectInconsistencies(
        factsPerDoc,
        characterList,
        project.id,
        docs.length,
      );

      // 6. Guardar el informe
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

  // ─── Fases del análisis ───────────────────────────────────────────────────

  private async extractFacts(text: string, title: string): Promise<string> {
    // Truncar si el texto es muy largo (máx ~6000 palabras por capítulo para la extracción)
    const truncated = text.length > 30000 ? text.slice(0, 30000) + '\n[...texto truncado]' : text;

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
    // Construir el contexto con todos los hechos
    const context = factsPerDoc
      .map(d => `=== ${d.title} ===\n${d.facts}`)
      .join('\n\n');

    const rawResponse = await this.callAiOnce(
      context,
      ANALYSIS_PROMPT(characterList),
    );

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

  // ─── Llamada directa a la API (sin streaming) ─────────────────────────────

  private async callAiOnce(userContent: string, systemPrompt: string): Promise<string> {
    const apiKey = this.ai.apiKey();
    if (!apiKey) throw new Error('API key no configurada');

    const model = this.project.project()?.settings.aiModel ?? 'claude-sonnet-4-20250514';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                    'application/json',
        'x-api-key':                        apiKey,
        'anthropic-version':               '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as any).error?.message ?? `Error ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text ?? '';
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────

  private flattenDocumentIds(tree: import('../models/project.model').TreeNode[]): string[] {
    return tree.flatMap(n =>
      n.type === 'folder' ? this.flattenDocumentIds(n.children) : [n.id]
    );
  }

  private flattenDocumentTitles(tree: import('../models/project.model').TreeNode[]): string[] {
    return tree.flatMap(n =>
      n.type === 'folder' ? this.flattenDocumentTitles(n.children) : [n.title]
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
```

---

## ConsistencyModalComponent

### `src/app/features/editor/consistency/consistency-modal.component.ts`

```typescript
import {
  Component, inject, signal, OnInit, output,
} from '@angular/core';
import { ConsistencyService } from '../../../core/services/consistency.service';
import { ConsistencyReport, ISSUE_TYPE_LABELS, ISSUE_SEVERITY_CONFIG }
  from '../../../core/models/consistency.model';
import { AiService } from '../../../core/services/ai.service';
import { InkModalComponent }  from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';

@Component({
  selector: 'app-consistency-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent],
  template: `
    <ink-modal title="Análisis de inconsistencias" [hasActions]="false"
               (closed)="closed.emit()">

      <div class="flex flex-col gap-5 max-h-[70vh] overflow-y-auto">

        <!-- Sin API key -->
        @if (!ai.hasApiKey()) {
          <div class="flex flex-col gap-2 p-4 rounded-lg border border-ink-warning/30 bg-ink-bg">
            <p class="text-ink-warning text-sm">Configura la API key de Anthropic para usar esta función.</p>
          </div>
        }

        <!-- Estado: en análisis -->
        @if (consistencySvc.isAnalyzing()) {
          <div class="flex flex-col gap-4">
            <div class="flex items-center gap-3">
              <span class="inline-block w-5 h-5 border-2 border-ink-accent
                           border-t-transparent rounded-full animate-spin shrink-0"></span>
              <span class="text-ink-text text-sm">
                {{ consistencySvc.progress().phase }}
              </span>
            </div>
            @if (consistencySvc.progress().total > 0) {
              <div class="flex flex-col gap-1.5">
                <div class="w-full h-1.5 rounded-full bg-ink-border overflow-hidden">
                  <div
                    class="h-full bg-ink-accent transition-all duration-300 rounded-full"
                    [style.width.%]="(consistencySvc.progress().current / consistencySvc.progress().total) * 100">
                  </div>
                </div>
                <p class="text-ink-subtle text-xs text-right">
                  {{ consistencySvc.progress().current }} / {{ consistencySvc.progress().total }}
                </p>
              </div>
            }
            <div class="max-h-32 overflow-y-auto flex flex-col gap-1">
              @for (log of progressLog(); track log) {
                <p class="text-ink-muted text-xs">{{ log }}</p>
              }
            </div>
          </div>
        }

        <!-- Estado: sin análisis previo -->
        @if (!consistencySvc.isAnalyzing() && !report()) {
          <div class="flex flex-col gap-4">
            <p class="text-ink-subtle text-sm leading-relaxed">
              El análisis examina todos los capítulos del proyecto en busca de
              contradicciones: descripciones de personajes, línea temporal,
              objetos, relaciones y nombres.
            </p>

            <div class="p-3 rounded-lg bg-ink-bg border border-ink-border">
              <p class="text-ink-subtle text-xs leading-relaxed">
                <strong class="text-ink-text">Cómo funciona:</strong>
                El análisis se hace en dos fases. Primero se extrae un resumen
                de hechos de cada capítulo por separado, luego se comparan entre sí.
                Esto permite analizar novelas largas sin límite de contexto.
              </p>
            </div>

            <div class="p-3 rounded-lg bg-ink-bg border border-ink-border">
              <p class="text-ink-subtle text-xs leading-relaxed">
                <strong class="text-ink-text">Coste estimado:</strong>
                ~{{ estimatedCost() }} llamadas a la API
                (1 por capítulo + 1 para el análisis global).
                Usa el modelo configurado en settings.
              </p>
            </div>

            <ink-button
              variant="primary"
              [fullWidth]="true"
              [disabled]="!ai.hasApiKey()"
              (clicked)="startAnalysis()">
              Iniciar análisis
            </ink-button>
          </div>
        }

        <!-- Estado: informe disponible -->
        @if (!consistencySvc.isAnalyzing() && report(); as r) {
          <div class="flex flex-col gap-4">

            <!-- Cabecera del informe -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-ink-text text-sm">
                  {{ r.issues.length === 0
                    ? '✅ Sin inconsistencias detectadas'
                    : r.issues.length + ' posible' + (r.issues.length > 1 ? 's inconsistencias' : ' inconsistencia') }}
                </p>
                <p class="text-ink-subtle text-xs mt-0.5">
                  {{ r.documentsAnalyzed }} capítulos analizados ·
                  {{ formatDate(r.generatedAt) }}
                </p>
              </div>
              <ink-button variant="ghost" (clicked)="startAnalysis()">
                Re-analizar
              </ink-button>
            </div>

            <!-- Resumen -->
            <div class="p-3 rounded-lg bg-ink-bg border border-ink-border">
              <p class="text-ink-subtle text-sm leading-relaxed">{{ r.summary }}</p>
            </div>

            <!-- Lista de issues -->
            @if (r.issues.length > 0) {
              <div class="flex flex-col gap-3">
                @for (issue of sortedIssues(); track issue.id) {
                  <div class="flex flex-col gap-2 p-3 rounded-lg border border-ink-border
                              bg-ink-bg">

                    <!-- Severidad + tipo -->
                    <div class="flex items-center gap-2">
                      <span
                        class="px-2 py-0.5 rounded-full text-xs font-medium border"
                        [style.color]="severityConfig[issue.severity].color"
                        [style.border-color]="severityConfig[issue.severity].color + '40'">
                        {{ severityConfig[issue.severity].label }}
                      </span>
                      <span class="text-ink-subtle text-xs">
                        {{ typeLabels[issue.type] }}
                      </span>
                    </div>

                    <!-- Descripción -->
                    <p class="text-ink-text text-sm leading-relaxed">
                      {{ issue.description }}
                    </p>

                    <!-- Documentos involucrados -->
                    <div class="flex flex-wrap gap-1.5">
                      @for (doc of issue.documents; track doc) {
                        <span class="px-2 py-0.5 rounded bg-ink-surface
                                     text-ink-subtle text-xs border border-ink-border">
                          {{ doc }}
                        </span>
                      }
                    </div>

                    <!-- Fragmento -->
                    @if (issue.quote) {
                      <p class="text-ink-subtle text-xs italic border-l-2
                                 border-ink-muted pl-2 leading-relaxed">
                        "{{ issue.quote }}"
                      </p>
                    }

                    <!-- Sugerencia -->
                    @if (issue.suggestion) {
                      <div class="flex items-start gap-1.5">
                        <span class="text-ink-accent text-xs shrink-0 mt-0.5">💡</span>
                        <p class="text-ink-subtle text-xs leading-relaxed">
                          {{ issue.suggestion }}
                        </p>
                      </div>
                    }

                  </div>
                }
              </div>
            }

          </div>
        }

      </div>
    </ink-modal>
  `,
})
export class ConsistencyModalComponent implements OnInit {
  consistencySvc = inject(ConsistencyService);
  ai             = inject(AiService);
  closed         = output<void>();

  report      = signal<ConsistencyReport | null>(null);
  progressLog = signal<string[]>([]);

  readonly typeLabels     = ISSUE_TYPE_LABELS;
  readonly severityConfig = ISSUE_SEVERITY_CONFIG;

  sortedIssues = () => {
    const r = this.report();
    if (!r) return [];
    const order = { high: 0, medium: 1, low: 2 };
    return [...r.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  };

  estimatedCost = () => {
    // Número de documentos del proyecto + 1 llamada de análisis
    const tree  = this.consistencySvc['project']?.project()?.tree ?? [];
    return this.countDocs(tree) + 1;
  };

  async ngOnInit(): Promise<void> {
    // Intentar cargar un informe guardado previo
    const saved = await this.consistencySvc.loadSavedReport();
    if (saved) this.report.set(saved);
  }

  async startAnalysis(): Promise<void> {
    this.progressLog.set([]);
    try {
      const r = await this.consistencySvc.analyze(msg => {
        this.progressLog.update(logs => [...logs.slice(-10), msg]);
      });
      this.report.set(r);
    } catch (e) {
      this.progressLog.update(l => [...l, `Error: ${e}`]);
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  private countDocs(tree: any[]): number {
    return tree.reduce((sum: number, n: any) =>
      sum + (n.type === 'folder' ? this.countDocs(n.children) : 1), 0);
  }
}
```

---

## Integración en `InkNavComponent`

```html
@if (projectService.isLoaded()) {
  <button
    (click)="showConsistency.set(true)"
    title="Análisis de inconsistencias"
    class="nav-icon"
    [class.text-ink-warning]="consistencySvc.isAnalyzing()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0
               1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  </button>
}

@if (showConsistency()) {
  <app-consistency-modal (closed)="showConsistency.set(false)"/>
}
```

```typescript
private consistencySvc = inject(ConsistencyService);
showConsistency = signal(false);
```

---

## Criterios de aceptación

**Configuración previa:**
- [ ] Sin API key, el modal muestra el mensaje de configuración
- [ ] El modal muestra el coste estimado en llamadas a la API antes de iniciar

**Análisis:**
- [ ] El botón "Iniciar análisis" arranca el proceso
- [ ] La barra de progreso avanza documento a documento
- [ ] El log de progreso muestra qué documento se está procesando
- [ ] El icono en la nav parpadea/cambia mientras el análisis está en curso
- [ ] El análisis puede ejecutarse con proyectos de 1 a N capítulos sin límite
- [ ] Los capítulos vacíos (< 100 palabras) se omiten sin error

**Informe:**
- [ ] El informe muestra el número de inconsistencias encontradas
- [ ] Si no hay inconsistencias, muestra un mensaje positivo claro
- [ ] Cada issue muestra: severidad (color), tipo, descripción, capítulos involucrados
- [ ] Los issues con fragmento muestran la cita en cursiva
- [ ] Los issues con sugerencia muestran el icono 💡 y el texto
- [ ] Los issues están ordenados de mayor a menor severidad
- [ ] El informe se persiste en `consistency-report.json` dentro del proyecto
- [ ] Al reabrir el modal, se carga el informe previo automáticamente

**Re-análisis:**
- [ ] El botón "Re-analizar" reemplaza el informe anterior
- [ ] Al re-analizar, el log de progreso se limpia

**Persistencia:**
- [ ] El fichero `consistency-report.json` existe en la carpeta del proyecto tras el análisis
- [ ] Si el proyecto se mueve o se abre en otro dispositivo, el informe se carga correctamente

---

## Lo que NO hacer en esta spec

- No implementar análisis automático al guardar (demasiado costoso en tokens)
- No añadir la capacidad de marcar issues como "resueltos" o "falso positivo" (backlog)
- No implementar análisis parcial (solo algunos capítulos seleccionados)
- No mostrar el análisis en el editor inline (el informe es siempre en el modal)
- No soportar modelos que no sean los configurados en settings
