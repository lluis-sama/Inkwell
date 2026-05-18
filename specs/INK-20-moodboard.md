# INK-20 — Generación de imágenes en tableros (Moodboard)

## Objetivo

Añadir generación de imágenes por IA a las tarjetas de los tableros de corcho. Cada tarjeta puede tener opcionalmente una imagen que reemplaza su fondo de color. Los tableros sin imágenes no cambian visualmente. El usuario puede usar cualquier tablero como moodboard simplemente añadiendo imágenes a sus tarjetas.

---

## Decisiones de diseño

- **Sin pantalla nueva** — la funcionalidad vive dentro de los tableros de corcho existentes
- **Opt-in por tarjeta** — un botón de cámara en hover abre la interfaz de generación
- **Visual**: la imagen generada reemplaza el fondo de color de la tarjeta; el título y cuerpo se superponen con overlay semitransparente
- **Almacenamiento**: base64 en el JSON del tablero (campo `imageData?: string`). Sin carpetas adicionales. Sin complejidad de sync.
- **Proveedores**: DALL-E 3 (OpenAI) para cloud; cualquier endpoint OpenAI-compatible de imágenes para local (LocalAI, ComfyUI, A1111)
- **Prompt automático**: se genera desde el título y cuerpo de la tarjeta, editable antes de confirmar

---

## Cambios en el modelo de datos

### `board.model.ts` — añadir `imageData` a `Card`

```typescript
export interface Card {
  id:          string;
  type:        CardType;
  title:       string;
  body:        string;
  color:       string;
  x:           number;
  y:           number;
  width:       number;
  height:      number;
  characterData?: CharacterData;
  imageData?:  string;   // NUEVO — base64 data URL: "data:image/jpeg;base64,..."
  imagePrompt?: string;  // NUEVO — prompt usado para generar la imagen (histórico)
}
```

Las tarjetas sin `imageData` se renderizan exactamente igual que antes.

---

## Configuración de imagen en `ProjectSettings`

### `project.model.ts` — ampliar `ProjectSettings`

```typescript
export interface ProjectSettings {
  // ...campos existentes...
  imageProvider?:  ImageProvider;  // NUEVO
  imageEndpoint?:  string;         // NUEVO — URL para proveedor custom
  imageApiKey?:    string;         // NUEVO — API key para DALL-E u otros
  imageModel?:     string;         // NUEVO — modelo de imagen
  imageSize?:      ImageSize;      // NUEVO
}

export type ImageProvider = 'dalle' | 'openai-compatible-image';
export type ImageSize = '1024x1024' | '512x512' | '256x256';
```

---

## ImageService

### `src/app/core/services/image.service.ts`

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { ProjectService } from './project.service';

export interface ImageGenerationOptions {
  prompt:   string;
  size?:    string;
  n?:       number;   // siempre 1 para nuestro caso
}

@Injectable({ providedIn: 'root' })
export class ImageService {
  private project = inject(ProjectService);

  isGenerating = signal(false);

  // ─── Estado del proveedor ─────────────────────────────────────────────────

  isConfigured(): boolean {
    const settings = this.project.project()?.settings;
    if (!settings?.imageProvider) return false;
    switch (settings.imageProvider) {
      case 'dalle':
        return !!(settings.imageApiKey?.trim());
      case 'openai-compatible-image':
        return !!(settings.imageEndpoint?.trim());
    }
  }

  providerStatusMessage(): string {
    const settings = this.project.project()?.settings;
    if (!settings?.imageProvider) return 'Proveedor de imágenes no configurado';
    switch (settings.imageProvider) {
      case 'dalle':
        return settings.imageApiKey ? '✓ DALL-E configurado' : 'API key de OpenAI no configurada';
      case 'openai-compatible-image':
        return settings.imageEndpoint
          ? `✓ Servidor: ${settings.imageEndpoint}`
          : 'URL del servidor no configurada';
    }
  }

  // ─── Generación ───────────────────────────────────────────────────────────

