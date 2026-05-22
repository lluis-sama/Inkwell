# INK-22 — Transcripción de audio

## Objetivo

Permitir al usuario transcribir archivos de audio a texto usando IA (Whisper). La transcripción se crea como un documento nuevo dentro de una carpeta "Transcriptions" en el binder. Si la carpeta no existe, se crea automáticamente la primera vez. El punto de entrada es un botón en la `InkNavComponent`.

---

## Proveedores soportados

| Proveedor | Endpoint | Notas |
|---|---|---|
| **OpenAI Whisper** | `https://api.openai.com/v1/audio/transcriptions` | Requiere API key de OpenAI |
| **Groq** | `https://api.groq.com/openai/v1/audio/transcriptions` | Mismo formato que OpenAI. Tier gratuito disponible. |
| **Local (whisper.cpp / OpenAI-compatible)** | URL configurable | Cualquier servidor con endpoint `/v1/audio/transcriptions` |

Los tres usan el mismo formato de request (`multipart/form-data`), por lo que el código de llamada es idéntico — solo cambia la URL y la API key.

---

## Formatos de audio soportados

`.mp3`, `.mp4`, `.m4a`, `.wav`, `.ogg`, `.webm`, `.flac`

Límite de tamaño recomendado: 25MB (límite de la API de OpenAI). Para archivos mayores, mostrar advertencia.

---

## Modelo de datos — modificaciones

### `project.model.ts` — añadir configuración de transcripción a `ProjectSettings`

```typescript
export interface ProjectSettings {
  // ...campos existentes...
  transcriptionProvider?:  TranscriptionProvider;
  transcriptionEndpoint?:  string;      // para proveedor local
  transcriptionApiKey?:    string;      // OpenAI o Groq
  transcriptionModel?:     string;      // default: 'whisper-1'
  transcriptionLanguage?:  string;      // BCP 47, vacío = autodetección
}

export type TranscriptionProvider = 'openai' | 'groq' | 'local';
```

---

## TranscriptionService

### `src/app/core/services/transcription.service.ts`

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { ProjectService }   from './project.service';
import { DocumentService }  from './document.service';
import { TauriBridgeService } from './tauri-bridge.service';
import { TreeNode }         from '../models/project.model';

export interface TranscriptionResult {
  text:       string;
  sourceFile: string;
  provider:   string;
  language?:  string;
  durationMs: number;
}

const WHISPER_ENDPOINT: Record<string, string> = {
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  groq:   'https://api.groq.com/openai/v1/audio/transcriptions',
};

const TRANSCRIPTIONS_FOLDER_TITLE = 'Transcriptions';

@Injectable({ providedIn: 'root' })
export class TranscriptionService {
  private project = inject(ProjectService);
  private docSvc  = inject(DocumentService);
  private bridge  = inject(TauriBridgeService);

  isTranscribing = signal(false);
  progress       = signal('');

  // ─── Configuración ───────────────────────────────────────────────────────

  isConfigured(): boolean {
    const s = this.project.project()?.settings;
    if (!s?.transcriptionProvider) return false;
    switch (s.transcriptionProvider) {
      case 'openai':
      case 'groq':   return !!(s.transcriptionApiKey?.trim());
      case 'local':  return !!(s.transcriptionEndpoint?.trim());
    }
  }

  providerStatusMessage(): string {
    const s = this.project.project()?.settings;
    if (!s?.transcriptionProvider) return 'Proveedor no configurado';
    switch (s.transcriptionProvider) {
      case 'openai': return s.transcriptionApiKey ? '✓ OpenAI Whisper' : 'API key de OpenAI no configurada';
      case 'groq':   return s.transcriptionApiKey ? '✓ Groq Whisper'   : 'API key de Groq no configurada';
      case 'local':  return s.transcriptionEndpoint ? `✓ Local: ${s.transcriptionEndpoint}` : 'URL del servidor no configurada';
    }
  }

  // ─── Transcripción ────────────────────────────────────────────────────────

