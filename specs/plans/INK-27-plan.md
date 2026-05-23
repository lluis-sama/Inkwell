# Plan de implementación — INK-27

## Resumen

Completar la internacionalización con Transloco eliminando los ~130 textos hardcodeados restantes. El trabajo se divide en: (1) añadir todas las claves nuevas a los JSON de traducción, (2) convertir los objetos de labels en modelos a claves i18n, (3) actualizar cada componente HTML y TypeScript para usar el pipe `| transloco` o `TranslocoService`, respetando en todo momento el patrón zoneless + signals.

---

## Tareas

### Tarea 1: Añadir claves nuevas a `en.json` y `es.json`

- **Fichero**: `src/assets/i18n/en.json` (modificar)
- **Fichero**: `src/assets/i18n/es.json` (modificar)
- **Qué hace**: Añadir todos los grupos nuevos de claves al final de cada fichero, antes del `}` de cierre. Los grupos son: `DESK.*`, `BINDER.*` (extensión), `FIND_REPLACE.*`, `SNAPSHOTS.*`, `CONSISTENCY.*`, `SETTINGS.*`, `CARD.*`, `IMAGE_GEN.*`, `EXPORT.*`, `AI.*`, `COMMON.LOADING`, `NARRATIVE.EMPTY_STATE`, `TRANSCRIPTION.*`, `BOARDS.ERROR_*`, `TEMPLATES.*`.
- **Valores en `en.json`**: los listados en la sección "en.json (nuevos grupos)" de la spec.
- **Valores en `es.json`**: los textos españoles actualmente hardcodeados en el código (equivalentes directos de cada clave).
- **Depende de**: ninguna dependencia previa.
- **Riesgo**: El JSON debe mantener validez sintáctica. La última clave existente no debe tener coma trailing. El Implementer debe insertar las claves nuevas como entradas adicionales al objeto raíz, respetando el formato `"CLAVE": "valor"` con coma después de cada par salvo el último.

**Valores específicos para `es.json`** (extraídos del código actual):

