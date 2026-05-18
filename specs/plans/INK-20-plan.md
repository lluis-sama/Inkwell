# Plan de implementación — INK-20

### Resumen

Esta spec añade generación de imágenes por IA a las tarjetas de los tableros de corcho. El trabajo abarca: ampliar los modelos de datos (Card y ProjectSettings), crear ImageService con soporte DALL-E 3 y servidor OpenAI-compatible, crear ImageGeneratorModalComponent, modificar BoardCardComponent para mostrar imagen como fondo y exponer el botón de cámara, propagar el nuevo output por BoardCanvasComponent hasta BoardsLayoutComponent, y añadir la subsección "Generación de imágenes" en InkSettingsModalComponent.

---

### Tareas

#### Tarea 1: Ampliar `board.model.ts` — añadir campos a `Card`
- **Fichero**: `src/app/core/models/board.model.ts` (modificar)
- **Qué hace**: Añadir los campos opcionales `imageData?: string` e `imagePrompt?: string` a la interfaz `Card`. Sin tocar ningún otro export del fichero.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Cambio aditivo y retrocompatible; las tarjetas existentes sin estos campos siguen funcionando sin cambios en el resto del código.

#### Tarea 2: Ampliar `project.model.ts` — añadir tipos y campos de imagen a `ProjectSettings`
- **Fichero**: `src/app/core/models/project.model.ts` (modificar)
- **Qué hace**:
  1. Añadir los tipos `ImageProvider = 'dalle' | 'openai-compatible-image'` e `ImageSize = '1024x1024' | '512x512' | '256x256'` justo antes o después de `AiProvider`.
  2. Añadir los campos opcionales `imageProvider?: ImageProvider`, `imageEndpoint?: string`, `imageApiKey?: string`, `imageModel?: string`, `imageSize?: ImageSize` a la interfaz `ProjectSettings`.
  - `DEFAULT_PROJECT_SETTINGS` no necesita cambios (los nuevos campos son opcionales).
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Bajo. Los campos son opcionales; proyectos guardados sin ellos no rompen la deserialización.

#### Tarea 3: Crear `ImageService`
- **Fichero**: `src/app/core/services/image.service.ts` (crear)
- **Qué hace**: Servicio `providedIn: 'root'` que implementa:
  - `isGenerating = signal(false)`
  - `isConfigured(): boolean` — comprueba `imageProvider` y las credenciales correspondientes en `ProjectService`
  - `providerStatusMessage(): string` — texto de estado para la UI
  - `buildAutoPrompt(title, body): string` — genera el prompt a partir del contenido de la tarjeta
  - `generate(options): Promise<string>` — despacha a `generateDalle` o `generateOpenAICompatible` según el proveedor; envuelve en `isGenerating.set(true/false)` con `try/finally`
  - `private generateDalle(options, apiKey, size?): Promise<string>` — llama a `https://api.openai.com/v1/images/generations` con `response_format: 'b64_json'`; retorna `data:image/png;base64,<b64>`
  - `private generateOpenAICompatible(options, endpoint, apiKey?, model?, size?): Promise<string>` — construye URL con `endpoint.replace(/\/$/, '') + '/v1/images/generations'`; retorna `data:image/png;base64,<b64>`
- **Depende de**: Tarea 2 (necesita los tipos `ImageProvider`, `ImageSize` de `project.model.ts`)
- **Riesgo**: CRITICO — Ambos métodos de fetch DEBEN usar `import { fetch } from '@tauri-apps/plugin-http'`, NO el `fetch` nativo del navegador. La CSP de Tauri 2.x bloquea llamadas a APIs externas con fetch nativo. Ver patrón en `ai.service.ts` línea 2.

#### Tarea 4: Crear `ImageGeneratorModalComponent` — fichero TypeScript
- **Fichero**: `src/app/features/boards/modals/image-generator-modal.component.ts` (crear)
- **Qué hace**: Componente standalone con:
  - `inputs`: `card = input.required<Card>()`
  - `outputs`: `applied = output<{ imageData: string; imagePrompt: string } | null>()`, `cancelled = output<void>()`
  - Estado: `prompt = ''` (plain property, siguiendo el patrón de `CardEditorModalComponent`), `previewImage = signal<string | null>(null)`, `error = signal<string | null>(null)`
  - `ngOnInit`: si `card().imageData` existe, cargar en `previewImage` y usar `card().imagePrompt` como prompt; si no, llamar a `buildPrompt()` via `imageService`
  - `generate()`: llama a `imageService.generate()`, actualiza `previewImage`, captura errores en `error()`
  - `apply()`: emite `applied` con `{ imageData, imagePrompt: prompt }` si hay preview, o llama a `cancelled` si no
  - `removeImage()`: emite `applied(null)` (señal para eliminar imagen de la tarjeta)
  - `templateUrl`: `./image-generator-modal.component.html`
  - `imports`: `InkModalComponent`, `InkButtonComponent`, `FormsModule`