  /**
   * Genera una imagen y retorna el base64 data URL.
   */
  async generate(options: ImageGenerationOptions): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('El proveedor de imágenes no está configurado.');
    }

    const settings = this.project.project()!.settings;
    this.isGenerating.set(true);

    try {
      switch (settings.imageProvider) {
        case 'dalle':
          return await this.generateDalle(options, settings.imageApiKey!, settings.imageSize);
        case 'openai-compatible-image':
          return await this.generateOpenAICompatible(
            options, settings.imageEndpoint!, settings.imageApiKey,
            settings.imageModel, settings.imageSize,
          );
      }
    } finally {
      this.isGenerating.set(false);
    }

    throw new Error('Proveedor no reconocido');
  }

  // ─── DALL-E 3 ─────────────────────────────────────────────────────────────

  private async generateDalle(
    options: ImageGenerationOptions,
    apiKey: string,
    size?: ImageSize,
  ): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           'dall-e-3',
        prompt:          options.prompt,
        n:               1,
        size:            size ?? '1024x1024',
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as any).error?.message ?? `Error DALL-E ${response.status}`
      );
    }

    const data = await response.json();
    const b64  = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('La respuesta de DALL-E no contiene imagen.');

    return `data:image/png;base64,${b64}`;
  }

  // ─── Servidor OpenAI-compatible de imágenes ───────────────────────────────

  private async generateOpenAICompatible(
    options: ImageGenerationOptions,
    endpoint: string,
    apiKey: string | undefined,
    model: string | undefined,
    size?: ImageSize,
  ): Promise<string> {
    const url     = `${endpoint.replace(/\/$/, '')}/v1/images/generations`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt:          options.prompt,
        n:               1,
        size:            size ?? '512x512',
        model:           model ?? 'stable-diffusion',
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Error del servidor (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const b64  = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('La respuesta del servidor no contiene imagen.');

    return `data:image/png;base64,${b64}`;
  }

  // ─── Generación de prompt automático ─────────────────────────────────────

  /**
   * Genera un prompt de imagen a partir del título y cuerpo de una tarjeta.
   * El prompt es para uso como referencia visual (moodboard), no narrativo.
   */
  buildAutoPrompt(title: string, body: string): string {
    const base = body.trim()
      ? `${title}. ${body.slice(0, 200)}`
      : title;

    return `${base}. Concept art, moodboard reference, atmospheric, cinematic lighting, detailed illustration.`;
  }
}
```

---

## ImageGeneratorModalComponent

Modal que aparece al pulsar el botón de cámara en una tarjeta. Permite editar el prompt y previsualizar antes de aplicar.

### `src/app/features/boards/modals/image-generator-modal.component.ts`

```typescript
import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Card } from '../../../core/models/board.model';
import { ImageService } from '../../../core/services/image.service';
import { InkModalComponent }  from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';
import { ToastService }       from '../../../shared/services/toast.service';