```
"DESK.TITLE": "El Cajón",
"DESK.ANCHOR_LEFT": "Anclar a la izquierda",
"DESK.ANCHOR_BOTTOM": "Anclar abajo",
"DESK.ANCHOR_RIGHT": "Anclar a la derecha",
"DESK.CLOSE": "Cerrar",
"DESK.PLACEHOLDER": "Escribe tu nota...",
"DESK.BINDER_TITLE": "Notas",
"DESK.NEW_NOTE": "Nueva nota",
"DESK.EMPTY_STATE": "Sin notas todavía. Crea una con el botón +",
"DESK.DELETE_NOTE": "Eliminar nota",
"BINDER.NEW_DOCUMENT": "Nuevo documento",
"BINDER.NEW_FOLDER": "Nueva carpeta",
"BINDER.IMPORT": "Importar documento (TXT, MD, DOCX, ODT) — ODT requiere LibreOffice instalado",
"BINDER.EMPTY_STATE": "Sin documentos todavía. Crea uno con el botón +",
"BINDER.WORD_GOAL_LABEL": "Objetivo de palabras para hoy",
"BINDER.CTX_RENAME": "Renombrar",
"BINDER.CTX_STATUS": "Estado",
"BINDER.CTX_STATUS_CLEAR": "○  Sin estado",
"BINDER.CTX_STATUS_TODO": "○  Por escribir",
"BINDER.CTX_STATUS_DRAFT": "○  Borrador",
"BINDER.CTX_STATUS_REVISED": "○  En revisión",
"BINDER.CTX_STATUS_FINAL": "●  Finalizado",
"BINDER.CTX_STATUS_NOTES": "◇  Solo notas",
"BINDER.CTX_NEW_DOC_HERE": "Nuevo documento aquí",
"BINDER.CTX_NEW_FOLDER_HERE": "Nueva carpeta aquí",
"BINDER.CTX_DELETE": "Eliminar",
"BINDER.STATUS_TODO": "Por escribir",
"BINDER.STATUS_DRAFT": "Borrador",
"BINDER.STATUS_REVISED": "En revisión",
"BINDER.STATUS_FINAL": "Finalizado",
"BINDER.STATUS_NOTES": "Solo notas",
"FIND_REPLACE.SEARCH_PLACEHOLDER": "Buscar...",
"FIND_REPLACE.NO_RESULTS": "Sin resultados",
"FIND_REPLACE.MATCH_CASE": "Distinguir mayúsculas",
"FIND_REPLACE.REPLACE_PLACEHOLDER": "Reemplazar por...",
"FIND_REPLACE.REPLACE_BTN": "Reemplazar",
"SNAPSHOTS.TITLE": "Historial",
"SNAPSHOTS.LABEL_PLACEHOLDER": "Etiqueta...",
"CONSISTENCY.API_KEY_REQUIRED": "Configura la API key de Anthropic para usar esta función.",
"CONSISTENCY.HOW_IT_WORKS": "Cómo funciona:",
"CONSISTENCY.ESTIMATED_COST": "Coste estimado:",
"CONSISTENCY.START_ANALYSIS": "Iniciar análisis",
"CONSISTENCY.RE_ANALYZE": "Re-analizar",
"CONSISTENCY.TYPE_CHARACTER_DESCRIPTION": "Descripción de personaje",
"CONSISTENCY.TYPE_CHARACTER_NAME": "Nombre de personaje",
"CONSISTENCY.TYPE_TIMELINE": "Línea temporal",
"CONSISTENCY.TYPE_LOCATION": "Descripción de lugar",
"CONSISTENCY.TYPE_OBJECT": "Objeto o elemento",
"CONSISTENCY.TYPE_RELATIONSHIP": "Relación entre personajes",
"CONSISTENCY.TYPE_OTHER": "Otro",
"CONSISTENCY.SEVERITY_HIGH": "Alta",
"CONSISTENCY.SEVERITY_MEDIUM": "Media",
"CONSISTENCY.SEVERITY_LOW": "Baja",
"SETTINGS.GENERAL.AUTOSAVE_LABEL": "Autoguardado",
"SETTINGS.GENERAL.AUTOSAVE_OFF": "Desactivado",
"SETTINGS.GENERAL.AUTOSAVE_15S": "Cada 15 segundos",
"SETTINGS.GENERAL.AUTOSAVE_30S": "Cada 30 segundos (por defecto)",
"SETTINGS.GENERAL.AUTOSAVE_1M": "Cada minuto",
"SETTINGS.GENERAL.AUTOSAVE_5M": "Cada 5 minutos",
"SETTINGS.GENERAL.SNAPSHOTS_LABEL": "Máximo de snapshots por documento",
"SETTINGS.GENERAL.SNAPSHOTS_5": "5 snapshots",
"SETTINGS.GENERAL.SNAPSHOTS_10": "10 snapshots (por defecto)",
"SETTINGS.GENERAL.SNAPSHOTS_20": "20 snapshots",
"SETTINGS.GENERAL.SNAPSHOTS_50": "50 snapshots",
"SETTINGS.GENERAL.SNAPSHOTS_HINT": "Al superar el límite se elimina el más antiguo (FIFO).",
"SETTINGS.GENERAL.SPELLCHECK": "Corrector ortográfico",
"SETTINGS.GENERAL.SAVE_BTN": "Guardar cambios",
"SETTINGS.GENERAL.BACKUP_DESC": "Crea una copia de seguridad completa del proyecto como archivo ZIP.",
"SETTINGS.GENERAL.BACKUP_BTN": "Crear backup del proyecto",
"SETTINGS.AI.PROVIDER_LABEL": "Proveedor de IA",
"SETTINGS.AI.API_KEY_LABEL": "Anthropic API Key",
"SETTINGS.AI.API_KEY_SET": "✓ API key configurada",
"SETTINGS.AI.MODEL_LABEL": "Modelo",
"SETTINGS.AI.OLLAMA_URL_LABEL": "URL de Ollama",
"SETTINGS.AI.OLLAMA_URL_HINT": "URL base de tu instancia de Ollama. Por defecto: http://localhost:11434",
"SETTINGS.AI.OLLAMA_MODEL_LABEL": "Nombre del modelo",
"SETTINGS.AI.OLLAMA_MODEL_HINT": "Debe estar descargado en tu instancia de Ollama.",
"SETTINGS.AI.TEST_CONNECTION": "Probar conexión",
"SETTINGS.AI.LOCAL_URL_LABEL": "URL del servidor *",
"SETTINGS.AI.LOCAL_URL_HINT": "Compatible con llama.cpp, LM Studio, LocalAI, vLLM, Jan, etc.",
"SETTINGS.AI.LOCAL_MODEL_LABEL": "Nombre del modelo",
"SETTINGS.AI.LOCAL_MODEL_HINT": "El nombre exacto depende de tu servidor. Muchos aceptan cualquier cadena.",
"SETTINGS.AI.LOCAL_KEY_LABEL": "API key (si tu servidor la requiere)",
"SETTINGS.AI.SAVE_BTN": "Guardar configuración IA",
"SETTINGS.IMAGES.TITLE": "Generación de imágenes",
"SETTINGS.IMAGES.PROVIDER_LABEL": "Proveedor de imágenes",
"SETTINGS.IMAGES.PROVIDER_NONE": "Sin configurar",
"SETTINGS.IMAGES.PROVIDER_LOCAL": "Servidor local (LocalAI, ComfyUI...)",
"SETTINGS.IMAGES.OPENAI_KEY_LABEL": "API key de OpenAI",
"SETTINGS.IMAGES.OPENAI_KEY_HINT": "Distinta de la API key de Anthropic. Obtener en platform.openai.com.",
"SETTINGS.IMAGES.SIZE_LABEL": "Tamaño de imagen",
"SETTINGS.IMAGES.SIZE_1024": "1024×1024 (alta calidad, más lento)",
"SETTINGS.IMAGES.SIZE_512": "512×512 (rápido)",
"SETTINGS.IMAGES.LOCAL_URL_LABEL": "URL del servidor",
"SETTINGS.IMAGES.LOCAL_URL_HINT": "Servidor que implementa /v1/images/generations...",
"SETTINGS.IMAGES.LOCAL_MODEL_LABEL": "Modelo",
"SETTINGS.IMAGES.LOCAL_SIZE_LABEL": "Tamaño de imagen",
"SETTINGS.TRANSCRIPTION.TITLE": "Transcripción de audio",
"SETTINGS.TRANSCRIPTION.PROVIDER_LABEL": "Proveedor",
"SETTINGS.TRANSCRIPTION.PROVIDER_NONE": "Sin configurar",
"SETTINGS.TRANSCRIPTION.PROVIDER_OPENAI": "OpenAI Whisper",
"SETTINGS.TRANSCRIPTION.PROVIDER_GROQ": "Groq (rápido, tier gratuito)",
"SETTINGS.TRANSCRIPTION.PROVIDER_LOCAL": "Servidor local (whisper.cpp, etc.)",
"SETTINGS.TRANSCRIPTION.OPENAI_KEY_LABEL": "API key de OpenAI",
"SETTINGS.TRANSCRIPTION.OPENAI_KEY_HINT": "Distinta de la key de Anthropic. Obtener en platform.openai.com.",
"SETTINGS.TRANSCRIPTION.GROQ_KEY_LABEL": "API key de Groq",
"SETTINGS.TRANSCRIPTION.GROQ_KEY_HINT": "Obtener en console.groq.com · Tier gratuito disponible.",
"SETTINGS.TRANSCRIPTION.LOCAL_URL_LABEL": "URL del servidor",
"SETTINGS.TRANSCRIPTION.LOCAL_URL_HINT": "Servidor con endpoint /v1/audio/transcriptions...",
"SETTINGS.TRANSCRIPTION.LANG_LABEL": "Idioma por defecto (opcional)",
"SETTINGS.TRANSCRIPTION.LANG_AUTO": "Autodetección",
"SETTINGS.TRANSCRIPTION.LANG_ES": "Español",
"SETTINGS.TRANSCRIPTION.LANG_EN": "Inglés",
"SETTINGS.TRANSCRIPTION.LANG_FR": "Français",
"SETTINGS.TRANSCRIPTION.LANG_DE": "Deutsch",
"SETTINGS.TRANSCRIPTION.LANG_IT": "Italiano",
"SETTINGS.TRANSCRIPTION.LANG_PT": "Português",
"SETTINGS.TRANSCRIPTION.LANG_CA": "Català",
"SETTINGS.TRANSCRIPTION.LANG_GL": "Galego",
"SETTINGS.TRANSCRIPTION.LANG_EU": "Euskara",
"SETTINGS.APPEARANCE.THEME_LABEL": "Tema",
"SETTINGS.APPEARANCE.FONT_SIZE_LABEL": "Tamaño de letra de la interfaz",
"SETTINGS.APPEARANCE.FONT_SIZE_HINT": "No afecta al área de escritura.",
"CARD.NEW_TITLE": "Nueva tarjeta",
"CARD.EDIT_TITLE": "Editar tarjeta",
"CARD.TYPE_LABEL": "Tipo",
"CARD.TITLE_CHARACTER": "Nombre del personaje *",
"CARD.TITLE_OTHER": "Título",
"CARD.BODY_CHARACTER": "Descripción / notas del personaje",
"CARD.BODY_OTHER": "Contenido",
"CARD.PLACEHOLDER_CHARACTER_TITLE": "Elena Vidal",
"CARD.PLACEHOLDER_OTHER_TITLE": "Título de la tarjeta",
"CARD.PLACEHOLDER_CHARACTER_BODY": "Protagonista. 34 años. Detective privada...",
"CARD.PLACEHOLDER_OTHER_BODY": "Escribe aquí tus notas, ideas...",
"CARD.ALIASES_LABEL": "Nombres alternativos / apodos (separados por coma)",
"CARD.ALIASES_PLACEHOLDER": "Elena, Eli, Detective Vidal",
"CARD.ALIASES_HINT": "Se usarán todos en la búsqueda de apariciones.",
"CARD.APPEARANCES_LABEL": "Aparece en",
"CARD.SCANNING": "Escaneando...",
"CARD.SEARCH_APPEARANCES": "Buscar apariciones",
"CARD.APPEARANCES_HINT": "Resultados del último escaneo. Desmarca los capítulos donde el personaje no aparece realmente.",
"CARD.NO_DOCUMENTS": "El proyecto no tiene documentos todavía.",
"CARD.SEARCH_AUTO_HINT": "La búsqueda automática usa el nombre del personaje como palabra completa...",
"CARD.COLOR_LABEL": "Color",
"CARD.CREATE_BTN": "Crear tarjeta",
"CARD.TYPE_CHARACTER": "Personaje",
"CARD.TYPE_NOTE": "Nota",
"CARD.TYPE_RESEARCH": "Investigación",
"CARD.TYPE_OTHER": "Otro",
"IMAGE_GEN.PROMPT_LABEL": "Prompt de imagen",
"IMAGE_GEN.PROMPT_PLACEHOLDER": "Describe la imagen que quieres generar...",
"IMAGE_GEN.REMOVE_IMAGE": "Quitar imagen",
"EXPORT.STEP_FORMAT": "Elegir formato",
"EXPORT.STEP_SELECTOR": "Seleccionar documentos",
"EXPORT.STEP_METADATA": "Información del autor",
"EXPORT.SUCCESS_EPUB": "EPUB guardado correctamente.",
"EXPORT.SUCCESS_DOCX": "Documento Word guardado correctamente.",
"EXPORT.SUCCESS_PDF": "Manuscrito abierto. Pulsa \"Guardar como PDF / Imprimir\" en la ventana.",
"EXPORT.METADATA.LEGAL_NAME": "Nombre legal *",
"EXPORT.METADATA.PEN_NAME": "Nombre de pluma (si es distinto)",
"EXPORT.METADATA.EMAIL": "Email *",
"EXPORT.METADATA.PHONE": "Teléfono",
"EXPORT.METADATA.CITY_COUNTRY": "Ciudad, País",
"EXPORT.METADATA.AGENT": "Agente literario (si tienes representación)",
"EXPORT.METADATA.GENRE": "Género literario *",
"EXPORT.METADATA.COPYRIGHT_YEAR": "Año de copyright",
"EXPORT.METADATA.SYNOPSIS": "Sinopsis (para los metadatos del ebook)",
"EXPORT.METADATA.PH_LEGAL": "Tu nombre completo",
"EXPORT.METADATA.PH_PEN": "Nombre de autor publicado",
"EXPORT.METADATA.PH_EMAIL": "tu@email.com",
"EXPORT.METADATA.PH_PHONE": "+34 600 000 000",
"EXPORT.METADATA.PH_CITY": "Madrid, España",
"EXPORT.METADATA.PH_AGENT": "Nombre de la agencia / agente",
"EXPORT.METADATA.PH_GENRE": "Novela de aventuras, Thriller...",
"EXPORT.METADATA.PH_SYNOPSIS": "Breve descripción de la obra...",
"EXPORT.FORMAT.TITLE": "Formato de exportación",
"EXPORT.FORMAT.PDF_NAME": "PDF Manuscrito",
"EXPORT.FORMAT.PDF_DESC": "Standard Manuscript Format. Para enviar a agentes y editores.",
"EXPORT.FORMAT.EPUB_NAME": "EPUB",
"EXPORT.FORMAT.EPUB_DESC": "Para ereaders, Kindle y distribución digital.",
"EXPORT.FORMAT.DOCX_NAME": "Word (DOCX)",
"EXPORT.FORMAT.DOCX_DESC": "Compatible con Word y LibreOffice Writer.",
"EXPORT.FORMAT.PAGE_SIZE_LABEL": "Tamaño de página",
"EXPORT.FORMAT.PAGE_SIZE_HINT": "A4 es el estándar en España y Europa. Letter es el estándar en EE.UU. y Canadá.",
"EXPORT.SELECTOR.INSTRUCTION": "Selecciona los documentos a incluir en la exportación y ordénalos...",
"EXPORT.SELECTOR.SELECT_ALL": "Seleccionar todo",
"EXPORT.SELECTOR.DESELECT_ALL": "Deseleccionar todo",
"EXPORT.SELECTOR.WORD_COUNT": "palabras",
"EXPORT.SELECTOR.DOCS_SELECTED": "documentos seleccionados",
"AI.CLEAR_CONVERSATION": "Limpiar conversación",
"AI.HINT_SEND": "Enter envía · Shift+Enter nueva línea",
"COMMON.LOADING": "Cargando...",
"NARRATIVE.EMPTY_STATE": "El proyecto no tiene documentos todavía.",
"TRANSCRIPTION.AUDIO_LABEL": "Archivo de audio",
"TRANSCRIPTION.LANG_LABEL": "Idioma",
"TRANSCRIPTION.LANG_AUTO": "Autodetección",
"TRANSCRIPTION.LANG_CA": "Català",
"TRANSCRIPTION.LANG_GL": "Galego",
"TRANSCRIPTION.LANG_EU": "Euskara",
"TRANSCRIPTION.SUCCESS": "Transcripción completada y guardada en la carpeta \"Transcriptions\".",
"BOARDS.ERROR_LOAD": "Error al cargar los tableros",
"BOARDS.ERROR_DELETE": "Error al eliminar el tablero",
"BOARDS.ERROR_SAVE": "Error al guardar el tablero",
"TEMPLATES.BLANK_NAME": "Proyecto en blanco",
"TEMPLATES.BLANK_DESC": "Sin estructura. Empieza desde cero.",
"TEMPLATES.THREE_ACT_NAME": "Novela (3 actos)",
"TEMPLATES.THREE_ACT_DESC": "Estructura clásica en tres actos con capítulos.",
"TEMPLATES.PARTS_NAME": "Novela (partes y capítulos)",
"TEMPLATES.PARTS_DESC": "3 partes con 5 capítulos cada una.",
"TEMPLATES.SHORT_STORY_NAME": "Relato corto",
"TEMPLATES.SHORT_STORY_DESC": "Estructura mínima para un relato.",
"TEMPLATES.ESSAY_NAME": "Ensayo",
"TEMPLATES.ESSAY_DESC": "Introducción, cuerpo por secciones y conclusión.",
"TEMPLATES.CUSTOM_NAME": "Personalizado",
"TEMPLATES.CUSTOM_DESC": "Define tú mismo el número de partes y capítulos."
```

