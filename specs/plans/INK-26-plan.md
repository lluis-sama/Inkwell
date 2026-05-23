# Plan de implementación — INK-26

## Resumen

Esta spec resuelve tres deudas técnicas acumuladas: (1) completar la internacionalización con un selector de idioma en la barra de navegación y traducir ~56 textos hardcodeados, (2) extraer todos los templates y estilos inline a ficheros `.html` / `.css` separados en los 13 componentes que los tienen, y (3) reducir la densidad de clases Tailwind en los HTMLs de mayor ROI creando clases semánticas con `@apply`. El orden de ejecución garantiza que las clases globales existan antes de que los HTMLs las usen.

---

## Advertencia previa: inconsistencia en la clave localStorage

La spec menciona la clave `inkwell_lang` (guion bajo), pero el código existente en `app.config.ts` y `project-manager.component.ts` usa `inkwell-lang` (guion). El Implementer debe usar `inkwell-lang` en toda la spec para mantener coherencia con la persistencia ya existente y no romper el comportamiento actual.

---

## Tareas

### Tarea 1: Utility classes globales en styles.css
- **Fichero**: `src/styles.css` (modificar)
- **Qué hace**: Añadir al final del fichero un bloque `/* === Utility classes === */` con cuatro clases semánticas globales: `.form-input`, `.form-textarea`, `.btn-icon`, `.card-surface`. Cada clase usa `@apply` con las clases Tailwind especificadas en la spec. No modificar nada de lo existente en el fichero.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: El proyecto usa Tailwind v4 (`@import "tailwindcss"` con `@theme`). Verificar que `@apply` funciona con esa versión. Si Tailwind v4 no soporta `@apply` de la misma forma que v3, escalar al orquestador antes de continuar.

---

### Tarea 2: Clases locales en desk-panel.component.css
- **Fichero**: `src/app/features/editor/desk/desk-panel.component.css` (modificar — ya existe)
- **Qué hace**: Añadir al final del fichero la clase `.panel-action-btn` con `@apply` para los botones icono del panel. El fichero ya está referenciado via `styleUrl` en el componente.
- **Depende de**: Tarea 1 (para coherencia conceptual; técnicamente independiente)

---

### Tarea 3: Clases locales en board-card.component.css y binder-node.component.css
- **Ficheros**:
  - `src/app/features/boards/canvas/board-card.component.css` (crear — no existe)
  - `src/app/features/editor/binder/binder-node.component.css` (crear — no existe)
- **Qué hace**:
  - `board-card.component.css`: Crear fichero con la clase `.card-action-btn` usando `@apply`.
  - `binder-node.component.css`: Crear fichero con las clases `.node-item` y `.node-input` usando `@apply`.
  - En ambos `.ts` respectivos, cambiar el array `styles: [...]` existente (o añadir) la propiedad `styleUrl: './nombre.component.css'` en el decorador `@Component`. Verificar que el `.ts` de `board-card` tiene `styles:` inline (confirmado por el Explorer) y eliminarlo al añadir `styleUrl`.
- **Depende de**: Tarea 1

---

### Tarea 4: Extraer styles inline — grupo A (componentes sin CSS existente)
Componentes con `styles:` inline que no tienen fichero CSS separado y cuyo `styleUrls/styleUrl` no existe.

- **Ficheros a crear**:
  - `src/app/features/boards/modals/card-editor-modal.component.css`
  - `src/app/shared/components/ink-nav.component.css`
  - `src/app/shared/components/author-profile-modal.component.css`
  - `src/app/features/editor/tiptap/editor-toolbar.component.css`
  - `src/app/features/editor/tiptap/tiptap-editor.component.css`
- **Ficheros a modificar**:
  - Los `.ts` correspondientes: en cada uno, mover el contenido del bloque `styles: [...]` al nuevo fichero CSS y reemplazar la propiedad `styles:` por `styleUrl: './nombre.component.css'`
- **Qué hace**: Extracción pura de CSS. Cero cambios en la lógica ni en el HTML. El contenido CSS que hoy está inline se traslada literalmente al nuevo fichero.
- **Depende de**: ninguna dependencia previa (es extracción mecánica)
- **Riesgo**: `app.component.css` ya existe y `app.component.ts` ya tiene `styleUrls` — no tocar en esta tarea. El Explorer reporta `app.component.ts` como pendiente, pero el fichero CSS ya existe; revisar si `styles:` está en el `.ts` además del `styleUrls`. Si ya usa `styleUrls` y el CSS está en el fichero, esta tarea no aplica para `app.component`.