@Component({
  selector: 'app-image-generator-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Generar imagen" (closed)="cancelled.emit()">
      <div class="flex flex-col gap-4">

        <!-- Sin configurar -->
        @if (!imageService.isConfigured()) {
          <div class="p-4 rounded-lg border border-ink-warning/30 bg-ink-bg">
            <p class="text-ink-warning text-sm leading-relaxed">
              {{ imageService.providerStatusMessage() }}
            </p>
            <p class="text-ink-subtle text-xs mt-2">
              Configura el proveedor de imágenes en Settings → IA → Imágenes.
            </p>
          </div>
        } @else {

          <!-- Prompt -->
          <div class="flex flex-col gap-1.5">
            <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
              Prompt de imagen
            </label>
            <textarea
              [(ngModel)]="prompt"
              rows="4"
              class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                     text-ink-text text-sm placeholder:text-ink-muted resize-none
                     focus:outline-none focus:border-ink-accent transition-colors">
            </textarea>
            <p class="text-ink-muted text-xs">
              Describe la imagen que quieres generar. El prompt se generó automáticamente
              a partir del contenido de la tarjeta — puedes editarlo.
            </p>
          </div>

          <!-- Preview -->
          @if (previewImage()) {
            <div class="flex flex-col gap-2">
              <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
                Previsualización
              </label>
              <div class="relative rounded-lg overflow-hidden border border-ink-border">
                <img
                  [src]="previewImage()"
                  alt="Imagen generada"
                  class="w-full object-cover max-h-64"/>
              </div>
            </div>
          }

          <!-- Botón generar -->
          <ink-button
            variant="secondary"
            [fullWidth]="true"
            [loading]="imageService.isGenerating()"
            [disabled]="!prompt.trim()"
            (clicked)="generate()">
            @if (previewImage()) { Regenerar } @else { Generar imagen }
          </ink-button>

          @if (error()) {
            <p class="text-ink-danger text-xs">{{ error() }}</p>
          }

        }
      </div>

      <ng-container slot="actions">
        @if (card().imageData) {
          <ink-button variant="danger" (clicked)="removeImage()">
            Quitar imagen
          </ink-button>
        }
        <ink-button variant="ghost" (clicked)="cancelled.emit()">Cancelar</ink-button>
        <ink-button
          variant="primary"
          [disabled]="!previewImage() && !imageService.isConfigured()"
          (clicked)="apply()">
          Aplicar
        </ink-button>
      </ng-container>
    </ink-modal>
  `,
})
export class ImageGeneratorModalComponent implements OnInit {
  imageService = inject(ImageService);
  private toast = inject(ToastService);

  card = input.required<Card>();

  applied    = output<{ imageData: string; imagePrompt: string } | null>();
  cancelled  = output<void>();

  prompt       = '';
  previewImage = signal<string | null>(null);
  error        = signal<string | null>(null);

  ngOnInit(): void {
    // Si la tarjeta ya tiene imagen, mostrarla como preview inicial
    if (this.card().imageData) {
      this.previewImage.set(this.card().imageData!);
      this.prompt = this.card().imagePrompt ?? this.buildPrompt();
    } else {
      this.prompt = this.buildPrompt();
    }
  }

  private buildPrompt(): string {
    return this.imageService.buildAutoPrompt(this.card().title, this.card().body);
  }

  async generate(): Promise<void> {
    if (!this.prompt.trim()) return;
    this.error.set(null);
    try {
      const imageData = await this.imageService.generate({ prompt: this.prompt });
      this.previewImage.set(imageData);
    } catch (e) {
      this.error.set(`Error al generar: ${e}`);
    }
  }

  apply(): void {
    const image = this.previewImage();
    if (!image) { this.cancelled.emit(); return; }
    this.applied.emit({ imageData: image, imagePrompt: this.prompt });
  }

  removeImage(): void {
    this.applied.emit(null);   // null = eliminar la imagen
  }
}
```

---

## Actualizar `BoardCardComponent`

### Visual con imagen

Modificar el template para mostrar la imagen como fondo cuando existe:

```typescript
// En BoardCardComponent, añadir computed:
hasImage = computed(() => !!this.card().imageData);
```

```html
<div
  #cardEl
  class="absolute rounded-lg border shadow-md cursor-grab active:cursor-grabbing
         select-none flex flex-col overflow-hidden"
  [class]="hasImage() ? 'border-black/20' : 'border-black/10'"
  [style.left.px]="card().x"
  [style.top.px]="card().y"
  [style.width.px]="card().width"
  [style.min-height.px]="card().height"
  [style.background]="hasImage() ? 'transparent' : card().color"
  (dblclick)="editRequested.emit(card())">

  <!-- Imagen de fondo -->
  @if (hasImage()) {
    <div class="absolute inset-0">
      <img
        [src]="card().imageData"
        alt=""
        class="w-full h-full object-cover"/>
      <!-- Overlay semitransparente para legibilidad del texto -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10">
      </div>
    </div>
  }

  <!-- Contenido (siempre encima de la imagen) -->
  <div class="relative z-10 flex flex-col h-full">

    <!-- Header -->
    <div class="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
      <span class="text-xs opacity-70"
            [class]="hasImage() ? 'text-white' : ''">
        {{ typeIcon(card().type) }}
      </span>
      @if (card().type === 'character' && chapterCount() > 0) {
        <span class="ml-auto text-xs opacity-60 font-mono"
              [class]="hasImage() ? 'text-white' : ''">
          {{ chapterCount() }} cap.
        </span>
      }
    </div>

    <!-- Título -->
    <div class="px-3 pt-2 pb-1">
      <p class="text-sm font-medium leading-snug break-words"
         [class]="hasImage() ? 'text-white drop-shadow' : 'text-ink-text'">
        {{ card().title }}
      </p>
    </div>

    <!-- Cuerpo (solo si no hay imagen, para no saturar visualmente) -->
    @if (card().body && !hasImage()) {
      <div class="px-3 pb-3 flex-1">
        <p class="text-ink-subtle text-xs leading-relaxed break-words whitespace-pre-wrap">
          {{ card().body }}
        </p>
      </div>
    }

  </div>

  <!-- Botón eliminar (hover) -->
  <button
    (click)="deleteRequested.emit(card().id); $event.stopPropagation()"
    class="absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center
           justify-center text-ink-subtle opacity-0 hover:opacity-100
           hover:text-ink-danger hover:bg-black/20 transition-all card-delete"
    [class]="hasImage() ? 'text-white' : 'text-ink-subtle'">
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586
               5.207 2.793a1 1 0 0 0-1.414 1.414L6.586 7
               l-2.793 2.793a1 1 0 1 0 1.414 1.414L8 8.414
               l2.793 2.793a1 1 0 0 0 1.414-1.414L9.414 7
               l2.793-2.793z"/>
    </svg>
  </button>

  <!-- Botón generar imagen (hover) -->
  <button
    (click)="imageRequested.emit(card()); $event.stopPropagation()"
    title="Generar imagen"
    class="absolute bottom-1.5 right-1.5 w-6 h-6 rounded flex items-center
           justify-center opacity-0 hover:opacity-100 hover:bg-black/20
           transition-all card-image"
    [class]="hasImage() ? 'text-white' : 'text-ink-subtle hover:text-ink-accent'">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21,15 16,10 5,21"/>
    </svg>
  </button>
</div>
```

Añadir output:
```typescript
imageRequested = output<Card>();
```

---

## Integrar en `BoardsLayoutComponent`

```typescript
// Nuevo signal
imageCard = signal<Card | null>(null);
```

Pasar el output desde `BoardCanvasComponent` → `BoardsLayoutComponent`:

```typescript
(imageRequested)="imageCard.set($event)"
```

Modal en el template:

```html
@if (imageCard()) {
  <app-image-generator-modal
    [card]="imageCard()!"
    (applied)="onImageApplied($event)"
    (cancelled)="imageCard.set(null)"/>
}
```

Método handler:

```typescript
async onImageApplied(
  result: { imageData: string; imagePrompt: string } | null,
): Promise<void> {
  const card  = this.imageCard();
  const board = this.activeBoard();
  if (!card || !board) return;
  this.imageCard.set(null);

  const updatedCard: Card = result
    ? { ...card, imageData: result.imageData, imagePrompt: result.imagePrompt }
    : { ...card, imageData: undefined, imagePrompt: undefined };

  const updatedBoard = this.boardService.updateCard(board, updatedCard);
  await this.persistBoard(updatedBoard);
}
```

---

## Configuración de imágenes en `InkSettingsModalComponent`

Añadir una subsección "Imágenes" dentro de la sección "IA":

```html
<!-- Dentro de la sección 'ai', tras la configuración de chat -->
<div class="pt-4 border-t border-ink-border">
  <p class="text-ink-subtle text-xs font-medium uppercase tracking-widest mb-3">
    Generación de imágenes
  </p>

  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <label class="field-label">Proveedor de imágenes</label>
      <select [(ngModel)]="imageProvider" class="field-input">
        <option value="">Sin configurar</option>
        <option value="dalle">DALL-E 3 (OpenAI)</option>
        <option value="openai-compatible-image">Servidor local (LocalAI, ComfyUI...)</option>
      </select>
    </div>

    @if (imageProvider === 'dalle') {
      <div class="flex flex-col gap-1.5">
        <label class="field-label">API key de OpenAI</label>
        <input [(ngModel)]="imageApiKey" type="password" placeholder="sk-..."
               class="field-input font-mono"/>
        <p class="text-ink-muted text-xs">
          Distinta de la API key de Anthropic. Obtener en platform.openai.com.
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="field-label">Tamaño de imagen</label>
        <select [(ngModel)]="imageSize" class="field-input">
          <option value="1024x1024">1024×1024 (alta calidad, más lento)</option>
          <option value="512x512">512×512 (rápido)</option>
        </select>
      </div>
    }

    @if (imageProvider === 'openai-compatible-image') {
      <div class="flex flex-col gap-1.5">
        <label class="field-label">URL del servidor</label>
        <input [(ngModel)]="imageEndpoint" placeholder="http://localhost:7860"
               class="field-input font-mono"/>
        <p class="text-ink-muted text-xs leading-relaxed">
          Servidor que implementa <code class="bg-ink-bg px-1 rounded">/v1/images/generations</code>.
          Compatible con LocalAI, ComfyUI (con plugin OpenAI), A1111 (con extensión), etc.
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="field-label">Modelo</label>
        <input [(ngModel)]="imageModel" placeholder="stable-diffusion-xl, flux..."
               class="field-input font-mono"/>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="field-label">Tamaño de imagen</label>
        <select [(ngModel)]="imageSize" class="field-input">
          <option value="512x512">512×512</option>
          <option value="768x768">768×768</option>
          <option value="1024x1024">1024×1024</option>
        </select>
      </div>
    }
  </div>
</div>
```

Incluir en `saveAiSettings()`:
```typescript
await this.projectService.updateSettings({
  // ...settings existentes...
  imageProvider:  this.imageProvider || undefined,
  imageApiKey:    this.imageApiKey   || undefined,
  imageEndpoint:  this.imageEndpoint || undefined,
  imageModel:     this.imageModel    || undefined,
  imageSize:      this.imageSize     || undefined,
});
```

---

## Criterios de aceptación

**Configuración:**
- [ ] La sección IA de settings tiene subsección "Generación de imágenes"
- [ ] Al seleccionar DALL-E, aparecen los campos de API key y tamaño
- [ ] Al seleccionar servidor local, aparecen los campos de URL, modelo y tamaño
- [ ] La configuración persiste en `project.json`
- [ ] Sin proveedor configurado, el botón de cámara en las tarjetas muestra el modal con aviso

**Botón de cámara en tarjetas:**
- [ ] El icono de cámara aparece en la esquina inferior derecha de la tarjeta en hover
- [ ] Es visible tanto en tarjetas con imagen como sin imagen
- [ ] Click en el icono abre `ImageGeneratorModalComponent`

**Modal de generación:**
- [ ] El prompt se pre-rellena automáticamente desde el título y cuerpo de la tarjeta
- [ ] El prompt es editable antes de generar
- [ ] El botón "Generar imagen" llama al proveedor configurado
- [ ] La imagen generada aparece como preview dentro del modal
- [ ] El botón cambia a "Regenerar" si ya hay una imagen previa
- [ ] Si hay error (API key inválida, servidor caído), se muestra el mensaje de error
- [ ] "Aplicar" guarda la imagen en la tarjeta y cierra el modal
- [ ] "Quitar imagen" (solo si ya había imagen) elimina la imagen de la tarjeta
- [ ] "Cancelar" cierra sin cambios

**Visual de la tarjeta con imagen:**
- [ ] La imagen ocupa todo el fondo de la tarjeta
- [ ] Hay un overlay gradiente oscuro que garantiza legibilidad del texto
- [ ] El título de la tarjeta es legible sobre cualquier imagen
- [ ] El cuerpo de texto se oculta cuando hay imagen (para no saturar)
- [ ] El icono de tipo (👤, 📝, etc.) sigue visible
- [ ] La tarjeta sigue siendo arrastrable con interact.js

**Persistencia:**
- [ ] `imageData` (base64) se guarda en `boards/{id}.json`
- [ ] Al recargar la app, las imágenes de las tarjetas se muestran correctamente
- [ ] La sincronización con ProtonDrive/Syncthing funciona (el JSON con base64 se sincroniza como cualquier fichero)

**DALL-E:**
- [ ] Con una API key válida de OpenAI, la imagen se genera correctamente
- [ ] Con API key inválida, el error de OpenAI se muestra de forma legible

**Servidor local:**
- [ ] Con LocalAI o ComfyUI configurados, la imagen se genera correctamente
- [ ] Si el servidor no responde, el error se muestra de forma legible

---

## Nota sobre el tamaño del JSON

Una imagen 512×512 JPEG en calidad 75 pesa ~50-80KB. Como base64 son ~100KB.
Un tablero con 20 tarjetas con imagen pesa ~2MB.

Esto es perfectamente manejable para ficheros locales y sync. Si en el futuro los tableros crecen mucho, la solución es mover las imágenes a `{basePath}/images/{cardId}.jpg` — el campo `imageData` se convertiría en una ruta relativa. Esa migración es trivial y no rompe nada.

---

## Lo que NO hacer en esta spec

- No implementar búsqueda de imágenes de referencia (Unsplash, Pexels) — solo generación
- No implementar edición de imagen (recortar, ajustar) dentro de Inkwell
- No añadir imágenes a documentos del editor TipTap
- No generar imágenes en batch para todos los capítulos
- No implementar galería de imágenes generadas separada de los tableros
