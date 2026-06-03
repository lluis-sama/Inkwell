# INK-26 — Limpieza técnica: i18n, templates inline y Tailwind → @apply

## Objetivo

Resolver tres deudas técnicas acumuladas durante las specs anteriores:
1. Completar la internacionalización (Transloco) con selector de idioma visible y traducir los ~56 textos hardcodeados que se escaparon.
2. Mover templates y estilos inline a ficheros `.html` / `.css` separados (convención del proyecto que algunos componentes violan).
3. Eliminar clases Tailwind densas de los HTML migrando a clases semánticas con `@apply` en los ficheros CSS.

---

## Scope

**Incluido:**
- Selector de idioma (ES / EN) en `ink-nav.component`
- Pipe `transloco` en todos los textos hardcodeados detectados
- Claves nuevas en `en.json` y `es.json` para los textos que faltan
- Ficheros `.html` y `.css` separados para todos los componentes que hoy los tienen inline
- Clases semánticas con `@apply` para los patrones repetidos de Tailwind (form inputs, botones icono, cards, etc.)

**Excluido:**
- Añadir nuevos idiomas (solo ES / EN)
- Traducir el contenido de los documentos del usuario
- Refactorizar la lógica de negocio de ningún componente

---

## Parte 1 — Selector de idioma

### Ubicación
Añadir en `ink-nav.component.html` un toggle ES / EN junto al resto de controles de la barra de navegación.

### Comportamiento
- Al hacer clic cambia el idioma activo de Transloco y persiste en `localStorage` (clave `inkwell_lang`).
- Refleja el idioma activo visualmente (el código activo aparece resaltado).
- Usa el `TranslocoService` ya configurado en el proyecto; no requiere nuevas dependencias.

### Implementación en `ink-nav.component.ts`
```typescript
// Inyectar TranslocoService (ya disponible)
readonly #transloco = inject(TranslocoService);
readonly activeLang = signal(this.#transloco.getActiveLang());

toggleLang(): void {
  const next = this.activeLang() === 'es' ? 'en' : 'es';
  this.#transloco.setActiveLang(next);
  this.activeLang.set(next);
  localStorage.setItem('inkwell_lang', next);
}
```

### HTML del toggle (dentro de `ink-nav.component.html`)
```html
<button class="lang-toggle" (click)="toggleLang()" [title]="'NAV.TOGGLE_LANG' | transloco">
  <span [class.lang-active]="activeLang() === 'es'">ES</span>
  <span class="lang-sep">/</span>
  <span [class.lang-active]="activeLang() === 'en'">EN</span>
</button>
```

---

## Parte 2 — Textos hardcodeados → Transloco

### Grupos de claves nuevas necesarias

#### TOOLBAR (editor-toolbar.component.html)
Todos los atributos `title` de los botones de formato:

```json
"TOOLBAR": {
  "HEADING": "Encabezado",
  "BOLD": "Negrita (Ctrl+B)",
  "ITALIC": "Cursiva (Ctrl+I)",
  "STRIKE": "Tachado",
  "CODE_INLINE": "Código inline",
  "BULLET_LIST": "Lista con viñetas",
  "ORDERED_LIST": "Lista numerada",
  "BLOCKQUOTE": "Cita",
  "CODE_BLOCK": "Bloque de código",
  "HR": "Separador horizontal",
  "UNDO": "Deshacer (Ctrl+Z)",
  "REDO": "Rehacer (Ctrl+Y)",
  "FONT_FAMILY": "Familia tipográfica",
  "FONT_DECREASE": "Reducir tamaño",
  "FONT_INCREASE": "Aumentar tamaño"
}
```

#### NAV (ink-nav.component.html)
```json
"NAV": {
  "CLOSE_PROJECT": "Cerrar proyecto y volver al inicio",
  "NARRATIVE_VIEW": "Vista narrativa (Alt+3)",
  "TIMELINE_VIEW": "Timeline (Alt+4)",
  "STATS": "Estadísticas",
  "TRANSCRIBE": "Transcribir audio",
  "CONSISTENCY": "Análisis de inconsistencias",
  "SHORTCUTS": "Atajos de teclado (?)",
  "SETTINGS": "Configuración",
  "TOGGLE_LANG": "Cambiar idioma"
}
```