---

### Tarea 5: Extraer templates inline — binder-footer y shortcuts-modal
- **Fichero a crear**:
  - `src/app/features/editor/binder/binder-footer.component.html`
  - `src/app/shared/components/shortcuts-modal.component.html`
- **Ficheros a modificar**:
  - `src/app/features/editor/binder/binder-footer.component.ts`: mover el contenido de `template: \`...\`` al nuevo `.html` y cambiar a `templateUrl: './binder-footer.component.html'`
  - `src/app/shared/components/shortcuts-modal.component.ts`: ídem
- **Qué hace**: Extracción mecánica del template. Sin cambios funcionales ni de estilos.
- **Depende de**: ninguna dependencia previa

---

### Tarea 6: Extraer templates inline — módulo export (4 componentes)
- **Ficheros a crear**:
  - `src/app/features/export/export-modal.component.html`
  - `src/app/features/export/steps/step-metadata.component.html`
  - `src/app/features/export/steps/step-metadata.component.css`
  - `src/app/features/export/steps/step-document-selector.component.html`
  - `src/app/features/export/steps/step-format.component.html`
- **Ficheros a modificar**:
  - `src/app/features/export/export-modal.component.ts`: extraer template a `.html`, reemplazar `template:` por `templateUrl:`
  - `src/app/features/export/steps/step-metadata.component.ts`: extraer template a `.html` y styles a `.css`, reemplazar ambas propiedades inline
  - `src/app/features/export/steps/step-document-selector.component.ts`: extraer template a `.html`, reemplazar `template:` por `templateUrl:`
  - `src/app/features/export/steps/step-format.component.ts`: extraer template a `.html`, reemplazar `template:` por `templateUrl:`
- **Qué hace**: Extracción mecánica de los 4 componentes del flujo de exportación. Sin cambios en lógica.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: Son componentes con estado y props. Asegurarse de que los backticks de los template literals se copian correctamente (especialmente interpolaciones `{{ }}` y bindings `[()]`). Compilar tras esta tarea antes de continuar.

---

### Tarea 7: Añadir claves i18n a en.json y es.json
- **Ficheros**: `src/assets/i18n/en.json` y `src/assets/i18n/es.json` (modificar)
- **Qué hace**: Añadir al final de cada JSON las nuevas claves necesarias para esta spec. Grupos a añadir:
  - `TOOLBAR.*` — 15 claves (títulos de botones del editor)
  - `NAV.*` — 9 claves (botones de ink-nav)
  - `TOP_BAR.*` — 8 claves (botones de editor-top-bar)
  - `EDITOR.EMPTY_STATE`, `EDITOR.EXIT_FOCUS`, `EDITOR.OPEN_AI` — 3 claves nuevas (las otras claves `EDITOR.*` ya existen)
  - `COMMON.*` — 8 claves (Cancel, Save, Previous, Next, Restore, Delete, Edit label, All)
  - `MODAL.CONSISTENCY`, `MODAL.STATS`, `MODAL.TRANSCRIPTION`, `MODAL.IMAGE_GENERATOR`, `MODAL.SETTINGS`, `MODAL.SHORTCUTS` — 6 claves nuevas (las otras claves `MODAL.*` para new-project-modal ya existen)
  - Los valores en `en.json` van en inglés (ver spec). Los valores en `es.json` van en español (ver spec).
- **Depende de**: ninguna dependencia previa
- **Riesgo**: El JSON es flat (sin objetos anidados, todas las claves son strings `"GRUPO.CLAVE": "valor"`). Mantener ese formato exacto. No usar objetos `{ "TOOLBAR": { ... } }`. Verificar que las claves `MODAL.*` nuevas no colisionan con las existentes (`MODAL.TITLE`, `MODAL.CANCEL`, etc., que pertenecen al modal de nuevo proyecto). Las 6 claves nuevas de `MODAL.*` tienen nombres distintos y no colisionan.

---

### Tarea 8: Selector de idioma en ink-nav
- **Ficheros a modificar**:
  - `src/app/shared/components/ink-nav.component.ts`
  - `src/app/shared/components/ink-nav.component.html`