  async transcribe(filePath: string): Promise<TranscriptionResult> {
    const settings = this.project.project()!.settings;
    const provider = settings.transcriptionProvider!;

    this.isTranscribing.set(true);
    this.progress.set('Leyendo archivo de audio...');

    const startMs = Date.now();

    try {
      // Leer el archivo como bytes via Tauri
      const bytes    = await this.bridge.readFileBytes(filePath);
      const blob     = new Blob([new Uint8Array(bytes)]);
      const fileName = filePath.split('/').pop() ?? 'audio';
      const ext      = fileName.split('.').pop() ?? 'mp3';

      this.progress.set('Enviando al servicio de transcripción...');

      // Construir multipart/form-data
      const formData = new FormData();
      formData.append('file',  new File([blob], fileName, { type: this.mimeType(ext) }));
      formData.append('model', settings.transcriptionModel ?? 'whisper-1');

      if (settings.transcriptionLanguage) {
        formData.append('language', settings.transcriptionLanguage);
      }

      // Determinar URL y API key
      const url    = provider === 'local'
        ? `${settings.transcriptionEndpoint!.replace(/\/$/, '')}/v1/audio/transcriptions`
        : WHISPER_ENDPOINT[provider];

      const apiKey = settings.transcriptionApiKey ?? '';

      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      this.progress.set('Transcribiendo...');

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as any).error?.message ?? `Error ${response.status}`);
      }

      const data = await response.json();
      const text = data.text ?? '';

      return {
        text,
        sourceFile: fileName,
        provider,
        language:   settings.transcriptionLanguage,
        durationMs: Date.now() - startMs,
      };

    } finally {
      this.isTranscribing.set(false);
      this.progress.set('');
    }
  }

  // ─── Guardar en el binder ─────────────────────────────────────────────────

  /**
   * Crea o encuentra la carpeta "Transcriptions" en la raíz del binder,
   * y crea dentro un documento con el texto transcrito.
   * Retorna el TreeNode del documento creado.
   */
  async saveTranscriptionToProject(
    result: TranscriptionResult,
  ): Promise<TreeNode> {
    // 1. Buscar o crear la carpeta Transcriptions en la raíz
    const folderId = await this.getOrCreateTranscriptionsFolder();

    // 2. Generar título del documento
    const timestamp   = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const baseName    = result.sourceFile.replace(/\.[^.]+$/, '');
    const docTitle    = `${baseName} — ${timestamp}`;

    // 3. Crear el documento con el contenido de la transcripción
    // Incluir cabecera de metadatos como primer bloque del documento
    const headerText  = this.buildHeaderText(result);
    const fullContent = this.buildTipTapContent(headerText, result.text);

    const doc = await this.docSvc.createDocument(docTitle, folderId);
    const saved = await this.docSvc.saveDocument({
      ...doc,
      content: fullContent,
    });

    return {
      id:       saved.id,
      title:    saved.title,
      type:     'document',
      children: [],
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async getOrCreateTranscriptionsFolder(): Promise<string> {
    const tree    = this.project.project()?.tree ?? [];
    const existing = tree.find(
      n => n.type === 'folder' && n.title === TRANSCRIPTIONS_FOLDER_TITLE
    );

    if (existing) return existing.id;

    // Crear la carpeta en la raíz
    const node = await this.project.addNode('folder', TRANSCRIPTIONS_FOLDER_TITLE, null);
    return node.id;
  }

  private buildHeaderText(result: TranscriptionResult): string {
    const lines = [
      `Fuente: ${result.sourceFile}`,
      `Proveedor: ${result.provider}`,
      `Fecha: ${new Date().toLocaleString('es-ES')}`,
      `Duración del proceso: ${(result.durationMs / 1000).toFixed(1)}s`,
    ];
    if (result.language) lines.push(`Idioma: ${result.language}`);
    return lines.join(' · ');
  }

  /**
   * Construye un documento TipTap con:
   * - Un párrafo de metadatos en itálica
   * - Un separador horizontal
   * - Los párrafos de la transcripción
   */
  private buildTipTapContent(headerText: string, transcriptionText: string): object {
    const paragraphs = transcriptionText
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => ({
        type:    'paragraph',
        content: [{ type: 'text', text: p }],
      }));

    return {
      type:    'doc',
      content: [
        // Cabecera de metadatos en itálica
        {
          type:    'paragraph',
          content: [{
            type:  'text',
            text:  headerText,
            marks: [{ type: 'italic' }],
          }],
        },
        // Separador
        { type: 'horizontalRule' },
        // Texto transcrito
        ...paragraphs,
      ],
    };
  }

  private mimeType(ext: string): string {
    const map: Record<string, string> = {
      mp3:  'audio/mpeg',
      mp4:  'audio/mp4',
      m4a:  'audio/mp4',
      wav:  'audio/wav',
      ogg:  'audio/ogg',
      webm: 'audio/webm',
      flac: 'audio/flac',
    };
    return map[ext.toLowerCase()] ?? 'audio/mpeg';
  }
}
```

---

## Nuevo comando Tauri

`readFileBytes` ya existe desde INK-12. No se necesita ningún comando nuevo.

Si no se implementó INK-12, añadir en `fs_commands.rs`:

```rust
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path)
        .map_err(|e| format!("Error leyendo {}: {}", path, e))
}
```

Y en `TauriBridgeService`:
```typescript
readFileBytes(path: string): Promise<number[]> {
  return invoke<number[]>('read_file_bytes', { path });
}
```

---

## TranscriptionModalComponent

### `src/app/features/transcription/transcription-modal.component.ts`

```typescript
import {
  Component, inject, signal, output,
} from '@angular/core';
import { FormsModule }        from '@angular/forms';
import { Router }             from '@angular/router';
import { TranscriptionService } from '../../core/services/transcription.service';
import { TauriBridgeService }   from '../../core/services/tauri-bridge.service';
import { ProjectService }       from '../../core/services/project.service';
import { ToastService }         from '../../shared/services/toast.service';
import { InkModalComponent }    from '../../shared/components/ink-modal.component';
import { InkButtonComponent }   from '../../shared/components/ink-button.component';