---

### Tarea 2: Modelos — `board.model.ts`

- **Fichero**: `src/app/core/models/board.model.ts` (modificar)
- **Qué hace**: Cambiar los valores hardcodeados de `CARD_TYPE_LABELS` por sus claves i18n. El tipo pasa de `Record<CardType, string>` a `Record<CardType, string>` pero los valores son ahora claves de traducción:
  ```
  character: 'CARD.TYPE_CHARACTER'
  note:      'CARD.TYPE_NOTE'
  research:  'CARD.TYPE_RESEARCH'
  other:     'CARD.TYPE_OTHER'
  ```
- **Depende de**: Tarea 1 (las claves deben existir en los JSON).
- **Riesgo**: `CARD_TYPE_LABELS` se usa en `card-editor-modal.component.ts` como `typeLabels` y se renderiza directamente en el HTML como `{{ typeLabels[type] }}`. Con el cambio, ese valor será una clave como `'CARD.TYPE_CHARACTER'`, que el HTML debe pasar por `| transloco`. Verificar todos los puntos de uso antes de cambiar el modelo.

---

### Tarea 3: Modelos — `consistency.model.ts`

- **Fichero**: `src/app/core/models/consistency.model.ts` (modificar)
- **Qué hace**: Cambiar valores hardcodeados de `ISSUE_TYPE_LABELS` y `ISSUE_SEVERITY_CONFIG` por claves i18n:
  - `ISSUE_TYPE_LABELS`: cada valor pasa a `'CONSISTENCY.TYPE_CHARACTER_DESCRIPTION'`, `'CONSISTENCY.TYPE_CHARACTER_NAME'`, etc.
  - `ISSUE_SEVERITY_CONFIG`: el campo `label` de cada entrada pasa a `'CONSISTENCY.SEVERITY_HIGH'`, `'CONSISTENCY.SEVERITY_MEDIUM'`, `'CONSISTENCY.SEVERITY_LOW'`.
