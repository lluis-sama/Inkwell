# INK-33 — Testing unitario completo del frontend Angular

## Objetivo

Alcanzar una cobertura de testing unitario sólida en toda la lógica de negocio del frontend Angular. El proyecto carece de tests operativos (solo existía un `ai.service.spec.ts` en sintaxis Jasmine sin runner). Se parte de cero con Vitest como runner, aprovechando el builder experimental `@angular/build:unit-test` de Angular 20.

La estrategia prioriza:
1. **Servicios con lógica de negocio** sobre componentes UI triviales.
2. **Funciones puras** sobre tests que requieren `TestBed` + mocks.
3. **Mocks de `TauriBridgeService`** únicos como punto de contacto con el backend Rust.

---

## Scope

**Incluido:**
- Setup de infraestructura Vitest + limpieza de Jasmine/Karma.
- Tests unitarios para todos los servicios con lógica de negocio significativa.
- Tests para utilidades puras (`tiptap-to-text.ts`, funciones del árbol, etc.).
- Tests para servicios de passthrough simple donde el coste es bajo.

**Excluido:**
- Tests de componentes UI puros (botones, modales simples, layouts) — mejor cubiertos por E2E o visual regression.
- Tests de componentes con lógica compleja de DOM (editor TipTap, canvas de boards) — fase separada si se decide.
- Tests del backend Rust (`src-tauri/`) — fuera del scope del frontend.

---

## Parte 0: Infraestructura Vitest (YA IMPLEMENTADA)

| Cambio | Fichero | Estado |
|---|---|---|
| Instalar Vitest + jsdom | `package.json` | ✅ |
| Desinstalar Jasmine/Karma | `package.json` | ✅ |
| Configurar `types: ["vitest/globals"]` | `tsconfig.spec.json` | ✅ |
| Añadir target `test` en `angular.json` | `angular.json` | ✅ |
| Scripts `test` / `test:ci` | `package.json` | ✅ |
| Eliminar spec Jasmine obsoleto | `ai.service.spec.ts` (antiguo) | ✅ |

**Notas críticas del setup:**
- El builder `@angular/build:unit-test` requiere `buildTarget` obligatoriamente.
- A pesar de ser zoneless, `TestBed` necesita `provideZonelessChangeDetection()` en providers.
- `jsdom` es obligatorio como peer dependency para el entorno DOM de Vitest.

**Patrón de mock estándar para `TauriBridgeService`:**
```typescript
const mockBridge = {
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn().mockResolvedValue(undefined),
  folderExists: vi.fn().mockResolvedValue(true),
  createFolder: vi.fn().mockResolvedValue(undefined),
  readAppConfig: vi.fn(),
  writeAppConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as TauriBridgeService;
```

---

## Parte 1: Servicios core (YA IMPLEMENTADOS — 27 tests)

### `ai.service.spec.ts` (6 tests)
- `loadSession()` restaura mensajes cuando `projectId` coincide.
- `loadSession()` no lanza cuando el fichero no existe.
- `loadSession()` ignora sesión cuyo `projectId` es distinto.
- `clearSession()` vacía messages y resetea modo.
- `clearSession()` persiste sesión vacía en disco.
- `closeProject()` limpia `AiService` al cerrar proyecto.

### `project.service.spec.ts` (13 tests)
**Bloque A — funciones puras del árbol (9 tests, sin TestBed):**
- `insertNode` en raíz.
- `insertNode` en carpeta anidada.
- `insertNode` lanza al insertar en documento.
- `deleteNode` en nivel 0.
- `deleteNode` en profundidad 2 sin afectar hermanos.
- `findNode` encuentra nodo existente.
- `findNode` devuelve `null` si no existe.
- `isDescendant` true para nodo dentro de ancestro.
- `isDescendant` false para nodo hermano o raíz.

**Bloque B — ProjectService señales (4 tests, con TestBed):**
- `isLoaded()` false al inicio.
- `isLoaded()` true tras `openProject`.
- `totalWordCount()` suma correctamente.
- `closeProject()` limpia señales.