const AUDIO_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'webm', 'flac'];
const MAX_SIZE_MB = 25;

@Component({
  selector: 'app-transcription-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Transcribir audio" (closed)="closed.emit()">
      <div class="flex flex-col gap-5">

        <!-- Sin proveedor configurado -->
        @if (!svc.isConfigured()) {
          <div class="p-4 rounded-lg border border-ink-warning/30 bg-ink-bg">
            <p class="text-ink-warning text-sm">
              {{ svc.providerStatusMessage() }}
            </p>
            <p class="text-ink-subtle text-xs mt-2 leading-relaxed">
              Configura el proveedor de transcripción en
              Configuración → IA → Transcripción de audio.
            </p>
          </div>
        }

        <!-- Selección de archivo -->
        <div class="flex flex-col gap-1.5">
          <label class="field-label">Archivo de audio</label>
          <div class="flex gap-2">
            <div
              class="flex-1 px-3 py-2 rounded bg-ink-bg border border-ink-border
                     text-sm truncate"
              [class]="selectedFile() ? 'text-ink-text' : 'text-ink-muted'">
              {{ selectedFile() ?? 'Ningún archivo seleccionado' }}
            </div>
            <ink-button variant="secondary" (clicked)="selectFile()">
              Elegir
            </ink-button>
          </div>

          <!-- Advertencia de tamaño -->
          @if (fileSizeWarning()) {
            <p class="text-ink-warning text-xs">
              ⚠️ El archivo supera {{ MAX_SIZE_MB }}MB.
              Puede fallar con proveedores cloud.
            </p>
          }

          <p class="text-ink-muted text-xs">
            Formatos soportados: {{ supportedFormats }}
          </p>
        </div>

        <!-- Idioma -->
        <div class="flex flex-col gap-1.5">
          <label class="field-label">
            Idioma del audio
            <span class="normal-case font-normal">(opcional)</span>
          </label>
          <select [(ngModel)]="selectedLanguage" class="field-input">
            <option value="">Autodetección</option>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
            <option value="ca">Català</option>
            <option value="gl">Galego</option>
            <option value="eu">Euskara</option>
          </select>
          <p class="text-ink-muted text-xs">
            Especificar el idioma mejora la precisión.
          </p>
        </div>

        <!-- Estado del proceso -->
        @if (svc.isTranscribing()) {
          <div class="flex items-center gap-3 p-3 rounded-lg bg-ink-bg
                      border border-ink-border">
            <span class="inline-block w-4 h-4 border-2 border-ink-accent
                         border-t-transparent rounded-full animate-spin shrink-0">
            </span>
            <span class="text-ink-subtle text-sm">{{ svc.progress() }}</span>
          </div>
        }

        <!-- Error -->
        @if (error()) {
          <div class="p-3 rounded-lg border border-ink-danger/30 bg-ink-bg">
            <p class="text-ink-danger text-xs leading-relaxed">{{ error() }}</p>
          </div>
        }

        <!-- Proveedor activo -->
        @if (svc.isConfigured() && !svc.isTranscribing()) {
          <p class="text-ink-subtle text-xs">
            {{ svc.providerStatusMessage() }}
          </p>
        }

      </div>

      <ng-container slot="actions">
        <ink-button variant="ghost" (clicked)="closed.emit()">Cancelar</ink-button>
        <ink-button
          variant="primary"
          [disabled]="!canTranscribe()"
          [loading]="svc.isTranscribing()"
          (clicked)="transcribe()">
          Transcribir
        </ink-button>
      </ng-container>
    </ink-modal>
  `,
  styles: [`
    .field-label { color:var(--ink-subtle); font-size:.7rem; font-weight:500;
                   text-transform:uppercase; letter-spacing:.05em; }
    .field-input { width:100%; padding:.4rem .6rem; border-radius:.25rem;
                   background:var(--ink-bg); border:1px solid var(--ink-border);
                   color:var(--ink-text); font-size:.875rem; }
    .field-input:focus { outline:none; border-color:var(--ink-accent); }
  `],
})
export class TranscriptionModalComponent {
  svc     = inject(TranscriptionService);
  bridge  = inject(TauriBridgeService);
  project = inject(ProjectService);
  toast   = inject(ToastService);
  router  = inject(Router);

  closed = output<void>();

  selectedFile    = signal<string | null>(null);
  selectedLanguage = '';
  fileSizeWarning = signal(false);
  error           = signal<string | null>(null);

  readonly MAX_SIZE_MB      = MAX_SIZE_MB;
  readonly supportedFormats = AUDIO_EXTENSIONS.join(', ');

  canTranscribe(): boolean {
    return !!(this.selectedFile() && this.svc.isConfigured() && !this.svc.isTranscribing());
  }

  async selectFile(): Promise<void> {
    const paths = await this.bridge.openFilesDialog(AUDIO_EXTENSIONS, false);
    if (!paths.length) return;
    this.selectedFile.set(paths[0]);
    this.error.set(null);

    // Verificar tamaño (aproximado — no tenemos acceso directo al tamaño del fichero)
    // Se verificará al leer en bytes durante la transcripción
    this.fileSizeWarning.set(false);
  }

  async transcribe(): Promise<void> {
    const filePath = this.selectedFile();
    if (!filePath) return;

    this.error.set(null);

    // Aplicar idioma seleccionado temporalmente
    if (this.selectedLanguage) {
      await this.project.updateSettings({
        transcriptionLanguage: this.selectedLanguage || undefined,
      });
    }

    try {
      const result = await this.svc.transcribe(filePath);
      const node   = await this.svc.saveTranscriptionToProject(result);

      this.toast.success(
        `Transcripción completada y guardada en la carpeta "Transcriptions".`
      );

      this.closed.emit();

      // Navegar al editor y abrir el documento transcrito
      this.router.navigate(['/editor'], { queryParams: { doc: node.id } });

    } catch (e) {
      this.error.set(`Error al transcribir: ${e}`);
    }
  }
}
```

---

## Configuración en `InkSettingsModalComponent`

Añadir una subsección "Transcripción de audio" dentro de la sección "IA", tras la subsección de imágenes:

```html
<!-- Subsección transcripción -->
<div class="pt-4 border-t border-ink-border">
  <p class="text-ink-subtle text-xs font-medium uppercase tracking-widest mb-3">
    Transcripción de audio
  </p>

  <div class="flex flex-col gap-3">

    <!-- Proveedor -->
    <div class="flex flex-col gap-1.5">
      <label class="field-label">Proveedor</label>
      <select [(ngModel)]="transcriptionProvider" class="field-input">
        <option value="">Sin configurar</option>
        <option value="openai">OpenAI Whisper</option>
        <option value="groq">Groq (rápido, tier gratuito)</option>
        <option value="local">Servidor local (whisper.cpp, etc.)</option>
      </select>
    </div>

    @if (transcriptionProvider === 'openai') {
      <div class="flex flex-col gap-1.5">
        <label class="field-label">API key de OpenAI</label>
        <input [(ngModel)]="transcriptionApiKey" type="password"
               placeholder="sk-..." class="field-input font-mono"/>
        <p class="text-ink-muted text-xs">
          Distinta de la API key de Anthropic.
          Obtener en platform.openai.com
        </p>
      </div>
    }

    @if (transcriptionProvider === 'groq') {
      <div class="flex flex-col gap-1.5">
        <label class="field-label">API key de Groq</label>
        <input [(ngModel)]="transcriptionApiKey" type="password"
               placeholder="gsk_..." class="field-input font-mono"/>
        <p class="text-ink-muted text-xs">
          Obtener en console.groq.com · Tier gratuito disponible.
        </p>
      </div>
    }

    @if (transcriptionProvider === 'local'" {
      <div class="flex flex-col gap-1.5">
        <label class="field-label">URL del servidor</label>
        <input [(ngModel)]="transcriptionEndpoint"
               placeholder="http://localhost:8080"
               class="field-input font-mono"/>
        <p class="text-ink-muted text-xs leading-relaxed">
          Servidor con endpoint
          <code class="bg-ink-bg px-1 rounded">/v1/audio/transcriptions</code>.
          Compatible con whisper.cpp en modo servidor.
        </p>
      </div>
    }

    <!-- Idioma por defecto -->
    <div class="flex flex-col gap-1.5">
      <label class="field-label">
        Idioma por defecto
        <span class="normal-case font-normal">(opcional)</span>
      </label>
      <select [(ngModel)]="transcriptionLanguage" class="field-input">
        <option value="">Autodetección</option>
        <option value="es">Español</option>
        <option value="en">English</option>
        <option value="fr">Français</option>
        <option value="de">Deutsch</option>
        <option value="it">Italiano</option>
        <option value="pt">Português</option>
      </select>
    </div>

  </div>
</div>
```

Incluir en `saveAiSettings()`:
```typescript
await this.projectService.updateSettings({
  // ...settings existentes...
  transcriptionProvider:  this.transcriptionProvider || undefined,
  transcriptionApiKey:    this.transcriptionApiKey   || undefined,
  transcriptionEndpoint:  this.transcriptionEndpoint || undefined,
  transcriptionLanguage:  this.transcriptionLanguage || undefined,
});
```

---

## Botón en `InkNavComponent`

```html
@if (projectService.isLoaded()) {
  <button
    (click)="showTranscription.set(true)"
    title="Transcribir audio"
    class="nav-icon"
    [class.text-ink-warning]="!transcriptionSvc.isConfigured()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
    </svg>
  </button>
}

@if (showTranscription()) {
  <app-transcription-modal (closed)="showTranscription.set(false)"/>
}
```

```typescript
private transcriptionSvc = inject(TranscriptionService);
showTranscription = signal(false);
```

---

## Guía rápida — whisper.cpp en modo servidor

Para el proveedor local, whisper.cpp puede arrancarse en modo servidor:

```bash
# Compilar whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make

# Descargar modelo (pequeño, ~150MB)
bash ./models/download-ggml-model.sh small

# Arrancar el servidor en el puerto 8080
./build/bin/whisper-server \
  --model models/ggml-small.bin \
  --host 0.0.0.0 \
  --port 8080
```

En Inkwell: Settings → IA → Transcripción → Servidor local → URL: `http://localhost:8080`

---

## Criterios de aceptación

**Configuración:**
- [ ] La sección IA de settings tiene subsección "Transcripción de audio"
- [ ] Los tres proveedores aparecen como opciones
- [ ] OpenAI y Groq muestran campo de API key; local muestra campo de URL
- [ ] La configuración persiste en `project.json`
- [ ] El icono de micrófono en la nav se pone en amarillo si no hay proveedor configurado

**Modal de transcripción:**
- [ ] El botón de micrófono en la nav abre el modal (solo con proyecto abierto)
- [ ] Sin proveedor configurado, el modal muestra aviso y deshabilita el botón
- [ ] "Elegir" abre el diálogo filtrado por extensiones de audio
- [ ] El nombre del archivo seleccionado aparece en el campo
- [ ] El selector de idioma incluye autodetección como opción
- [ ] El botón "Transcribir" está deshabilitado sin archivo seleccionado
- [ ] Durante la transcripción se muestra el spinner y el mensaje de progreso
- [ ] Los errores de la API se muestran de forma legible

**Resultado:**
- [ ] Si no existe la carpeta "Transcriptions" en el binder, se crea automáticamente en la raíz
- [ ] Si ya existe, el documento se crea dentro sin crear una segunda carpeta
- [ ] El título del documento es `{nombre_archivo} — {fecha hora}`
- [ ] El documento contiene una primera línea en cursiva con los metadatos (fuente, proveedor, fecha)
- [ ] Seguida de un separador horizontal
- [ ] Seguida del texto transcrito como párrafos normales
- [ ] Al finalizar, navega al editor y abre el documento transcrito
- [ ] Toast de confirmación visible

**Persistencia:**
- [ ] El documento de transcripción se guarda en `documents/{uuid}.json`
- [ ] La carpeta "Transcriptions" aparece en `project.json` en el árbol

---

## Lo que NO hacer en esta spec

- No implementar transcripción en tiempo real (micrófono directo)
- No dividir automáticamente archivos mayores de 25MB
- No mostrar preview del audio en el modal
- No soportar transcripción en batch de varios archivos a la vez