- **Depende de**: Tarea 3 (ImageService), Tarea 1 (Card con imageData/imagePrompt)

#### Tarea 5: Crear `image-generator-modal.component.html`
- **Fichero**: `src/app/features/boards/modals/image-generator-modal.component.html` (crear)
- **Qué hace**: Template del modal con tres zonas:
  1. **Bloque "sin configurar"** (`@if (!imageService.isConfigured())`): muestra mensaje de advertencia con `imageService.providerStatusMessage()` y texto indicando dónde configurar.
  2. **Bloque "configurado"** (`@else`): textarea con `[(ngModel)]="prompt"`, previsualización de imagen con `@if (previewImage())`, botón "Generar imagen" / "Regenerar" con `[loading]="imageService.isGenerating()"`, mensaje de error con `@if (error())`.
  3. **Slot `actions`** en `<ng-container slot="actions">`: botón "Quitar imagen" (variant danger, `@if (card().imageData)`), botón "Cancelar" (variant ghost), botón "Aplicar" (variant primary, deshabilitado si no hay preview y no está configurado).
  - Usar clases Tailwind con tokens `ink-*` como en los modales existentes (`card-editor-modal.component.html`).
- **Depende de**: Tarea 4

#### Tarea 6: Crear `image-generator-modal.component.css` (vacío)
- **Fichero**: `src/app/features/boards/modals/image-generator-modal.component.css` (crear)
- **Qué hace**: Fichero de estilos vacío (o con comentario placeholder). El modal no necesita estilos propios; usa Tailwind exclusivamente.
- **Depende de**: Tarea 4

#### Tarea 7: Modificar `BoardCardComponent` — añadir output `imageRequested` y computed `hasImage`
- **Fichero**: `src/app/features/boards/canvas/board-card.component.ts` (modificar)
- **Qué hace**:
  1. Añadir `hasImage = computed(() => !!this.card().imageData)` junto al computed `chapterCount` existente.
  2. Añadir `imageRequested = output<Card>()` junto a los outputs existentes (`positionChanged`, `editRequested`, `deleteRequested`).
  3. Añadir en el bloque `styles` la regla CSS para mostrar el botón de cámara en hover: `div:hover .card-image { opacity: 1 !important; }` (siguiendo el patrón existente de `.card-delete`).
- **Depende de**: Tarea 1 (campo `imageData` en `Card`)

#### Tarea 8: Modificar `board-card.component.html` — visual con imagen y botón de cámara
- **Fichero**: `src/app/features/boards/canvas/board-card.component.html` (modificar)
- **Qué hace**: Reescribir el template para:
  1. En el `div` raíz (`#cardEl`): cambiar `[style.background]` a condicional: cuando `hasImage()`, `background: transparent`; si no, `card().color`. Añadir clase de borde condicional: `border-black/20` con imagen, `border-black/10` sin ella.
  2. Añadir bloque `@if (hasImage())` con `<div class="absolute inset-0">` que contiene `<img [src]="card().imageData" ...>` y un `<div>` de overlay gradiente oscuro para legibilidad.
  3. Envolver el contenido existente (type indicator, título, cuerpo) en un `<div class="relative z-10 flex flex-col h-full">` para que quede sobre la imagen.
  4. En el tipo indicator y título: añadir clases condicionales `[class]="hasImage() ? 'text-white' : ''"` para texto blanco sobre imagen.
  5. En el cuerpo: cambiar condición a `@if (card().body && !hasImage())` para ocultarlo cuando hay imagen.
  6. En el botón delete: mantener comportamiento existente; añadir clase condicional de color según `hasImage()`.
  7. Añadir nuevo botón de cámara en la esquina inferior derecha: class `card-image`, `opacity-0`, con SVG de icono de imagen, emit `imageRequested.emit(card())` en click con `$event.stopPropagation()`.
- **Depende de**: Tarea 7

#### Tarea 9: Modificar `BoardCanvasComponent` — propagar `imageRequested`
- **Fichero**: `src/app/features/boards/canvas/board-canvas.component.ts` (modificar)
- **Qué hace**:
  1. Añadir `imageRequested = output<Card>()` a los outputs existentes.
  2. Añadir método `onImageRequested(card: Card): void` que hace `this.imageRequested.emit(card)`.