- **Depende de**: Tarea 1.
- **Riesgo**: `ISSUE_TYPE_LABELS` y `ISSUE_SEVERITY_CONFIG` se usan en `consistency-modal.component.ts` como `typeLabels` y `severityConfig`. El HTML renderiza `{{ typeLabels[issue.type] }}` y `{{ severityConfig[issue.severity].label }}`, que deben pasar a usar `| transloco`.

---

### Tarea 4: Modelos — `project.model.ts`

- **Fichero**: `src/app/core/models/project.model.ts` (modificar)
- **Qué hace**: Cambiar los valores `label` de `DOCUMENT_STATUS_CONFIG` por claves i18n:
  ```
  todo:    { label: 'BINDER.STATUS_TODO',    color: '#6c7086' }
  draft:   { label: 'BINDER.STATUS_DRAFT',   color: '#89b4fa' }
  revised: { label: 'BINDER.STATUS_REVISED', color: '#f9e2af' }
  final:   { label: 'BINDER.STATUS_FINAL',   color: '#a6e3a1' }
  notes:   { label: 'BINDER.STATUS_NOTES',   color: '#cba6f7' }
  ```
- **Depende de**: Tarea 1.
- **Riesgo**: `DOCUMENT_STATUS_CONFIG` se usa en `binder.component.ts` para construir `statusEntries` (el array de filtros de estado). Actualmente `entry.label` es el texto español; con el cambio, será una clave que el HTML de `binder.component.html` debe pasar por `| transloco`. Verificar que el HTML ya usa `| transloco` o añadirlo.

---

### Tarea 5: Datos — `project-templates.ts`

- **Fichero**: `src/app/core/data/project-templates.ts` (modificar)
- **Qué hace**: Cambiar los campos `name` y `description` de cada plantilla por claves i18n:
  - `'blank'` → `name: 'TEMPLATES.BLANK_NAME'`, `description: 'TEMPLATES.BLANK_DESC'`
  - `'novel-3act'` → `name: 'TEMPLATES.THREE_ACT_NAME'`, `description: 'TEMPLATES.THREE_ACT_DESC'`
  - `'novel-parts'` → `name: 'TEMPLATES.PARTS_NAME'`, `description: 'TEMPLATES.PARTS_DESC'`
  - `'short-story'` → `name: 'TEMPLATES.SHORT_STORY_NAME'`, `description: 'TEMPLATES.SHORT_STORY_DESC'`
  - `'essay'` → `name: 'TEMPLATES.ESSAY_NAME'`, `description: 'TEMPLATES.ESSAY_DESC'`
  - `'custom'` → `name: 'TEMPLATES.CUSTOM_NAME'`, `description: 'TEMPLATES.CUSTOM_DESC'`
  - Los títulos de nodos del árbol (`'Acto I — El detonante'`, `'Capítulo 1'`, etc.) quedan sin modificar.
- **Depende de**: Tarea 1.
- **Riesgo**: Identificar todos los componentes que consumen `PROJECT_TEMPLATES` y renderizar `template.name` o `template.description`. Esos puntos necesitarán `| transloco`. Buscar con `grep -r PROJECT_TEMPLATES src/` antes de modificar.

---

### Tarea 6: Componente `desk-panel.component.html` + TypeScript

- **Fichero**: `src/app/features/editor/desk/desk-panel.component.html` (modificar)
- **Fichero**: `src/app/features/editor/desk/desk-panel.component.ts` (modificar)
- **Qué hace**:
  - HTML: sustituir los 5 textos hardcodeados de la toolbar (título, 3 títulos de botones de anclaje, cerrar) y el placeholder de la nota activa usando `| transloco`.
  - HTML: el bloque `@else` con "Selecciona o crea una nota" también se traduce.
  - TS: añadir `TranslocoPipe` al array `imports` del componente. El placeholder pasa por binding `[placeholder]="'DESK.PLACEHOLDER' | transloco"`.
- **Depende de**: Tarea 1.
- **Riesgo**: `desk-panel.component.ts` no importa actualmente `TranslocoPipe`. Hay que añadirlo al array `imports` del decorador `@Component`. El placeholder se pasa como `@Input` a `app-tiptap-editor`; verificar que el binding dinámico `[placeholder]="'DESK.PLACEHOLDER' | transloco"` funciona en contexto zoneless.

---

### Tarea 7: Componente `desk-binder.component.html` + TypeScript

