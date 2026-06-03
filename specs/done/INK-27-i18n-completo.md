# INK-27 — i18n completo: textos hardcodeados restantes

## Objetivo

Completar la internacionalización comenzada en INK-26. Quedan ~130 textos en castellano hardcodeados repartidos en 13 ficheros HTML y 7 ficheros TypeScript. Esta spec los elimina todos aplicando el pipe `| transloco` en templates y `TranslocoService.translate()` en TypeScript donde sea necesario.

---

## Scope

**Incluido:**
- Todos los textos visibles (labels, placeholders, titles, content, options) en los ficheros HTML listados
- Mensajes de toast en componentes TypeScript
- Labels de menús contextuales en `binder.component.ts`
- Labels de modelos de datos (`board.model.ts`, `consistency.model.ts`, `project.model.ts`) — los strings se mueven a claves i18n que los componentes que los renderizan traducen con el pipe
- Plantillas de proyecto en `project-templates.ts` — los nombres y descripciones pasan a claves i18n
- Claves nuevas en `en.json` y `es.json` para todos los textos anteriores

**Excluido:**
- Strings internos de lógica de negocio que nunca se muestran al usuario (nombres de acciones, IDs de comandos internos como `'status:draft'`, `'rename'`)
- Textos de nombres de archivos o rutas del sistema
- Strings en comentarios de código
- Añadir nuevos idiomas (solo ES / EN)

---

## Parte 1 — Templates HTML

### 1.1 — desk-panel.component.html

Textos a traducir:
- `title="Anclar a la izquierda"` → `[title]="'DESK.ANCHOR_LEFT' | transloco"`
- `title="Anclar abajo"` → `[title]="'DESK.ANCHOR_BOTTOM' | transloco"`
- `title="Anclar a la derecha"` → `[title]="'DESK.ANCHOR_RIGHT' | transloco"`
- `title="Cerrar"` → `[title]="'DESK.CLOSE' | transloco"`
- `[placeholder]="'Escribe tu nota...'"` → `[placeholder]="'DESK.PLACEHOLDER' | transloco"`
- `<span>El Cajón</span>` → `{{ 'DESK.TITLE' | transloco }}`

### 1.2 — desk-binder.component.html

- `<span>Notas</span>` → `{{ 'DESK.BINDER_TITLE' | transloco }}`
- `title="Nueva nota"` → `[title]="'DESK.NEW_NOTE' | transloco"`
- `<p>Sin notas todavía.<br>Crea una con el botón +</p>` → `{{ 'DESK.EMPTY_STATE' | transloco }}`
- `title="Eliminar nota"` → `[title]="'DESK.DELETE_NOTE' | transloco"`

### 1.3 — binder.component.html

- `title="Nuevo documento"` → `[title]="'BINDER.NEW_DOCUMENT' | transloco"`
- `title="Nueva carpeta"` → `[title]="'BINDER.NEW_FOLDER' | transloco"`
- `title="Importar documento (TXT, MD, DOCX, ODT) — ODT requiere LibreOffice instalado"` → `[title]="'BINDER.IMPORT' | transloco"`
- `<p>Sin documentos todavía.<br>Crea uno con el botón +</p>` → `{{ 'BINDER.EMPTY_STATE' | transloco }}`

### 1.4 — find-replace-bar.component.html

- `placeholder="Buscar..."` → `[placeholder]="'FIND_REPLACE.SEARCH_PLACEHOLDER' | transloco"`
- `<span>Sin resultados</span>` → `{{ 'FIND_REPLACE.NO_RESULTS' | transloco }}`
- `title="Distinguir mayúsculas"` → `[title]="'FIND_REPLACE.MATCH_CASE' | transloco"`
- `placeholder="Reemplazar por..."` → `[placeholder]="'FIND_REPLACE.REPLACE_PLACEHOLDER' | transloco"`
- `<button>Reemplazar</button>` (texto visible ya sustituido por `COMMON.X` si aplica, o nueva clave `FIND_REPLACE.REPLACE_BTN`)