- **Qué hace**:
  - En el `.ts`: inyectar `TranslocoService` (ya importado como pipe; hay que importar también el servicio), añadir el signal `activeLang` inicializado con `this.#transloco.getActiveLang()`, y añadir el método `toggleLang()` que alterna entre `'es'` y `'en'`, llama a `this.#transloco.setActiveLang(next)`, actualiza el signal y persiste en `localStorage.setItem('inkwell-lang', next)`.
  - En el `.html`: añadir el botón del toggle justo antes del botón de toggle de tema (que está al final del nav). El botón debe mostrar `ES` y `EN` con el idioma activo visualmente diferenciado (clase CSS que lo resalte). Usar `[title]="'NAV.TOGGLE_LANG' | transloco"`.
  - En `ink-nav.component.css` (creado en Tarea 4): añadir los estilos para `.lang-toggle`, `.lang-sep` y `.lang-active`.
- **Depende de**: Tarea 4 (el CSS ya existe), Tarea 7 (la clave `NAV.TOGGLE_LANG` ya existe en los JSON)
- **Riesgo**: La clave localStorage es `inkwell-lang` (con guion), no `inkwell_lang`. El `.ts` actual no inyecta el servicio, solo importa el pipe. Añadir `import { TranslocoService } from '@jsverse/transloco'` al bloque de imports del fichero.

---

### Tarea 9: Aplicar pipe transloco en ink-nav.component.html
- **Fichero**: `src/app/shared/components/ink-nav.component.html` (modificar)
- **Qué hace**: Reemplazar los 6 atributos `title` hardcodeados por sus equivalentes con el pipe transloco. Los textos hardcodeados actuales son:
  - `title="Cerrar proyecto y volver al inicio"` → `[title]="'NAV.CLOSE_PROJECT' | transloco"`
  - `title="Vista narrativa (Alt+3)"` → `[title]="'NAV.NARRATIVE_VIEW' | transloco"`
  - `title="Estadísticas"` → `[title]="'NAV.STATS' | transloco"`
  - `title="Transcribir audio"` → `[title]="'NAV.TRANSCRIBE' | transloco"`
  - `title="Análisis de inconsistencias"` → `[title]="'NAV.CONSISTENCY' | transloco"`
  - `title="Atajos de teclado (?)"` → `[title]="'NAV.SHORTCUTS' | transloco"`
  - `title="Configuración"` → `[title]="'NAV.SETTINGS' | transloco"`
- **Depende de**: Tarea 7 (claves NAV.* en los JSON), Tarea 8 (el fichero HTML está limpio tras añadir el toggle)
- **Riesgo**: El template `ink-nav.component.html` ya usa `TranslocoPipe` para algunas claves (ej. `BOARDS.NAV.EDITOR_TITLE`). No hace falta añadir imports.

---

### Tarea 10: Aplicar pipe transloco en editor-toolbar.component.html
- **Fichero**: `src/app/features/editor/tiptap/editor-toolbar.component.html` (modificar)
- **Qué hace**: Reemplazar los 15 atributos `title` hardcodeados de los botones de formato (bold, italic, etc.) por sus equivalentes `[title]="'TOOLBAR.BOLD' | transloco"`, etc. Consultar las claves `TOOLBAR.*` añadidas en la Tarea 7.
- **Depende de**: Tarea 7
- **Riesgo**: Verificar que `editor-toolbar.component.ts` importa `TranslocoPipe`. Si no lo importa, añadirlo.

---

### Tarea 11: Aplicar pipe transloco en editor-top-bar.component.html
- **Fichero**: `src/app/features/editor/tiptap/editor-top-bar.component.html` (modificar — ya tiene templateUrl)
- **Qué hace**: Reemplazar los 8 atributos `title` hardcodeados (toggle binder, snapshot, historial, asistente IA, buscar, exportar, typewriter, focus) por `[title]="'TOP_BAR.X' | transloco"`. Consultar claves `TOP_BAR.*` de la Tarea 7.
- **Depende de**: Tarea 7
- **Riesgo**: Verificar que `editor-top-bar.component.ts` importa `TranslocoPipe`. Si no, añadirlo.

---

### Tarea 12: Aplicar pipe transloco en editor-layout.component.html y modales
- **Ficheros a modificar**:
  - `src/app/features/editor/editor-layout.component.html` — textos de empty state y focus mode
  - Plantillas de modales con título hardcodeado: los ficheros HTML de `consistency-modal`, `transcription-modal`, `image-generator-modal`, `stats-modal`, `ink-settings-modal`, y el recién creado `shortcuts-modal.component.html`
- **Qué hace**:
  - En `editor-layout.component.html`: sustituir el texto del estado vacío por `'EDITOR.EMPTY_STATE' | transloco`, el texto de salir del focus mode por `'EDITOR.EXIT_FOCUS' | transloco`, y el botón de IA por `'EDITOR.OPEN_AI' | transloco`.
  - En cada modal: sustituir el título hardcodeado por `'MODAL.X' | transloco` con la clave correspondiente.