- **Fichero**: `src/app/features/editor/desk/desk-binder.component.html` (modificar)
- **Fichero**: `src/app/features/editor/desk/desk-binder.component.ts` (modificar)
- **Qué hace**:
  - HTML: sustituir "Notas" (título del panel), `title="Nueva nota"`, el texto de empty state ("Sin notas todavía...") y `title="Eliminar nota"` por sus claves con `| transloco`.
  - TS: añadir `TranslocoPipe` al array `imports`.
- **Depende de**: Tarea 1.

---

### Tarea 8: Componente `binder.component.ts` — menú contextual

- **Fichero**: `src/app/features/editor/binder/binder.component.ts` (modificar)
- **Fichero**: `src/app/features/editor/binder/binder.component.html` (modificar)
- **Qué hace**:
  - TS: inyectar `TranslocoService` (de `@jsverse/transloco`). Convertir `contextActions` de `computed()` con strings hardcodeados a `computed()` que usa `this.translocoService.translate('BINDER.CTX_RENAME')`, etc. Los labels afectados son:
    - `'Renombrar'` → `'BINDER.CTX_RENAME'`
    - `'Estado'` → `'BINDER.CTX_STATUS'`
    - `'○  Sin estado'` → `'BINDER.CTX_STATUS_CLEAR'`
    - `'○  Por escribir'` → `'BINDER.CTX_STATUS_TODO'`
    - `'○  Borrador'` → `'BINDER.CTX_STATUS_DRAFT'`
    - `'○  En revisión'` → `'BINDER.CTX_STATUS_REVISED'`
    - `'●  Finalizado'` → `'BINDER.CTX_STATUS_FINAL'`
    - `'◇  Solo notas'` → `'BINDER.CTX_STATUS_NOTES'`
    - `'Nuevo documento aquí'` → `'BINDER.CTX_NEW_DOC_HERE'`
    - `'Nueva carpeta aquí'` → `'BINDER.CTX_NEW_FOLDER_HERE'`
    - `'Eliminar'` → `'BINDER.CTX_DELETE'`
  - HTML: los textos hardcodeados de los botones del header ("Nuevo documento", "Nueva carpeta", "Importar documento...") y el empty state ("Sin documentos todavía...") se sustituyen con `| transloco`. El `statusEntries` ya usa `entry.label`; con el cambio del modelo (Tarea 4), esos labels serán claves, así que en el HTML habrá que añadir `| transloco` al renderizado de `entry.label`.
- **Depende de**: Tareas 1, 4.
- **Riesgo**: `TranslocoService.translate()` es síncrono pero depende de que el idioma esté cargado. En el patrón zoneless con `computed()`, si el idioma cambia, el computed no se re-ejecuta automáticamente porque `TranslocoService` no expone una signal nativa. La solución canónica en este proyecto para menus contextuales en TS es usar `TranslocoService` directamente y asumir que el idioma ya está cargado en el momento de renderizar el menú. El computed se evalúa en el momento de la llamada, que siempre ocurre después de que Transloco haya cargado el idioma activo.

---

### Tarea 9: Componente `binder-footer.component.html`

- **Fichero**: `src/app/features/editor/binder/binder-footer.component.html` (modificar)
- **Fichero**: `src/app/features/editor/binder/binder-footer.component.ts` (modificar)
- **Qué hace**:
  - HTML: sustituir el texto "Objetivo de palabras para hoy" (línea 57 del HTML actual, dentro del popover) por `{{ 'BINDER.WORD_GOAL_LABEL' | transloco }}`.
  - TS: verificar si `TranslocoPipe` ya está en `imports`; si no, añadirlo.
- **Depende de**: Tarea 1.

---

### Tarea 10: Componente `find-replace-bar.component.html`

- **Fichero**: `src/app/features/editor/find-replace-bar/find-replace-bar.component.html` (modificar)
- **Qué hace**: Sustituir los textos hardcodeados:
  - `placeholder="Buscar..."` → `[placeholder]="'FIND_REPLACE.SEARCH_PLACEHOLDER' | transloco"`
  - `<span ...>Sin resultados</span>` → `{{ 'FIND_REPLACE.NO_RESULTS' | transloco }}`
  - `title="Distinguir mayúsculas"` → `[title]="'FIND_REPLACE.MATCH_CASE' | transloco"`
  - `placeholder="Reemplazar por..."` → `[placeholder]="'FIND_REPLACE.REPLACE_PLACEHOLDER' | transloco"`
  - El botón "Reemplazar" → `{{ 'FIND_REPLACE.REPLACE_BTN' | transloco }}`
- **Depende de**: Tarea 1.

---

### Tarea 11: Componente `snapshots-panel.component.html`

- **Fichero**: `src/app/features/editor/snapshots/snapshots-panel.component.html` (modificar)
- **Qué hace**: Sustituir:
  - `<span ...>Historial</span>` → `{{ 'SNAPSHOTS.TITLE' | transloco }}`
  - `placeholder="Etiqueta..."` → `[placeholder]="'SNAPSHOTS.LABEL_PLACEHOLDER' | transloco"`
  - El texto `{{ snapshot.label || 'Añadir etiqueta...' }}` del botón de label en modo lectura: el fallback hardcodeado pasa a usar un ternario Angular con `| transloco`. Ejemplo: `{{ snapshot.label || ('SNAPSHOTS.LABEL_PLACEHOLDER' | transloco) }}`
- **Depende de**: Tarea 1.

---

### Tarea 12: Componente `consistency-modal.component.html`

- **Fichero**: `src/app/features/editor/consistency/consistency-modal.component.html` (modificar)
- **Fichero**: `src/app/features/editor/consistency/consistency-modal.component.ts` (verificar)
- **Qué hace**:
  - HTML: sustituir todos los textos hardcodeados del modal:
    - `"Configura la API key..."` → `{{ 'CONSISTENCY.API_KEY_REQUIRED' | transloco }}`
    - `<strong ...>Cómo funciona:</strong>` → el `<strong>` envuelve `{{ 'CONSISTENCY.HOW_IT_WORKS' | transloco }}`
    - `<strong ...>Coste estimado:</strong>` → igual con `'CONSISTENCY.ESTIMATED_COST'`
    - `"Iniciar análisis"` → `{{ 'CONSISTENCY.START_ANALYSIS' | transloco }}`
    - `"Re-analizar"` → `{{ 'CONSISTENCY.RE_ANALYZE' | transloco }}`
    - `{{ severityConfig[issue.severity].label }}` → `{{ severityConfig[issue.severity].label | transloco }}`
    - `{{ typeLabels[issue.type] }}` → `{{ typeLabels[issue.type] | transloco }}`
  - TS: verificar que `TranslocoPipe` ya está en `imports`. Si no, añadirlo.