### 1.5 — binder-footer.component.html

- `<p>Objetivo de palabras para hoy</p>` → `{{ 'BINDER.WORD_GOAL_LABEL' | transloco }}`

### 1.6 — snapshots-panel.component.html

- `<span>Historial</span>` → `{{ 'SNAPSHOTS.TITLE' | transloco }}`
- `placeholder="Etiqueta..."` → `[placeholder]="'SNAPSHOTS.LABEL_PLACEHOLDER' | transloco"`

### 1.7 — consistency-modal.component.html

- `<p>Configura la API key de Anthropic para usar esta función.</p>` → `{{ 'CONSISTENCY.API_KEY_REQUIRED' | transloco }}`
- `<strong>Cómo funciona:</strong>` → `<strong>{{ 'CONSISTENCY.HOW_IT_WORKS' | transloco }}</strong>`
- `<strong>Coste estimado:</strong>` → `<strong>{{ 'CONSISTENCY.ESTIMATED_COST' | transloco }}</strong>`
- `<ink-button>Iniciar análisis</ink-button>` → `{{ 'CONSISTENCY.START_ANALYSIS' | transloco }}`
- `<ink-button>Re-analizar</ink-button>` → `{{ 'CONSISTENCY.RE_ANALYZE' | transloco }}`

### 1.8 — ink-settings-modal.component.html

Sección General:
- Labels de Autoguardado, opciones de select (Desactivado, Cada X segundos...), Máximo snapshots, opciones, texto informativo
- Label "Corrector ortográfico", botón "Guardar cambios", texto de backup, botón "Crear backup"

Sección IA:
- Labels de Proveedor, API Key, Modelo, URL de Ollama, Nombre del modelo, textos descriptivos, botones "Probar conexión", "Guardar configuración de IA"

Sección Imágenes:
- Labels y opciones de proveedor de imágenes, API key OpenAI, tamaños de imagen, URL servidor, Modelo

Sección Transcripción:
- Label Proveedor, opciones (Sin configurar, OpenAI Whisper, Groq, Servidor local), API keys, URL servidor, Idioma por defecto, opciones de idioma (Autodetección, Español, English, Français, Deutsch, Italiano, Português)

Sección Apariencia:
- Label Tema, Label Tamaño de fuente, texto "No afecta al área de escritura"

Estrategia: agrupar todas las claves nuevas bajo `SETTINGS.*` con sub-prefijos: `SETTINGS.GENERAL.*`, `SETTINGS.AI.*`, `SETTINGS.IMAGES.*`, `SETTINGS.TRANSCRIPTION.*`, `SETTINGS.APPEARANCE.*`.

### 1.9 — card-editor-modal.component.html

- Títulos condicionales: `isNew() ? 'Nueva tarjeta' : 'Editar tarjeta'` → `isNew() ? ('CARD.NEW_TITLE' | transloco) : ('CARD.EDIT_TITLE' | transloco)`
- Label "Tipo", label "Nombre del personaje *" / "Título", label "Descripción / notas del personaje" / "Contenido"
- Placeholders condicionales (Elena Vidal, Título de la tarjeta, etc.)
- Label "Nombres alternativos / apodos", placeholder, texto informativo
- Label "Aparece en", `<span>Escaneando...</span>`, `<span>Buscar apariciones</span>`, texto de resultados
- `<p>El proyecto no tiene documentos todavía.</p>`
- Texto de ayuda de búsqueda automática
- Label "Color"
- Botón `isNew() ? 'Crear tarjeta' : 'Guardar'` → `isNew() ? ('CARD.CREATE_BTN' | transloco) : ('COMMON.SAVE' | transloco)`

Claves bajo `CARD.*`.

### 1.10 — image-generator-modal.component.html