- **Depende de**: Tarea 7

#### Tarea 10: Modificar `board-canvas.component.html` — enlazar `imageRequested`
- **Fichero**: `src/app/features/boards/canvas/board-canvas.component.html` (modificar)
- **Qué hace**: En el elemento `<app-board-card>`, añadir el binding `(imageRequested)="onImageRequested($event)"`.
- **Depende de**: Tarea 9

#### Tarea 11: Modificar `BoardsLayoutComponent` — signal `imageCard`, handler y modal
- **Fichero**: `src/app/features/boards/boards-layout.component.ts` (modificar)
- **Qué hace**:
  1. Añadir `imageCard = signal<Card | null>(null)`.
  2. Añadir `imageRequested = output<Card>()` en el `output` del canvas (no en este componente — ver Tarea 10). Aquí: añadir método `onImageRequested(card: Card): void` que hace `this.imageCard.set(card)`.
  3. Añadir método `async onImageApplied(result: { imageData: string; imagePrompt: string } | null): Promise<void>` que: obtiene `card = imageCard()` y `board = activeBoard()`, llama a `imageCard.set(null)`, construye `updatedCard` con spread preservando `imageData`/`imagePrompt` (o `undefined` si `result` es `null`), llama a `boardService.updateCard(board, updatedCard)` y luego `persistBoard(updatedBoard)`.
  4. Añadir import de `ImageGeneratorModalComponent` y de `Card` (ya existe) e importarlo en el array `imports`.
- **Depende de**: Tarea 4, Tarea 9

#### Tarea 12: Modificar `boards-layout.component.html` — añadir evento y modal
- **Fichero**: `src/app/features/boards/boards-layout.component.html` (modificar)
- **Qué hace**:
  1. En `<app-board-canvas>`, añadir `(imageRequested)="onImageRequested($event)"`.
  2. Al final del fichero (junto a los otros `@if` de modales), añadir bloque `@if (imageCard())` con `<app-image-generator-modal [card]="imageCard()!" (applied)="onImageApplied($event)" (cancelled)="imageCard.set(null)"/>`.
- **Depende de**: Tarea 11

#### Tarea 13: Modificar `InkSettingsModalComponent` — añadir propiedades para imagen
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (modificar)
- **Qué hace**:
  1. Añadir las propiedades de estado para imagen (plain properties, igual que `ollamaEndpoint`, `openAiEndpoint`): `imageProvider = ''`, `imageApiKey = ''`, `imageEndpoint = ''`, `imageModel = ''`, `imageSize = ''`.
  2. En `ngOnInit()`: leer `settings.imageProvider`, `settings.imageApiKey`, `settings.imageEndpoint`, `settings.imageModel`, `settings.imageSize` y asignar a las propiedades locales.
  3. En `saveAiSettings()`: incluir los cinco campos nuevos en la llamada a `projectService.updateSettings()`. Pasar `|| undefined` para no guardar strings vacíos.
  4. Añadir import de los tipos `ImageProvider`, `ImageSize` desde `project.model.ts` (necesarios si el Implementer quiere tipar las propiedades; si no, pueden ser `string`).
- **Depende de**: Tarea 2 (tipos en project.model.ts)

#### Tarea 14: Modificar `ink-settings-modal.component.html` — subsección "Generación de imágenes"
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**: Dentro del bloque `@if (activeSection() === 'ai')`, justo antes del botón "Guardar configuración de IA", añadir un `<div class="pt-4 border-t border-ink-border">` con:
  - Título de subsección "Generación de imágenes" (estilo igual que otros subtítulos del modal).
  - `<select [(ngModel)]="imageProvider">` con opciones: vacía ("Sin configurar"), `'dalle'` (DALL-E 3 OpenAI), `'openai-compatible-image'` (Servidor local).
  - Bloque `@if (imageProvider === 'dalle')`: campo `imageApiKey` (type password), campo `imageSize` (`select` con opciones 1024x1024 y 512x512).
  - Bloque `@if (imageProvider === 'openai-compatible-image')`: campo `imageEndpoint` (text, placeholder URL), campo `imageModel` (text, placeholder nombre del modelo), campo `imageSize` (`select` con tres opciones incluyendo 768x768).
  - Usar las clases CSS inline de campo (`field-label`/`field-input`) que `CardEditorModalComponent` define en su `styles`. En este componente no existen esas clases CSS; el Implementer debe replicar las clases de Tailwind usadas en los campos ya existentes del modal (ver campos `ollamaEndpoint`, `openAiEndpoint`).