- **Depende de**: Tareas 1, 3 (para que `severityConfig.label` y `typeLabels` contengan claves en lugar de valores).

---

### Tarea 13: Componente `card-editor-modal.component.html`

- **Fichero**: `src/app/features/boards/modals/card-editor-modal.component.html` (modificar)
- **Qué hace**: Sustituir todos los textos hardcodeados:
  - Título del modal: `[title]="isNew() ? ('CARD.NEW_TITLE' | transloco) : ('CARD.EDIT_TITLE' | transloco)"`
  - `<label ...>Tipo</label>` → `{{ 'CARD.TYPE_LABEL' | transloco }}`
  - `{{ typeLabels[type] }}` → `{{ typeLabels[type] | transloco }}` (tras cambio en Tarea 2)
  - El label de título condicional: `{{ editType() === 'character' ? ('CARD.TITLE_CHARACTER' | transloco) : ('CARD.TITLE_OTHER' | transloco) }}`
  - Placeholders del título y cuerpo: binding `[placeholder]`
  - El label del cuerpo condicional: similar al de título
  - La sección de aliases: label con `| transloco`, placeholder con binding, hint con `| transloco`
  - La sección "Aparece en": label, botón "Buscar apariciones" / "Escaneando...", hints
  - `"El proyecto no tiene documentos todavía."` → `'CARD.NO_DOCUMENTS' | transloco`
  - `<label ...>Color</label>` → `'CARD.COLOR_LABEL' | transloco`
  - El botón crear: `{{ isNew() ? ('CARD.CREATE_BTN' | transloco) : ('COMMON.SAVE' | transloco) }}`
- **Depende de**: Tareas 1, 2.

---

### Tarea 14: Componente `image-generator-modal.component.html`

- **Fichero**: `src/app/features/boards/modals/image-generator-modal.component.html` (modificar)
- **Qué hace**: Sustituir:
  - `<label ...>Prompt de imagen</label>` → `{{ 'IMAGE_GEN.PROMPT_LABEL' | transloco }}`
  - `placeholder="Describe la imagen..."` → `[placeholder]="'IMAGE_GEN.PROMPT_PLACEHOLDER' | transloco"`
  - `"Quitar imagen"` → `{{ 'IMAGE_GEN.REMOVE_IMAGE' | transloco }}`
  - Los textos "Regenerar" y "Generar imagen" (botón condicional) → cada uno con `| transloco` usando claves nuevas. Nota: la spec no los lista explícitamente; se puede reutilizar las claves `'IMAGE_GEN.GENERATE'` e `'IMAGE_GEN.REGENERATE'` o usar claves `COMMON.*` si corresponde. **Punto de ambigüedad**: la spec no provee claves para "Generar imagen" / "Regenerar". El Implementer debe añadir estas dos claves adicionales a los JSON (Tarea 1) y usarlas aquí:
    - `IMAGE_GEN.GENERATE`: `"Generate image"` / `"Generar imagen"`
    - `IMAGE_GEN.REGENERATE`: `"Regenerate"` / `"Regenerar"`
  - `"Aplicar"` (botón Apply) → `'IMAGE_GEN.APPLY'` o `'COMMON.SAVE'`. Usar `'COMMON.SAVE'` ya que es semánticamente equivalente. Si no encaja, añadir `IMAGE_GEN.APPLY`.
- **Depende de**: Tarea 1.
- **Riesgo**: La spec no provee las claves para "Generar imagen", "Regenerar" y "Aplicar". El Implementer debe añadir 2-3 claves extra al JSON en esta misma tarea o como extensión de la Tarea 1.

---

### Tarea 15: Componente `ai-assistant-panel.component.html`

- **Fichero**: `src/app/features/editor/ai-assistant/ai-assistant-panel.component.html` (modificar)
- **Qué hace**: Sustituir:
  - `title="Limpiar conversación"` → `[title]="'AI.CLEAR_CONVERSATION' | transloco"`
  - `<span ...>Enter envía · Shift+Enter nueva línea</span>` → `{{ 'AI.HINT_SEND' | transloco }}`
- **Depende de**: Tarea 1.

---

### Tarea 16: Componente `narrative-layout.component.html`

- **Fichero**: `src/app/features/narrative/narrative-layout.component.html` (modificar)
- **Fichero**: `src/app/features/narrative/narrative-layout.component.ts` (verificar `TranslocoPipe` en imports)
- **Qué hace**: Sustituir:
  - `<span ...>Cargando...</span>` → `{{ 'COMMON.LOADING' | transloco }}`
  - `<p ...>El proyecto no tiene documentos todavía.</p>` → `{{ 'NARRATIVE.EMPTY_STATE' | transloco }}`
- **Depende de**: Tarea 1.

---

### Tarea 17: Componente `transcription-modal.component.html` y TS

- **Fichero**: `src/app/features/transcription/transcription-modal.component.html` (modificar)
- **Fichero**: `src/app/features/transcription/transcription-modal.component.ts` (modificar)
- **Qué hace**:
  - HTML: sustituir:
    - `<label ...>Archivo de audio</label>` → `{{ 'TRANSCRIPTION.AUDIO_LABEL' | transloco }}`
    - El label del idioma: `{{ 'TRANSCRIPTION.LANG_LABEL' | transloco }}`
    - Las `<option>` de idioma: `{{ 'TRANSCRIPTION.LANG_AUTO' | transloco }}`, `{{ 'TRANSCRIPTION.LANG_ES' | transloco }}`, etc. Nota: para las opciones con value='es', 'en', etc., los idiomas ya tienen sus claves en `es.json` vía `SETTINGS.TRANSCRIPTION.LANG_*`. Las claves nuevas `TRANSCRIPTION.LANG_*` son un alias; el Implementer puede reutilizar `SETTINGS.TRANSCRIPTION.LANG_*` si prefiere unificar, o usar las nuevas de la spec.
  - TS: sustituir el toast hardcodeado:
    ```
    this.toast.success(`Transcripción completada y guardada en la carpeta "Transcriptions".`);
    ```
    → inyectar `TranslocoService`, usar `this.translocoService.translate('TRANSCRIPTION.SUCCESS')`.
- **Depende de**: Tarea 1.

---

### Tarea 18: Componente `ink-settings-modal.component.html`