### `app-config.service.spec.ts` (8 tests)
- `load()` con JSON válido parsea y setea `config()`.
- `load()` con string vacío usa defaults y persiste.
- `load()` con error de I/O no lanza, usa defaults.
- `setApiKey()` actualiza signal.
- `setApiKey()` llama `writeAppConfig` con JSON que contiene la key.
- `addRecentProject()` añade proyecto nuevo al frente.
- `addRecentProject()` deduplica por `basePath`.
- `addLtDisabledRule()` deduplica `ruleId`.

---

## Parte 2: Servicios de valor alto y bajo coste (Fase 1)

### `tiptap-to-text.ts` — utilidad pura (~5-6 tests)
**Tipo:** Funciones puras, sin TestBed, sin mocks.

- `extractText()` extrae texto plano de nodos TipTap simples.
- `extractText()` maneja nodos anidados recursivamente.
- `extractText()` ignora nodos sin texto.
- `tiptapToText()` con documento vacío devuelve string vacío.
- `tiptapToText()` concatena múltiples párrafos con saltos de línea.

### `search.service.ts` — búsqueda y regex (~8-10 tests)
**Tipo:** Mixto — funciones puras + señales con TestBed.

**Funciones puras (sin TestBed):**
- `escapeRegExp()` escapa caracteres especiales correctamente.
- `findMatches()` encuentra matches simples en texto plano.
- `findMatches()` encuentra matches con regex escapado.
- `findMatches()` respeta límite de resultados.
- `extractContext()` retorna fragmento alrededor del match.

**Con TestBed:**
- `searchResults()` señal se actualiza tras llamar a `search()`.
- `isSearching()` señal refleja estado de búsqueda activa.

### `board.service.ts` — operaciones de tarjetas (~6-8 tests)
**Tipo:** Mixto — funciones puras + señales con TestBed.

**Funciones puras (sin TestBed):**
- `addCard()` añade tarjeta al array sin mutar original.
- `updateCard()` modifica campos de tarjeta existente.
- `deleteCard()` elimina tarjeta por id.
- `moveCard()` actualiza coordenadas x/y.

**Con TestBed:**
- `loadBoard()` parsea JSON y setea señales.
- `saveBoard()` serializa y llama `writeJsonFile`.
- `currentBoard()` señal refleja estado tras operaciones.

### `document.service.ts` — snapshots y word count (~8-10 tests)
**Tipo:** Señales con TestBed + mocks.

- `createSnapshot()` genera snapshot con id único y timestamp.
- `createSnapshot()` respeta límite `maxSnapshots` (elimina el más antiguo).
- `restoreSnapshot()` reemplaza contenido actual por snapshot.
- `deleteSnapshot()` elimina snapshot por id.
- `countWords()` cuenta palabras en texto plano correctamente.
- `countWords()` con texto vacío devuelve 0.
- `currentDocument()` señal se actualiza tras `loadDocument()`.
- `snapshots()` señal se actualiza tras `createSnapshot()`.

---

## Parte 3: Servicios de valor medio (Fase 2)

### `stats.service.ts` — streaks y métricas (~8-10 tests)
**Tipo:** Mixto — funciones puras extraíbles + señales con TestBed.

**Funciones puras (a extraer si no lo están):**
- `calculateStreak()` cuenta días consecutivos con escritura.
- `calculateStreak()` rompe streak si hay gap > 1 día.
- `deltaWords()` calcula diferencia respecto a día anterior.
- `trimHistory()` descarta entradas > 365 días.

**Con TestBed:**
- `dailyWordCount()` señal se actualiza tras `recordWords()`.
- `currentStreak()` señal refleja streak calculado.
- `loadStats()` parsea JSON y setea señales.
- `saveStats()` serializa y persiste.

### `import.service.ts` — parsing de formatos (~10-12 tests)
**Tipo:** Funciones puras + mocks de bridge.