#### TOP BAR (editor-top-bar.component.html)
```json
"TOP_BAR": {
  "TOGGLE_BINDER": "Mostrar/ocultar binder",
  "SNAPSHOT": "Crear snapshot",
  "SNAPSHOTS_HISTORY": "Historial de versiones",
  "AI_ASSISTANT": "Asistente IA",
  "FIND_REPLACE": "Buscar y reemplazar",
  "EXPORT": "Exportar",
  "TYPEWRITER": "Modo máquina de escribir",
  "FOCUS": "Modo focus"
}
```

#### EDITOR (editor-layout.component.html)
```json
"EDITOR": {
  "EMPTY_STATE": "Selecciona o crea un documento en el binder",
  "EXIT_FOCUS": "Salir del modo focus (Ctrl+Shift+F)",
  "OPEN_AI": "Abrir asistente IA (Ctrl+Shift+A)"
}
```

#### COMMON (botones comunes en modales)
```json
"COMMON": {
  "CANCEL": "Cancelar",
  "SAVE": "Guardar",
  "PREVIOUS": "Anterior",
  "NEXT": "Siguiente",
  "RESTORE": "Restaurar",
  "DELETE": "Eliminar",
  "EDIT_LABEL": "Editar etiqueta",
  "ALL": "Todos"
}
```

#### MODALES (títulos)
```json
"MODAL": {
  "CONSISTENCY": "Análisis de inconsistencias",
  "STATS": "Estadísticas de escritura",
  "TRANSCRIPTION": "Transcribir audio",
  "IMAGE_GENERATOR": "Generar imagen",
  "SETTINGS": "Configuración",
  "SHORTCUTS": "Atajos de teclado"
}
```

### Regla de aplicación
- Atributos `title`: `[title]="'TOOLBAR.BOLD' | transloco"`
- Texto visible: `{{ 'COMMON.CANCEL' | transloco }}`
- Placeholders: `[placeholder]="'EDITOR.EMPTY_STATE' | transloco"`

Las claves en inglés (`en.json`) deben tener los equivalentes en inglés.

---

## Parte 3 — Templates y CSS inline → ficheros separados

### Componentes afectados

| Componente | Problema | Acción |
|---|---|---|
| `binder-footer.component.ts` | `template:` inline | Crear `binder-footer.component.html` |
| `export-modal.component.ts` | `template:` inline | Crear `export-modal.component.html` |
| `steps/step-metadata.component.ts` | `template:` + `styles:` inline | Crear `.html` + `.css` |
| `steps/step-document-selector.component.ts` | `template:` inline | Crear `.html` |
| `steps/step-format.component.ts` | `template:` inline | Crear `.html` |
| `shared/shortcuts-modal.component.ts` | `template:` inline | Crear `.html` |
| `app.component.ts` | `styles:` inline | Mover a `app.component.css` |
| `card-editor-modal.component.ts` | `styles:` inline | Mover a `card-editor-modal.component.css` |
| `ink-nav.component.ts` | `styles:` inline | Mover a `ink-nav.component.css` |
| `author-profile-modal.component.ts` | `styles:` inline | Mover a `author-profile-modal.component.css` |
| `editor-toolbar.component.ts` | `styles:` inline | Mover a `editor-toolbar.component.css` |
| `tiptap-editor.component.ts` | `styles:` inline | Mover a `tiptap-editor.component.css` |
| `board-card.component.ts` | `styles:` inline | Mover a `board-card.component.css` |

### Procedimiento por componente
1. Extraer el contenido del `template:` a un nuevo fichero `.html`.
2. Reemplazar `template: \`...\`` por `templateUrl: './nombre.component.html'`.
3. Extraer el contenido de `styles: [...]` a un nuevo fichero `.css`.
4. Reemplazar `styles: [...]` por `styleUrls: ['./nombre.component.css']`.
5. Verificar que la app compila sin errores.