- `<label>Prompt de imagen</label>` → `{{ 'IMAGE_GEN.PROMPT_LABEL' | transloco }}`
- `placeholder="Describe la imagen..."` → `[placeholder]="'IMAGE_GEN.PROMPT_PLACEHOLDER' | transloco"`
- `<ink-button>Quitar imagen</ink-button>` → `{{ 'IMAGE_GEN.REMOVE_IMAGE' | transloco }}`

### 1.11 — step-metadata.component.html

Todos los labels y placeholders del formulario de autor (Nombre legal, Nombre de pluma, Email, Teléfono, Ciudad/País, Agente, Género, Año copyright, Sinopsis) bajo `EXPORT.METADATA.*`.

### 1.12 — step-format.component.html

- Label "Formato de exportación", nombre y descripción de cada formato (PDF Manuscrito, EPUB, DOCX), label y opciones de tamaño de página, texto informativo A4/Letter bajo `EXPORT.FORMAT.*`.

### 1.13 — step-document-selector.component.html

- Texto de instrucción, botones "Seleccionar todo" / "Deseleccionar todo", `palabras`, `documentos seleccionados`, `palabras` del total bajo `EXPORT.SELECTOR.*`.

### 1.14 — ai-assistant-panel.component.html

- `title="Limpiar conversación"` → `[title]="'AI.CLEAR_CONVERSATION' | transloco"`
- `<span>Enter envía · Shift+Enter nueva línea</span>` → `{{ 'AI.HINT_SEND' | transloco }}`

### 1.15 — narrative-layout.component.html

- `<span>Cargando...</span>` → `{{ 'COMMON.LOADING' | transloco }}`
- `<p>El proyecto no tiene documentos todavía.</p>` → `{{ 'NARRATIVE.EMPTY_STATE' | transloco }}`

### 1.16 — transcription-modal.component.html

- `<label>Archivo de audio</label>`, opciones de idioma (Autodetección, Español, English, Français, Deutsch, Italiano, Português, Català, Galego, Euskara), texto informativo bajo `TRANSCRIPTION.*`.

---

## Parte 2 — TypeScript

### 2.1 — Mensajes de toast en componentes

Los componentes que llaman a `this.toast.success/error(texto)` deben inyectar `TranslocoService` y usar `this.#transloco.translate('CLAVE')`.

Ficheros afectados:
- `export-modal.component.ts`: 3 mensajes de éxito de exportación → `EXPORT.SUCCESS_EPUB`, `EXPORT.SUCCESS_DOCX`, `EXPORT.SUCCESS_PDF`
- `boards-layout.component.ts`: 3 mensajes de error → `BOARDS.ERROR_LOAD`, `BOARDS.ERROR_DELETE`, `BOARDS.ERROR_SAVE`
- `transcription-modal.component.ts`: 1 mensaje de éxito → `TRANSCRIPTION.SUCCESS`

### 2.2 — Menú contextual en binder.component.ts

Los labels visibles del menú contextual (Renombrar, Estado, Sin estado, Por escribir, Borrador, En revisión, Finalizado, Solo notas, Nuevo documento aquí, Nueva carpeta aquí, Eliminar) deben usar claves i18n.

Estrategia: inyectar `TranslocoService` en `binder.component.ts` y construir el array de opciones de menú dentro de un `computed()` que llame a `this.#transloco.translate('BINDER.CTX.*')`.

### 2.3 — Labels en modelos de datos

Los modelos definen strings de display que los componentes renderizan directamente. Estrategia: **mantener los valores en los modelos como claves i18n** (strings que comienzan por el prefijo de grupo) y que los componentes que los muestren apliquen el pipe `| transloco`.

Ficheros:
- `board.model.ts` — `CARD_TYPE_LABELS`: `character`, `note`, `research`, `other` → valores actualizados a `'CARD.TYPE_CHARACTER'`, `'CARD.TYPE_NOTE'`, `'CARD.TYPE_RESEARCH'`, `'CARD.TYPE_OTHER'`
- `consistency.model.ts` — Labels de tipo y severidad de inconsistencias → claves `CONSISTENCY.TYPE_*` y `CONSISTENCY.SEVERITY_*`
- `project.model.ts` — `DOCUMENT_STATUS_CONFIG` labels → claves `BINDER.STATUS_*`