- `importTxt()` extrae texto plano de buffer.
- `importMd()` preserva estructura de markdown como TipTap JSON.
- `importDocx()` extrae párrafos de documento DOCX.
- `importOdt()` extrae contenido de ODT (vía conversión).
- `titleFromPath()` extrae nombre de fichero sin extensión.
- `sanitizeTitle()` limpia caracteres inválidos.
- `importFile()` detecta extensión y delega al parser correcto.
- `importFile()` devuelve warning si formato no soportado.

### `character-scan.service.ts` — escaneo de personajes (~5-6 tests)
**Tipo:** Funciones puras.

- `buildPattern()` construye regex de palabra completa desde aliases.
- `buildPattern()` escapa caracteres especiales en aliases.
- `scanDocument()` encuentra menciones de personaje en texto.
- `scanDocument()` no cuenta substrings parciales.
- `scanProject()` agrega resultados de múltiples documentos.

### `toast.service.ts` — notificaciones (~3-4 tests)
**Tipo:** Señales con TestBed.

- `show()` añade toast al array con id único.
- `dismiss()` elimina toast por id.
- `toasts()` señal refleja array actual.
- Auto-dismiss elimina toast tras timeout.

---

## Parte 4: Servicios complejos (Fase 3)

### `export.service.ts` — generación de documentos (~15-20 tests)
**Tipo:** Funciones puras (la mayoría) + mocks de bridge.

**HTML / Manuscrito:**
- `buildManuscriptHtml()` genera HTML estructurado desde árbol.
- `buildChapterHtml()` aplica template de capítulo.
- `buildTitlePage()` incluye metadatos del proyecto.

**DOCX:**
- `buildDocxDocument()` genera documento válido desde árbol.
- `nodeToDocx()` convierte nodo TipTap a párrafo DOCX.
- `inlineToRuns()` convierte formato inline (bold, italic) a runs.

**EPUB:**
- `buildEpub()` genera EPUB con estructura OPF/NCX.
- `buildEpubChapter()` convierte contenido a XHTML.

**Con mocks:**
- `exportProject()` llama `writeBinaryFile` con datos correctos.
- `exportProject()` con formato inválido lanza error.

### `tiptap-languagetool.ts` — extensión TipTap (~15-20 tests)
**Tipo:** Funciones puras + mocks de estado ProseMirror.

**Funciones puras:**
- `debounce()` retrasa ejecución correctamente.
- `moreThan500Words()` detecta umbral de palabras.
- `changedDescendants()` recorre nodos modificados.
- `gimmeDecoration()` genera decoración ProseMirror válida.

**Con mocks:**
- Plugin reacciona a cambios de documento.
- Tooltip se posiciona correctamente sobre errores.
- Debounce evita llamadas excesivas a LT.

### `transcription.service.ts` — API Whisper (~10-12 tests)
**Tipo:** Mixto — funciones puras + mocks de `fetch`/bridge.

**Funciones puras:**
- `buildHeaderText()` genera cabecera con timestamp.
- `buildTipTapContent()` convierte transcripción a JSON TipTap.
- `mimeType()` detecta tipo MIME desde extensión.

**Con mocks:**
- `transcribe()` llama API Whisper con parámetros correctos.
- `transcribe()` maneja error de red.
- `isConfigured()` devuelve true solo con API key.
- `providerStatusMessage()` refleja estado de configuración.

### `image.service.ts` — API DALL-E (~8-10 tests)
**Tipo:** Mixto — funciones puras + mocks.

**Funciones puras:**
- `buildAutoPrompt()` genera prompt desde contexto del proyecto.
- `isConfigured()` devuelve true/false según provider.

**Con mocks:**
- `generateImage()` llama API con parámetros correctos.
- `generateImage()` maneja error de API.
- `saveImage()` persiste en carpeta del proyecto.

### `consistency.service.ts` — IA multi-fase (~6-8 tests)
**Tipo:** Señales con TestBed + mock de `AiService`.

- `flattenDocumentIds()` extrae ids de documentos desde árbol.
- `analyzeProject()` coordina fases de extracción y detección.
- `extractFacts()` parsea respuesta de IA en hechos estructurados.
- `detectInconsistencies()` compara hechos y reporta conflictos.
- `loadCharactersFromBoards()` lee tarjetas de tipo "personaje".