---

## Parte 4 — Tailwind inline → clases semánticas con @apply

### Clases globales en `src/styles.css`

Añadir al final de `styles.css` un bloque `/* === Utility classes === */` con los patrones que se repiten en múltiples componentes:

```css
/* === Utility classes === */

.form-input {
  @apply w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
         text-ink-text text-sm placeholder:text-ink-muted
         focus:outline-none focus:border-ink-accent transition-colors;
}

.form-textarea {
  @apply w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
         text-ink-text text-sm leading-relaxed
         placeholder:text-ink-muted resize-none
         focus:outline-none focus:border-ink-accent transition-colors;
}

.btn-icon {
  @apply w-6 h-6 flex items-center justify-center rounded
         hover:bg-ink-overlay text-ink-subtle hover:text-ink-text transition-colors;
}

.card-surface {
  @apply flex flex-col overflow-hidden rounded-lg border border-ink-border
         bg-ink-surface transition-all cursor-pointer hover:border-ink-accent;
}
```

### Clases locales en ficheros CSS de componente

Cada componente que tiene patrones propios no globales añade sus clases en su `.css`:

#### `desk-panel.component.css`
```css
.panel-action-btn {
  @apply w-6 h-6 flex items-center justify-center rounded
         hover:bg-ink-overlay text-ink-subtle hover:text-ink-text transition-colors;
}
```

#### `board-card.component.css`
```css
.card-action-btn {
  @apply absolute w-5 h-5 rounded flex items-center justify-center
         opacity-0 hover:opacity-100 hover:bg-black/20 transition-all;
}
```

#### `binder-node.component.css`
```css
.node-item {
  @apply group relative flex items-center gap-1.5 px-2 py-1.5
         rounded cursor-pointer select-none transition-colors text-sm;
}

.node-input {
  @apply flex-1 bg-ink-bg border border-ink-border rounded
         px-1 py-0 text-ink-text text-sm focus:outline-none w-full;
}
```

### Archivos HTML prioritarios a refactorizar (aplicar clases semánticas)

Prioridad 1 — mayor ROI:
- `desk-panel.component.html` — sustituir 4 bloques de 10 clases por `.panel-action-btn`
- `new-project-modal.component.html` — sustituir inputs/textareas por `.form-input` / `.form-textarea`
- `ink-settings-modal.component.html` — ídem
- `board-card.component.html` — sustituir botones de acción por `.card-action-btn`
- `binder-node.component.html` — sustituir nodo y input por `.node-item` / `.node-input`

Prioridad 2 — resto de archivos con 6+ clases por elemento:
- `narrative-card.component.html`
- `snapshots-panel.component.html`
- `binder.component.html`
- `ai-assistant-panel.component.html`
- `editor-layout.component.html`
- `project-manager.component.html`

---

## Criterios de aceptación

- [ ] El selector ES / EN es visible y funcional en la barra de navegación principal.
- [ ] El idioma seleccionado persiste al recargar la aplicación.
- [ ] Todos los textos listados en la Parte 2 pasan por el pipe transloco.
- [ ] `en.json` y `es.json` contienen todas las claves nuevas con sus traducciones correctas.
- [ ] Ningún componente tiene `template:` inline; todos usan `templateUrl:`.
- [ ] Ningún componente tiene `styles:` inline; todos usan `styleUrls:`.
- [ ] Los patrones globales (`.form-input`, `.form-textarea`, `.btn-icon`, `.card-surface`) están definidos en `styles.css` con `@apply`.
- [ ] Los archivos HTML de prioridad 1 no contienen elementos con más de 5 clases Tailwind inline.
- [ ] La app compila sin errores (`ng build` limpio).
- [ ] No hay regresiones visuales en las vistas principales (editor, binder, boards, timeline).