- **Depende de**: Tarea 7, Tarea 5 (shortcuts-modal.component.html existe)

---

### Tarea 13: Aplicar pipe transloco — botones comunes en modales
- **Ficheros a modificar**: Todos los templates de modales que contienen botones de acción con texto hardcodeado (Cancelar, Guardar, Anterior, Siguiente, Restaurar, Eliminar, etc.). Revisar especialmente los componentes de exportación (export-modal, step-metadata, step-format, step-document-selector) y snapshots-panel.
- **Qué hace**: Sustituir los textos visibles hardcodeados en botones por `{{ 'COMMON.CANCEL' | transloco }}`, `{{ 'COMMON.SAVE' | transloco }}`, etc. Las claves `COMMON.*` fueron añadidas en la Tarea 7.
- **Depende de**: Tarea 6 (los HTMLs de export existen), Tarea 7

---

### Tarea 14: @apply en desk-panel.component.html (prioridad 1)
- **Fichero**: `src/app/features/editor/desk/desk-panel.component.html` (modificar)
- **Qué hace**: Sustituir los 4 botones icono con ~10 clases Tailwind cada uno por la clase `.panel-action-btn` definida en la Tarea 2. Eliminar las clases Tailwind redundantes de esos elementos.
- **Depende de**: Tarea 2

---

### Tarea 15: @apply en new-project-modal.component.html e ink-settings-modal.component.html (prioridad 1)
- **Ficheros a modificar**:
  - `src/app/features/project-manager/new-project-modal.component.html`
  - `src/app/shared/components/ink-settings-modal.component.html`
- **Qué hace**: Sustituir todos los inputs con 12-14 clases Tailwind por la clase `.form-input` y los textareas por `.form-textarea`. Mantener solo las clases que no estén cubiertas por las utility classes globales (p.ej. clases de layout específicas).
- **Depende de**: Tarea 1

---

### Tarea 16: @apply en board-card.component.html y binder-node.component.html (prioridad 1)
- **Ficheros a modificar**:
  - `src/app/features/boards/canvas/board-card.component.html`
  - `src/app/features/editor/binder/binder-node.component.html`
- **Qué hace**:
  - En `board-card.component.html`: sustituir los botones de acción de la tarjeta por la clase `.card-action-btn` definida en la Tarea 3.
  - En `binder-node.component.html`: sustituir los nodos e inputs por `.node-item` y `.node-input` definidos en la Tarea 3.
- **Depende de**: Tarea 3

---

### Tarea 17: @apply en HTMLs de prioridad 2
- **Ficheros a modificar** (si los elementos tienen más de 5 clases inline):
  - `src/app/features/editor/narrative/narrative-card.component.html`
  - `src/app/features/editor/desk/snapshots-panel.component.html`
  - `src/app/features/editor/binder/binder.component.html`
  - `src/app/features/editor/ai/ai-assistant-panel.component.html`
  - `src/app/features/editor/editor-layout.component.html`
  - `src/app/features/project-manager/project-manager.component.html`
- **Qué hace**: Para cada fichero, identificar elementos con 6 o más clases Tailwind inline y extraerlos a clases semánticas locales en el CSS del componente con `@apply`. Crear el fichero `.css` del componente si no existe y referenciarlo via `styleUrl`. Usar nombres de clase que describan el rol del elemento (no su apariencia).
- **Depende de**: Tarea 1 (para poder usar las utility classes globales)
- **Riesgo**: Esta tarea es la más abierta en scope. El Implementer debe hacer una pasada fichero por fichero y decidir qué patrones merecen una clase semántica. Si un elemento tiene 6 clases pero son todas únicas y no se repiten, puede dejarse inline. Priorizar los que se repiten dentro del mismo template.

---

## Orden de ejecución