- **Fichero**: `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**: Sustituir todos los textos hardcodeados del modal de settings. Los grupos por sección:
  - **Sección General (editor)**: labels de Autoguardado, opciones de select, label de Snapshots, opciones, hint FIFO, label del corrector, botón "Guardar cambios", descripción backup, botón backup.
  - **Sección IA**: label "Proveedor de IA", "Anthropic API Key", "✓ API key configurada", "Modelo", URL de Ollama + hint, nombre del modelo Ollama + hint, botón "Probar conexión", "URL del servidor *" + hint OpenAI-compatible, nombre del modelo local + hint, API key servidor + label, sección imágenes (título, proveedor, opciones, API key OpenAI + hint, tamaño, URL servidor local + hint, modelo), sección transcripción (título, proveedor + opciones, API keys + hints, URL local + hint, idioma + opciones).
  - **Sección Apariencia**: label "Tema", label "Tamaño de letra de la interfaz" + hint.
- **Depende de**: Tarea 1.
- **Riesgo**: El fichero HTML de settings es el más largo de la spec. Hay strings que están dentro de atributos HTML (`placeholder`, `title`) y otros en contenido de texto. La sección de IA tiene texto mezclado con `<code>` inline (p.ej. `ollama list`); esos fragmentos de código NO se traducen, solo el texto que los rodea.

---

### Tarea 19: Componente `ink-settings-modal.component.ts`

- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (modificar)
- **Qué hace**: Traducir los strings hardcodeados en el TypeScript del componente:
  - El array `sections` tiene `label: 'Editor'`, `label: 'Asistente IA'`, `label: 'Apariencia'`. Estos labels son claves que el sidebar renderiza. No hay claves definidas en la spec para los nombres de sección del sidebar. **Punto de ambigüedad**: la spec no provee `SETTINGS.SECTION_EDITOR`, `SETTINGS.SECTION_AI`, `SETTINGS.SECTION_APPEARANCE`. El Implementer debe añadir estas 3 claves a los JSON (ambos idiomas) y usarlas.
  - El array `providers` tiene `label` y `description` hardcodeados en español. Añadir claves `SETTINGS.AI.PROVIDER_ANTHROPIC_LABEL`, `SETTINGS.AI.PROVIDER_ANTHROPIC_DESC`, `SETTINGS.AI.PROVIDER_OLLAMA_LABEL`, etc. a los JSON. **Punto de ambigüedad**: la spec no las lista. El Implementer debe añadir estas claves.
  - El array `fontScaleOptions` tiene labels en español (`'Pequeño'`, `'Normal'`, etc.). Añadir claves `SETTINGS.APPEARANCE.FONT_SM`, `SETTINGS.APPEARANCE.FONT_MD`, etc.
  - El array `themes` tiene labels en español. Añadir claves `SETTINGS.APPEARANCE.THEME_DARK`, `SETTINGS.APPEARANCE.THEME_LIGHT`.
  - Para inyectar `TranslocoService` en este componente y usar `translate()` en los arrays computados, o bien convertir los arrays a `computed()` que llamen a `translate()`.
- **Depende de**: Tareas 1, 18.
- **Riesgo**: Este componente es el más complejo de la spec en cuanto a TypeScript. Los arrays `sections`, `providers`, `fontScaleOptions`, `themes` son `readonly` definidos en el cuerpo de la clase, no en `computed()`. Para que reaccionen al cambio de idioma, deben convertirse a `computed()` que invocan `TranslocoService.translate()`. En un entorno zoneless, si el usuario cambia el idioma en runtime, estos `computed()` no se re-evaluarán a menos que dependan de una signal reactiva de Transloco. Sin embargo, el proyecto actualmente no parece tener cambio de idioma dinámico (la clave `NAV.TOGGLE_LANG` existe pero no se usa en ningún componente activo según la exploración). Simplificar: usar `TranslocoService` directamente en los arrays `readonly`, asumiendo que el idioma no cambia en runtime. Si en el futuro se implementa el cambio de idioma dinámico, estos arrays deberán convertirse a `computed()`.

---

### Tarea 20: Componente `boards-layout.component.ts`

- **Fichero**: `src/app/features/boards/boards-layout.component.ts` (modificar)
- **Qué hace**: Sustituir los 3 mensajes de error hardcodeados en los toasts:
  - `'Error al cargar los tableros'` → `this.translocoService.translate('BOARDS.ERROR_LOAD')`
  - `'Error al eliminar el tablero'` → `this.translocoService.translate('BOARDS.ERROR_DELETE')`
  - `'Error al guardar el tablero'` → `this.translocoService.translate('BOARDS.ERROR_SAVE')`
  - Inyectar `TranslocoService` de `@jsverse/transloco`.
- **Depende de**: Tarea 1.

---

### Tarea 21: Componente `export-modal.component.ts`

- **Fichero**: `src/app/features/export/export-modal.component.ts` (modificar)
- **Qué hace**:
  - Cambiar el array `steps` que tiene `label: 'Formato'`, `label: 'Documentos'`, `label: 'Metadatos'` a usar claves. No hay claves explícitas en la spec para estos labels cortos del stepper; el Implementer puede reutilizar `EXPORT.STEP_FORMAT`, `EXPORT.STEP_SELECTOR`, `EXPORT.STEP_METADATA` (versión abreviada) o añadir nuevas claves `EXPORT.STEP_LABEL_FORMAT`, etc.
  - Cambiar el `computed()` de `stepTitle`: actualmente concatena `'Exportar — ' + titles[step]`. Sustituir las 3 cadenas internas por `translate()` y añadir una clave `EXPORT.TITLE_PREFIX` o incluir el prefijo "Exportar — " como parte de cada clave de título de paso.
  - Cambiar los 3 mensajes de toast de éxito:
    - `'EPUB guardado correctamente.'` → `translate('EXPORT.SUCCESS_EPUB')`
    - `'Documento Word guardado correctamente.'` → `translate('EXPORT.SUCCESS_DOCX')`
    - `'Manuscrito abierto...'` → `translate('EXPORT.SUCCESS_PDF')`
  - Inyectar `TranslocoService`.
- **Depende de**: Tarea 1.
- **Riesgo**: El `stepTitle` es un `computed()` que depende de `currentStep()`. Al usar `TranslocoService` dentro del `computed()`, si el idioma cambia en runtime el `computed()` no se re-evaluará automáticamente. Dado que el cambio de idioma dinámico no está activo en el proyecto, usar `translate()` directamente dentro del `computed()` es suficiente.

---

### Tarea 22: Componentes de export — pasos HTML

- **Fichero**: `src/app/features/export/steps/step-format.component.html` (modificar)
- **Fichero**: `src/app/features/export/steps/step-format.component.ts` (modificar)
- **Fichero**: `src/app/features/export/steps/step-document-selector.component.html` (modificar)
- **Fichero**: `src/app/features/export/steps/step-document-selector.component.ts` (modificar)
- **Fichero**: `src/app/features/export/steps/step-metadata.component.html` (modificar)
- **Fichero**: `src/app/features/export/steps/step-metadata.component.ts` (modificar)
- **Qué hace**:
  - `step-format.component.html`: título de sección "Formato de exportación", nombres de formatos (PDF Manuscrito, EPUB, Word DOCX) y sus descripciones, label "Tamaño de página", hint sobre A4/Letter.
  - `step-format.component.ts`: añadir `TranslocoPipe` a imports.
  - `step-document-selector.component.html`: instrucción inicial, "Seleccionar todo", "Deseleccionar todo", el sufijo "palabras" y "documentos seleccionados".
  - `step-document-selector.component.ts`: añadir `TranslocoPipe` a imports.
  - `step-metadata.component.html`: todos los labels (Nombre legal, Email, Teléfono, Ciudad País, Agente, Género, Año copyright, Sinopsis) y sus placeholders.
  - `step-metadata.component.ts`: añadir `TranslocoPipe` a imports.
- **Depende de**: Tarea 1.

---

### Tarea 23: Verificación de compilación

- **Fichero**: ninguno (verificación)
- **Qué hace**: Ejecutar `pnpm run build` (o `ng build`) para confirmar que no hay errores de compilación TypeScript. Si hay errores, corregirlos antes de dar la tarea por completada.
- **Depende de**: Todas las tareas anteriores.
- **Riesgo**: Los errores más probables son: (a) uso de `| transloco` en un componente que no importa `TranslocoPipe`, (b) referencias a `TranslocoService` sin inyectar, (c) claves JSON con error sintáctico (coma trailing o dobles comas).

---

## Orden de ejecución

1. Tarea 1 — JSON: añadir claves a `en.json` y `es.json`
2. Tarea 2 — Modelo `board.model.ts`
3. Tarea 3 — Modelo `consistency.model.ts`
4. Tarea 4 — Modelo `project.model.ts`
5. Tarea 5 — Datos `project-templates.ts`
6. Tarea 6 — `desk-panel.component` (HTML + TS)
7. Tarea 7 — `desk-binder.component` (HTML + TS)
8. Tarea 8 — `binder.component` menú contextual (HTML + TS)
9. Tarea 9 — `binder-footer.component.html`
10. Tarea 10 — `find-replace-bar.component.html`
11. Tarea 11 — `snapshots-panel.component.html`
12. Tarea 12 — `consistency-modal.component.html`
13. Tarea 13 — `card-editor-modal.component.html`
14. Tarea 14 — `image-generator-modal.component.html`
15. Tarea 15 — `ai-assistant-panel.component.html`
16. Tarea 16 — `narrative-layout.component.html`
17. Tarea 17 — `transcription-modal.component` (HTML + TS)
18. Tarea 18 — `ink-settings-modal.component.html`
19. Tarea 19 — `ink-settings-modal.component.ts`
20. Tarea 20 — `boards-layout.component.ts`
21. Tarea 21 — `export-modal.component.ts`
22. Tarea 22 — pasos de export (3 HTML + 3 TS)
23. Tarea 23 — verificación de compilación

---

## Puntos de atención para el Implementer

### Restricciones explícitas (de la sección "Scope excluido")
- NO traducir strings internos de lógica: IDs de comandos, `'status:draft'`, `'rename'`, `'add-document'`, etc.
- NO traducir textos de archivos o rutas del sistema.
- NO traducir strings en comentarios de código.
- NO traducir los títulos de nodos del árbol en templates (`'Acto I — El detonante'`, `'Capítulo 1'`, `'Planteamiento'`, etc.).
- NO añadir nuevos idiomas.

### Ambigüedades a resolver antes de empezar
1. **`image-generator-modal`**: la spec no provee claves para "Generar imagen", "Regenerar" y "Aplicar". El Implementer debe añadir `IMAGE_GEN.GENERATE`, `IMAGE_GEN.REGENERATE` e `IMAGE_GEN.APPLY` a ambos JSON y usarlas en la Tarea 14.
2. **`ink-settings-modal.component.ts`**: los arrays `sections`, `providers`, `fontScaleOptions`, `themes` tienen labels/descripciones en español no cubiertos por la spec. El Implementer debe añadir las claves necesarias (p.ej. `SETTINGS.SECTION_EDITOR`, `SETTINGS.AI.PROVIDER_ANTHROPIC_LABEL`, `SETTINGS.APPEARANCE.FONT_SM`, etc.) a ambos JSON en la Tarea 1 y usarlas en la Tarea 19.
3. **`export-modal`**: el prefijo "Exportar — " del `stepTitle` no tiene clave. Opciones: incluir el prefijo como parte del valor de las claves de título de paso (p.ej. `EXPORT.STEP_TITLE_FORMAT: "Export — Choose format"`), o añadir una clave `EXPORT.TITLE_PREFIX: "Export"`.

### Convenciones y gotchas del proyecto
- **Todos los componentes son standalone**. Para usar `| transloco` en un HTML, el `.ts` correspondiente debe tener `TranslocoPipe` en el array `imports` del decorador `@Component`.
- **Zoneless**: no usar `NgZone`. Los `computed()` reactivos a señales funcionan bien; `TranslocoService.translate()` es síncrono y no depende de zone.
- **`TranslocoService`** se inyecta con `inject(TranslocoService)`. No usar el decorador `@Inject`.
- **Bindings dinámicos en atributos**: usar `[placeholder]="'CLAVE' | transloco"` y `[title]="'CLAVE' | transloco"` en lugar de `placeholder="{{ 'CLAVE' | transloco }}"`. La segunda forma puede causar parpadeo en ciertos contextos.
- **Modelos con labels convertidos a claves**: después de las Tareas 2, 3 y 4, los valores de `CARD_TYPE_LABELS`, `ISSUE_TYPE_LABELS`, `ISSUE_SEVERITY_CONFIG.label` y `DOCUMENT_STATUS_CONFIG.label` serán claves i18n, no textos visibles. Cualquier componente que los renderice directamente (`{{ value }}`) debe añadir `| transloco`.
- **`CARD_TYPE_LABELS` en `card-editor-modal`**: el HTML actual tiene `{{ typeLabels[type] }}` donde `typeLabels = CARD_TYPE_LABELS`. Tras la Tarea 2, debe ser `{{ typeLabels[type] | transloco }}`.
- **`statusEntries` en `binder.component.ts`**: la propiedad `statusEntries` se construye en el body de la clase (no es `computed()`). Después de la Tarea 4, `entry.label` es una clave i18n. El HTML debe usar `{{ entry.label | transloco }}`.
- **JSON válido**: después de añadir las claves nuevas, verificar que el JSON cierra correctamente. La última clave del objeto raíz NO lleva coma. Usar un linter JSON si hay duda.
- **`project-templates.ts`**: buscar todos los consumidores de `PROJECT_TEMPLATES` con `grep -r PROJECT_TEMPLATES src/` antes de modificar el fichero, para identificar los puntos de renderizado que necesitarán `| transloco`.