- **Depende de**: Tarea 13

---

### Orden de ejecución

1. Tarea 1 — `board.model.ts`: añadir `imageData` e `imagePrompt` a `Card`
2. Tarea 2 — `project.model.ts`: añadir tipos `ImageProvider`, `ImageSize` y campos a `ProjectSettings`
3. Tarea 3 — Crear `image.service.ts`
4. Tarea 4 — Crear `image-generator-modal.component.ts`
5. Tarea 5 — Crear `image-generator-modal.component.html`
6. Tarea 6 — Crear `image-generator-modal.component.css` (vacío)
7. Tarea 7 — Modificar `board-card.component.ts`: computed `hasImage`, output `imageRequested`, CSS `.card-image`
8. Tarea 8 — Modificar `board-card.component.html`: visual con imagen y botón de cámara
9. Tarea 9 — Modificar `board-canvas.component.ts`: output e intermediario `imageRequested`
10. Tarea 10 — Modificar `board-canvas.component.html`: binding `(imageRequested)`
11. Tarea 11 — Modificar `boards-layout.component.ts`: signal `imageCard`, `onImageRequested`, `onImageApplied`, import del modal
12. Tarea 12 — Modificar `boards-layout.component.html`: evento y modal `@if (imageCard())`
13. Tarea 13 — Modificar `ink-settings-modal.component.ts`: propiedades y persistencia de imagen
14. Tarea 14 — Modificar `ink-settings-modal.component.html`: subsección "Generación de imágenes"

---

### Puntos de atención para el Implementer

**Restricción crítica — fetch de Tauri (no negociable):**
La spec muestra `fetch()` nativo en `ImageService`. El Implementer DEBE reemplazarlo por `import { fetch } from '@tauri-apps/plugin-http'`. Esta línea debe ser la primera importación del servicio. La CSP de Tauri 2.x bloquea cualquier `fetch` nativo hacia APIs externas (openai.com, endpoints locales). Ver `ai.service.ts` línea 2 como referencia obligatoria.

**Templates en ficheros separados (no negociable):**
La spec muestra `template: \`...\`` inline en el `@Component` de `ImageGeneratorModalComponent`. El Implementer DEBE usar `templateUrl: './image-generator-modal.component.html'` y crear el fichero HTML separado. Sin excepción.

**Hover de botón de cámara — CSS inline en el componente:**
`BoardCardComponent` usa el patrón `div:hover .card-delete { opacity: 1 !important; }` en el array `styles` del decorador (no en un fichero `.css` separado). El botón de cámara debe seguir exactamente el mismo patrón con la clase `.card-image`.

**Campos de formulario en `InkSettingsModalComponent` (plain properties, no signals):**
El modal de settings usa plain properties (`ollamaEndpoint = ''`, `openAiEndpoint = ''`) para el estado de los formularios, NO signals. Los nuevos campos de imagen (`imageProvider`, `imageApiKey`, etc.) deben ser igualmente plain properties para mantener coherencia con el patrón existente. Excepción: `selectedProvider` ya es un signal — NO convertir los nuevos campos en signals.

**`saveAiSettings()` no es async en el código actual:**
El método `saveAiSettings()` en `InkSettingsModalComponent` no es `async` (a diferencia de `saveEditorSettings()`). Al añadir los campos de imagen a `updateSettings()` dentro de este método, mantener el comportamiento actual: llamada síncrona sin `await` (la firma de `updateSettings` en `ProjectService` devuelve `Promise` pero el modal no la awaita en el flujo AI).

**Spec menciona `768x768` solo para el proveedor local:**
Para DALL-E, los tamaños válidos son `1024x1024` y `512x512` (DALL-E 3 no soporta 768). Para el proveedor local, añadir también `768x768`. El select de tamaño debe ser diferente según el proveedor (Tarea 14).

**`onImageApplied` debe preservar todos los campos existentes de `Card`:**
Al construir `updatedCard`, hacer spread completo de `card` antes de sobreescribir `imageData` e `imagePrompt`. Si `result` es `null` (quitar imagen), asignar `imageData: undefined, imagePrompt: undefined` — no omitir los campos ni asignar string vacío.

**Lo que NO hacer (de la spec):**
- No implementar búsqueda de imágenes (Unsplash, Pexels)
- No implementar edición de imagen (recorte, ajustes)
- No añadir imágenes a documentos TipTap
- No generar imágenes en batch
- No crear galería de imágenes separada