Para cada modelo: actualizar el tipo del campo label a `string` (ya lo es) con el convenio de que el valor es una clave transloco. Actualizar los componentes que renderizan esos labels para que apliquen el pipe: `{{ status.label | transloco }}`.

### 2.4 — Plantillas de proyecto en project-templates.ts

Los nombres y descripciones de las plantillas (Proyecto en blanco, Novela 3 actos, Relato corto, etc.) y los nombres de los nodos del árbol (Acto I, Capítulo 1, Planteamiento...) son strings mostrados al usuario.

Estrategia:
- Los nombres y descripciones de plantillas → claves `TEMPLATES.*`
- Los nombres de nodos del árbol (Acto I, Capítulo 1...) → mantenerlos como strings literales en español, ya que son el contenido inicial del proyecto del usuario (no UI de la aplicación). **Excluidos del scope.**

### 2.5 — Títulos de pasos en export-modal.component.ts

El array `stepTitles` con `['Elegir formato', 'Seleccionar documentos', 'Información del autor']` → usar `computed()` con `this.#transloco.translate('EXPORT.STEP_FORMAT')`, etc.

---

## Claves nuevas necesarias

### en.json — grupos nuevos

```json
"DESK.TITLE": "The Drawer",
"DESK.ANCHOR_LEFT": "Anchor to the left",
"DESK.ANCHOR_BOTTOM": "Anchor to the bottom",
"DESK.ANCHOR_RIGHT": "Anchor to the right",
"DESK.CLOSE": "Close",
"DESK.PLACEHOLDER": "Write your note...",
"DESK.BINDER_TITLE": "Notes",
"DESK.NEW_NOTE": "New note",
"DESK.EMPTY_STATE": "No notes yet. Create one with the + button.",
"DESK.DELETE_NOTE": "Delete note",

"BINDER.NEW_DOCUMENT": "New document",
"BINDER.NEW_FOLDER": "New folder",
"BINDER.IMPORT": "Import document (TXT, MD, DOCX, ODT) — ODT requires LibreOffice",
"BINDER.EMPTY_STATE": "No documents yet. Create one with the + button.",
"BINDER.WORD_GOAL_LABEL": "Today's word goal",
"BINDER.CTX_RENAME": "Rename",
"BINDER.CTX_STATUS": "Status",
"BINDER.CTX_STATUS_CLEAR": "○  No status",
"BINDER.CTX_STATUS_TODO": "○  To write",
"BINDER.CTX_STATUS_DRAFT": "○  Draft",
"BINDER.CTX_STATUS_REVISED": "○  In revision",
"BINDER.CTX_STATUS_FINAL": "●  Final",
"BINDER.CTX_STATUS_NOTES": "◇  Notes only",
"BINDER.CTX_NEW_DOC_HERE": "New document here",
"BINDER.CTX_NEW_FOLDER_HERE": "New folder here",
"BINDER.CTX_DELETE": "Delete",
"BINDER.STATUS_TODO": "To write",
"BINDER.STATUS_DRAFT": "Draft",
"BINDER.STATUS_REVISED": "In revision",
"BINDER.STATUS_FINAL": "Final",
"BINDER.STATUS_NOTES": "Notes only",

"FIND_REPLACE.SEARCH_PLACEHOLDER": "Search...",
"FIND_REPLACE.NO_RESULTS": "No results",
"FIND_REPLACE.MATCH_CASE": "Match case",
"FIND_REPLACE.REPLACE_PLACEHOLDER": "Replace with...",
"FIND_REPLACE.REPLACE_BTN": "Replace",

"SNAPSHOTS.TITLE": "History",
"SNAPSHOTS.LABEL_PLACEHOLDER": "Label...",

"CONSISTENCY.API_KEY_REQUIRED": "Configure the Anthropic API key to use this feature.",
"CONSISTENCY.HOW_IT_WORKS": "How it works:",
"CONSISTENCY.ESTIMATED_COST": "Estimated cost:",
"CONSISTENCY.START_ANALYSIS": "Start analysis",
"CONSISTENCY.RE_ANALYZE": "Re-analyze",
"CONSISTENCY.TYPE_CHARACTER_DESCRIPTION": "Character description",
"CONSISTENCY.TYPE_CHARACTER_NAME": "Character name",
"CONSISTENCY.TYPE_TIMELINE": "Timeline",
"CONSISTENCY.TYPE_LOCATION": "Location description",
"CONSISTENCY.TYPE_OBJECT": "Object or element",
"CONSISTENCY.TYPE_RELATIONSHIP": "Character relationship",
"CONSISTENCY.TYPE_OTHER": "Other",
"CONSISTENCY.SEVERITY_HIGH": "High",
"CONSISTENCY.SEVERITY_MEDIUM": "Medium",
"CONSISTENCY.SEVERITY_LOW": "Low",

"SETTINGS.GENERAL.AUTOSAVE_LABEL": "Autosave",
"SETTINGS.GENERAL.AUTOSAVE_OFF": "Disabled",
"SETTINGS.GENERAL.AUTOSAVE_15S": "Every 15 seconds",
"SETTINGS.GENERAL.AUTOSAVE_30S": "Every 30 seconds (default)",
"SETTINGS.GENERAL.AUTOSAVE_1M": "Every minute",
"SETTINGS.GENERAL.AUTOSAVE_5M": "Every 5 minutes",
"SETTINGS.GENERAL.SNAPSHOTS_LABEL": "Maximum snapshots per document",
"SETTINGS.GENERAL.SNAPSHOTS_5": "5 snapshots",
"SETTINGS.GENERAL.SNAPSHOTS_10": "10 snapshots (default)",
"SETTINGS.GENERAL.SNAPSHOTS_20": "20 snapshots",
"SETTINGS.GENERAL.SNAPSHOTS_50": "50 snapshots",
"SETTINGS.GENERAL.SNAPSHOTS_HINT": "When the limit is exceeded the oldest is deleted (FIFO).",
"SETTINGS.GENERAL.SPELLCHECK": "Spell checker",
"SETTINGS.GENERAL.SAVE_BTN": "Save changes",
"SETTINGS.GENERAL.BACKUP_DESC": "Creates a full project backup as a ZIP file.",
"SETTINGS.GENERAL.BACKUP_BTN": "Create project backup",
"SETTINGS.AI.PROVIDER_LABEL": "AI provider",
"SETTINGS.AI.API_KEY_LABEL": "Anthropic API Key",
"SETTINGS.AI.API_KEY_SET": "✓ API key configured",
"SETTINGS.AI.MODEL_LABEL": "Model",
"SETTINGS.AI.OLLAMA_URL_LABEL": "Ollama URL",
"SETTINGS.AI.OLLAMA_URL_HINT": "Base URL of your Ollama instance. Default: http://localhost:11434",
"SETTINGS.AI.OLLAMA_MODEL_LABEL": "Model name",
"SETTINGS.AI.OLLAMA_MODEL_HINT": "Must be downloaded in your Ollama instance.",
"SETTINGS.AI.TEST_CONNECTION": "Test connection",
"SETTINGS.AI.LOCAL_URL_LABEL": "Server URL *",
"SETTINGS.AI.LOCAL_URL_HINT": "Compatible with llama.cpp, LM Studio, LocalAI, vLLM, Jan, etc.",
"SETTINGS.AI.LOCAL_MODEL_LABEL": "Model name",
"SETTINGS.AI.LOCAL_MODEL_HINT": "The exact name depends on your server. Many accept any string.",
"SETTINGS.AI.LOCAL_KEY_LABEL": "API key (if your server requires it)",
"SETTINGS.AI.SAVE_BTN": "Save AI settings",
"SETTINGS.IMAGES.TITLE": "Image generation",
"SETTINGS.IMAGES.PROVIDER_LABEL": "Image provider",
"SETTINGS.IMAGES.PROVIDER_NONE": "Not configured",
"SETTINGS.IMAGES.PROVIDER_LOCAL": "Local server (LocalAI, ComfyUI...)",
"SETTINGS.IMAGES.OPENAI_KEY_LABEL": "OpenAI API key",
"SETTINGS.IMAGES.OPENAI_KEY_HINT": "Different from the Anthropic API key. Get it at platform.openai.com.",
"SETTINGS.IMAGES.SIZE_LABEL": "Image size",
"SETTINGS.IMAGES.SIZE_1024": "1024×1024 (high quality, slower)",
"SETTINGS.IMAGES.SIZE_512": "512×512 (fast)",
"SETTINGS.IMAGES.LOCAL_URL_LABEL": "Server URL",
"SETTINGS.IMAGES.LOCAL_URL_HINT": "Server implementing /v1/images/generations...",
"SETTINGS.IMAGES.LOCAL_MODEL_LABEL": "Model",
"SETTINGS.IMAGES.LOCAL_SIZE_LABEL": "Image size",
"SETTINGS.TRANSCRIPTION.TITLE": "Audio transcription",
"SETTINGS.TRANSCRIPTION.PROVIDER_LABEL": "Provider",
"SETTINGS.TRANSCRIPTION.PROVIDER_NONE": "Not configured",
"SETTINGS.TRANSCRIPTION.PROVIDER_OPENAI": "OpenAI Whisper",
"SETTINGS.TRANSCRIPTION.PROVIDER_GROQ": "Groq (fast, free tier)",
"SETTINGS.TRANSCRIPTION.PROVIDER_LOCAL": "Local server (whisper.cpp, etc.)",
"SETTINGS.TRANSCRIPTION.OPENAI_KEY_LABEL": "OpenAI API key",
"SETTINGS.TRANSCRIPTION.OPENAI_KEY_HINT": "Different from the Anthropic key. Get it at platform.openai.com.",
"SETTINGS.TRANSCRIPTION.GROQ_KEY_LABEL": "Groq API key",
"SETTINGS.TRANSCRIPTION.GROQ_KEY_HINT": "Get it at console.groq.com · Free tier available.",
"SETTINGS.TRANSCRIPTION.LOCAL_URL_LABEL": "Server URL",
"SETTINGS.TRANSCRIPTION.LOCAL_URL_HINT": "Server with /v1/audio/transcriptions endpoint...",
"SETTINGS.TRANSCRIPTION.LANG_LABEL": "Default language (optional)",
"SETTINGS.TRANSCRIPTION.LANG_AUTO": "Auto-detect",
"SETTINGS.TRANSCRIPTION.LANG_ES": "Spanish",
"SETTINGS.TRANSCRIPTION.LANG_EN": "English",
"SETTINGS.TRANSCRIPTION.LANG_FR": "French",
"SETTINGS.TRANSCRIPTION.LANG_DE": "German",
"SETTINGS.TRANSCRIPTION.LANG_IT": "Italian",
"SETTINGS.TRANSCRIPTION.LANG_PT": "Portuguese",
"SETTINGS.TRANSCRIPTION.LANG_CA": "Catalan",
"SETTINGS.TRANSCRIPTION.LANG_GL": "Galician",
"SETTINGS.TRANSCRIPTION.LANG_EU": "Basque",
"SETTINGS.APPEARANCE.THEME_LABEL": "Theme",
"SETTINGS.APPEARANCE.FONT_SIZE_LABEL": "Interface font size",
"SETTINGS.APPEARANCE.FONT_SIZE_HINT": "Does not affect the writing area.",

"CARD.NEW_TITLE": "New card",
"CARD.EDIT_TITLE": "Edit card",
"CARD.TYPE_LABEL": "Type",
"CARD.TITLE_CHARACTER": "Character name *",
"CARD.TITLE_OTHER": "Title",
"CARD.BODY_CHARACTER": "Description / character notes",
"CARD.BODY_OTHER": "Content",
"CARD.PLACEHOLDER_CHARACTER_TITLE": "Elena Vidal",
"CARD.PLACEHOLDER_OTHER_TITLE": "Card title",
"CARD.PLACEHOLDER_CHARACTER_BODY": "Protagonist. 34 years old. Private detective...",
"CARD.PLACEHOLDER_OTHER_BODY": "Write your notes, ideas here...",
"CARD.ALIASES_LABEL": "Alternative names / nicknames (comma-separated)",
"CARD.ALIASES_PLACEHOLDER": "Elena, Eli, Detective Vidal",
"CARD.ALIASES_HINT": "All will be used when searching for appearances.",
"CARD.APPEARANCES_LABEL": "Appears in",
"CARD.SCANNING": "Scanning...",
"CARD.SEARCH_APPEARANCES": "Search appearances",
"CARD.APPEARANCES_HINT": "Results from the last scan. Uncheck chapters where the character does not really appear.",
"CARD.NO_DOCUMENTS": "The project has no documents yet.",
"CARD.SEARCH_AUTO_HINT": "Automatic search uses the character name as a whole word...",
"CARD.COLOR_LABEL": "Color",
"CARD.CREATE_BTN": "Create card",
"CARD.TYPE_CHARACTER": "Character",
"CARD.TYPE_NOTE": "Note",
"CARD.TYPE_RESEARCH": "Research",
"CARD.TYPE_OTHER": "Other",

"IMAGE_GEN.PROMPT_LABEL": "Image prompt",
"IMAGE_GEN.PROMPT_PLACEHOLDER": "Describe the image you want to generate...",
"IMAGE_GEN.REMOVE_IMAGE": "Remove image",

"EXPORT.STEP_FORMAT": "Choose format",
"EXPORT.STEP_SELECTOR": "Select documents",
"EXPORT.STEP_METADATA": "Author information",
"EXPORT.SUCCESS_EPUB": "EPUB saved successfully.",
"EXPORT.SUCCESS_DOCX": "Word document saved successfully.",
"EXPORT.SUCCESS_PDF": "Manuscript opened. Click \"Save as PDF / Print\" in the window.",
"EXPORT.METADATA.LEGAL_NAME": "Legal name *",
"EXPORT.METADATA.PEN_NAME": "Pen name (if different)",
"EXPORT.METADATA.EMAIL": "Email *",
"EXPORT.METADATA.PHONE": "Phone",
"EXPORT.METADATA.CITY_COUNTRY": "City, Country",
"EXPORT.METADATA.AGENT": "Literary agent (if you have representation)",
"EXPORT.METADATA.GENRE": "Literary genre *",
"EXPORT.METADATA.COPYRIGHT_YEAR": "Copyright year",
"EXPORT.METADATA.SYNOPSIS": "Synopsis (for ebook metadata)",
"EXPORT.METADATA.PH_LEGAL": "Your full name",
"EXPORT.METADATA.PH_PEN": "Published author name",
"EXPORT.METADATA.PH_EMAIL": "you@email.com",
"EXPORT.METADATA.PH_PHONE": "+1 555 000 0000",
"EXPORT.METADATA.PH_CITY": "New York, USA",
"EXPORT.METADATA.PH_AGENT": "Agency / agent name",
"EXPORT.METADATA.PH_GENRE": "Adventure novel, Thriller...",
"EXPORT.METADATA.PH_SYNOPSIS": "Brief description of the work...",
"EXPORT.FORMAT.TITLE": "Export format",
"EXPORT.FORMAT.PDF_NAME": "PDF Manuscript",
"EXPORT.FORMAT.PDF_DESC": "Standard Manuscript Format. For sending to agents and publishers.",
"EXPORT.FORMAT.EPUB_NAME": "EPUB",
"EXPORT.FORMAT.EPUB_DESC": "For e-readers, Kindle and digital distribution.",
"EXPORT.FORMAT.DOCX_NAME": "Word (DOCX)",
"EXPORT.FORMAT.DOCX_DESC": "Compatible with Word and LibreOffice Writer.",
"EXPORT.FORMAT.PAGE_SIZE_LABEL": "Page size",
"EXPORT.FORMAT.PAGE_SIZE_HINT": "A4 is standard in Europe. Letter is standard in the US and Canada.",
"EXPORT.SELECTOR.INSTRUCTION": "Select the documents to include in the export and order them...",
"EXPORT.SELECTOR.SELECT_ALL": "Select all",
"EXPORT.SELECTOR.DESELECT_ALL": "Deselect all",
"EXPORT.SELECTOR.WORD_COUNT": "words",
"EXPORT.SELECTOR.DOCS_SELECTED": "documents selected",

"AI.CLEAR_CONVERSATION": "Clear conversation",
"AI.HINT_SEND": "Enter sends · Shift+Enter new line",

"COMMON.LOADING": "Loading...",
"NARRATIVE.EMPTY_STATE": "The project has no documents yet.",

"TRANSCRIPTION.AUDIO_LABEL": "Audio file",
"TRANSCRIPTION.LANG_LABEL": "Language",
"TRANSCRIPTION.LANG_AUTO": "Auto-detect",
"TRANSCRIPTION.LANG_CA": "Catalan",
"TRANSCRIPTION.LANG_GL": "Galician",
"TRANSCRIPTION.LANG_EU": "Basque",
"TRANSCRIPTION.SUCCESS": "Transcription completed and saved in the \"Transcriptions\" folder.",

"BOARDS.ERROR_LOAD": "Error loading boards",
"BOARDS.ERROR_DELETE": "Error deleting board",
"BOARDS.ERROR_SAVE": "Error saving board",

"TEMPLATES.BLANK_NAME": "Blank project",
"TEMPLATES.BLANK_DESC": "No structure. Start from scratch.",
"TEMPLATES.THREE_ACT_NAME": "Novel (3 acts)",
"TEMPLATES.THREE_ACT_DESC": "Classic three-act structure with chapters.",
"TEMPLATES.PARTS_NAME": "Novel (parts and chapters)",
"TEMPLATES.PARTS_DESC": "3 parts with 5 chapters each.",
"TEMPLATES.SHORT_STORY_NAME": "Short story",
"TEMPLATES.SHORT_STORY_DESC": "Minimal structure for a short story.",
"TEMPLATES.ESSAY_NAME": "Essay",
"TEMPLATES.ESSAY_DESC": "Introduction, body by sections and conclusion.",
"TEMPLATES.CUSTOM_NAME": "Custom",
"TEMPLATES.CUSTOM_DESC": "Define the number of parts and chapters yourself."
```

Las claves `es.json` equivalentes en español (mismos valores que actualmente están hardcodeados).

---

## Criterios de aceptación

- [ ] `grep -rn 'title="[^"]*[áéíóúñ]' src/app --include="*.html"` devuelve cero resultados
- [ ] `grep -rn 'placeholder="[^"]*[a-záéíóúñ]' src/app --include="*.html"` devuelve cero resultados
- [ ] Los textos visibles de los 16 ficheros HTML listados pasan por el pipe transloco
- [ ] Los mensajes de toast en los 3 ficheros `.ts` afectados usan `TranslocoService.translate()`
- [ ] El menú contextual del binder usa claves i18n en sus labels
- [ ] Los modelos (`board.model.ts`, `consistency.model.ts`, `project.model.ts`) tienen valores de label como claves i18n, y los componentes que los renderizan aplican el pipe
- [ ] Los nombres y descripciones de plantillas en `project-templates.ts` usan claves i18n
- [ ] `en.json` y `es.json` contienen todas las claves nuevas con sus traducciones
- [ ] La app compila sin errores (`ng build` limpio)
- [ ] No hay regresiones en las funcionalidades afectadas (export, settings, binder, boards, transcription)