1. Tarea 1 — Utility classes globales en `styles.css`
2. Tarea 2 — Clase local `.panel-action-btn` en `desk-panel.component.css`
3. Tarea 3 — Clases locales en `board-card.component.css` y `binder-node.component.css`
4. Tarea 4 — Extraer styles inline (grupo A: 5 componentes)
5. Tarea 5 — Extraer templates inline (binder-footer, shortcuts-modal)
6. Tarea 6 — Extraer templates inline (módulo export, 4 componentes) — compilar tras esta tarea
7. Tarea 7 — Añadir claves i18n a `en.json` y `es.json`
8. Tarea 8 — Selector de idioma en `ink-nav` (.ts + .html + .css)
9. Tarea 9 — Pipe transloco en `ink-nav.component.html`
10. Tarea 10 — Pipe transloco en `editor-toolbar.component.html`
11. Tarea 11 — Pipe transloco en `editor-top-bar.component.html`
12. Tarea 12 — Pipe transloco en `editor-layout` y títulos de modales
13. Tarea 13 — Pipe transloco en botones comunes de modales
14. Tarea 14 — @apply en `desk-panel.component.html`
15. Tarea 15 — @apply en `new-project-modal` e `ink-settings-modal`
16. Tarea 16 — @apply en `board-card` y `binder-node`
17. Tarea 17 — @apply en HTMLs de prioridad 2

---

## Puntos de atención para el Implementer

### Sobre Tailwind v4 y @apply
El proyecto usa Tailwind v4 (`@import "tailwindcss"` con bloque `@theme`), no v3. En Tailwind v4 `@apply` sigue funcionando pero dentro de ficheros CSS procesados por el pipeline de Tailwind. Si el compilador de Angular no procesa el `styles.css` con Tailwind, las clases de `@apply` no se generarán. Verificar que la Tarea 1 produce CSS válido ejecutando `ng build` antes de continuar con las tareas que dependen de esas clases.

### Sobre localStorage — clave consistente
La clave para persistir el idioma es `inkwell-lang` (con guion), ya establecida en `app.config.ts` y `project-manager.component.ts`. No usar `inkwell_lang` (con guion bajo) aunque aparezca en la spec. Cambiarla rompería la persistencia del selector del project-manager.

### Sobre los JSON i18n — formato flat
Los ficheros `en.json` y `es.json` usan un formato completamente flat: `"GRUPO.CLAVE": "valor"`. No usar objetos anidados. Revisar la estructura actual antes de añadir.

### Sobre claves MODAL.* existentes
Las claves `MODAL.TITLE`, `MODAL.NAME_LABEL`, `MODAL.CANCEL`, etc. ya existen y corresponden al modal de nuevo proyecto (`new-project-modal`). Las 6 claves nuevas (`MODAL.CONSISTENCY`, `MODAL.STATS`, `MODAL.TRANSCRIPTION`, `MODAL.IMAGE_GENERATOR`, `MODAL.SETTINGS`, `MODAL.SHORTCUTS`) tienen nombres distintos y no colisionan.

### Sobre claves EDITOR.* existentes
Las claves `EDITOR.SELECT_DOCUMENT`, `EDITOR.FOCUS_MODE_EXIT`, etc. ya existen con valores similares a las nuevas. Revisar que las claves nuevas (`EDITOR.EMPTY_STATE`, `EDITOR.EXIT_FOCUS`, `EDITOR.OPEN_AI`) no dupliquen semánticamente claves ya existentes antes de añadirlas. Si ya existe una clave equivalente, usar la existente en el HTML en lugar de añadir la nueva.

### Sobre app.component.ts
El fichero `app.component.ts` tiene `styles: [...]` inline pero `app.component.css` ya existe como fichero vacío (o con contenido). Verificar el estado real del fichero antes de la Tarea 4: si ya usa `styleUrl: './app.component.css'` además de `styles:`, solo hay que eliminar el bloque `styles:` inline y mover su contenido al CSS. Si solo tiene `styles:` sin `styleUrl`, añadir la referencia.

### Sobre la extracción de templates — no alterar bindings
En la Tarea 6 (export), los templates tienen interpolaciones `{{ }}`, event bindings `(evento)`, property bindings `[prop]` y two-way bindings `[(ngModel)]`. Copiarlos exactamente como están en el template literal, sin modificar ningún binding.

### Convención de decorador: styleUrl vs styleUrls
Usar exclusivamente `styleUrl: './nombre.component.css'` (singular) en todo el proyecto — tanto en los nuevos ficheros CSS que se creen como al revisar los existentes durante las tareas de extracción. Si un componente usa `styleUrls: [...]` (array) sin necesitar múltiples hojas, actualizarlo a `styleUrl` (singular) en la misma tarea.

### Tarea 17 — umbral de legibilidad
Aplicar `@apply` a cualquier elemento con 5 o más clases Tailwind inline. El objetivo es que ningún elemento del template tenga más de 4 clases Tailwind inline tras el refactoring. Esto aplica a todos los archivos de prioridad 1 y 2.