### `narrative.service.ts` — agregación narrativa (~6-8 tests)
**Tipo:** Señales con TestBed.

- `flattenTree()` aplana árbol en array lineal.
- `buildNarrativeCards()` crea tarjetas desde documentos + word counts.
- `buildNarrativeCards()` incluye boards vinculados.
- `currentNarrative()` señal se actualiza tras cambios en proyecto.

### `language-tool.service.ts` — máquina de estados LT (~8-10 tests)
**Tipo:** Señales con TestBed + mocks de bridge.

- `resolvedLanguage()` computa idioma fallback correctamente.
- `install()` transita de `not-installed` → `installing` → `ready`.
- `install()` maneja error de instalación.
- `checkText()` lanza error si servidor no está listo.
- `checkText()` parsea respuesta XML de LT en sugerencias.
- `startServer()` inicia servidor local vía Tauri.

---

## Parte 5: Servicios de passthrough / bajo valor (Fase 4)

Implementar solo si el coste es marginal o si se detecta regresión.

| Servicio | Tests estimados | Justificación |
|---|---|---|
| `theme.service.ts` | 2-3 | Side-effects DOM (setAttribute). Mínimo valor unitario. |
| `backup.service.ts` | 3-4 | Orquestación ZIP con JSZip. Principalmente I/O. |
| `update.service.ts` | 3 | Passthrough a TauriBridge con signal. Trivial. |
| `desk.service.ts` | 2 | Event bus con `Subject`. Casi sin lógica. |
| `settings.service.ts` | 6-8 | Passthrough + clamping a `AppConfigService`. Bajo valor si `AppConfigService` ya está testeado. |

---

## Tests

### Criterios de aceptación globales

- [ ] `pnpm test --watch=false` ejecuta sin errores de infraestructura.
- [ ] Todos los tests usan mocks de `TauriBridgeService`; ninguno accede a disco ni red real.
- [ ] Todos los tests de funciones puras se ejecutan sin `TestBed`.
- [ ] Todos los tests con `TestBed` incluyen `provideZonelessChangeDetection()`.
- [ ] Ningún test importa `jasmine` ni usa sintaxis Jasmine (`spyOn`, `done()`, etc.).
- [ ] Coverage de servicios con lógica de negocio: 100% de los ficheros listados en Partes 1-4.

### Métricas objetivo por fase

| Fase | Servicios | Tests estimados | Acumulado |
|---|---|---:|---:|
| Parte 1 (core) | 3 | 27 | **27** ✅ |
| Fase 1 (alto valor, bajo coste) | 4 | 28-35 | ~55-62 |
| Fase 2 (valor medio) | 4 | 26-32 | ~81-94 |
| Fase 3 (complejos) | 7 | 66-88 | ~147-182 |
| Fase 4 (bajo valor) | 5 | 14-17 | ~161-199 |

---

## Dependencias

- `vitest@^3.1.1` (devDependency)
- `jsdom@^29` (devDependency, peer del builder experimental)
- `@angular/build` con soporte para `unit-test` builder (ya presente en v20.3.25)

---

## Orden de implementación sugerido

1. **Parte 0** — Infraestructura (ya completada).
2. **Parte 1** — Servicios core (ya completada: AiService, ProjectService, AppConfigService).
3. **Fase 1** — Servicios fáciles y de alto valor:
   - `tiptap-to-text.ts`
   - `search.service.ts`
   - `board.service.ts`
   - `document.service.ts`
4. **Fase 2** — Servicios de valor medio:
   - `stats.service.ts`
   - `import.service.ts`
   - `character-scan.service.ts`
   - `toast.service.ts`
5. **Fase 3** — Servicios complejos (por orden de impacto):
   - `export.service.ts`
   - `transcription.service.ts`
   - `image.service.ts`
   - `consistency.service.ts`
   - `narrative.service.ts`
   - `language-tool.service.ts`
   - `tiptap-languagetool.ts`
6. **Fase 4** — Servicios de bajo valor (opcional, bajo demanda).

---

## Spec anterior

INK-32 (Linux metadata)
