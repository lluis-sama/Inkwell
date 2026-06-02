# Plan de implementación — INK-33 (Testing unitario Angular)

## Resumen

Este plan adapta la spec INK-33 a la realidad del código actual. La Parte 0 (infraestructura) y Parte 1 (3 servicios core) ya están completadas. Este documento guía la implementación de las fases restantes, corrigiendo inconsistencias entre la spec original y el código real: servicios que la spec asumía con señales pero son stateless, métodos privados que no pueden testearse directamente, y servicios adicionales no listados en la spec.

---

## Resumen de ajustes a la spec

### 1. Servicios stateless (sin señales)
La spec asumía señales en varios servicios. En realidad son **stateless** — devuelven valores directamente o Promises. Se testean con mocks de bridge, **sin TestBed cuando sea posible**, o con TestBed mínimo para inyectar mocks.

| Servicio | Asumido por spec | Realidad | Adaptación |
|---|---|---|---|
| `board.service.ts` | `currentBoard()` señal | Stateless, devuelve `BoardFile` | Testear métodos puras + async con mocks |
| `document.service.ts` | `currentDocument()`, `snapshots()` señales | Stateless, devuelve `DocumentFile` | Testear métodos puras + async con mocks |
| `search.service.ts` | `searchResults()`, `isSearching()` señales | Stateless, `search()` devuelve `Promise<SearchResult[]>` | Testear `search()` y privados vía comportamiento público |
| `stats.service.ts` | `dailyWordCount()`, `currentStreak()` señales | Async, `currentStreak()` devuelve `Promise<number>` | Testear métodos async directamente |
| `narrative.service.ts` | `currentNarrative()` señal | Async, `buildNarrativeCards()` devuelve `Promise<NarrativeCard[]>` | Testear `buildNarrativeCards()` con mocks |

### 2. Métodos privados
La spec listaba métodos privados como si fueran públicos. En el código real son `private`. Se testean **indirectamente** vía los métodos públicos que los invocan.

| Servicio | Métodos privados | Cómo testearlos |
|---|---|---|
| `character-scan.service.ts` | `buildPattern()` | Vía `scanCharacter()` con diferentes nombres/aliases |
| `import.service.ts` | `importTxt`, `importMarkdown`, `importDocx`, `importOdt`, `titleFromPath`, `basename` | Vía `importFile()` con distintas extensiones y paths |
| `transcription.service.ts` | `buildHeaderText`, `buildTipTapContent`, `mimeType`, `getOrCreateTranscriptionsFolder` | Vía `transcribe()` y `saveTranscriptionToProject()` |
| `export.service.ts` | `buildChapterHtml`, `buildDocxDocument`, `nodeToDocx`, `inlineToRuns`, `exportEpub`, `exportDocx`, `exportManuscriptPdf` | Vía `buildManuscriptHtml()` (público) para HTML; `export()` con mocks para el resto |
| `consistency.service.ts` | `flattenDocumentIds`, `extractFacts`, `loadCharacterList`, `detectInconsistencies`, `callAiOnce` | Vía `analyze()` y `loadSavedReport()` |
| `narrative.service.ts` | `flattenTree()` | Vía `buildNarrativeCards()` — verificar orden de resultados |

### 3. Servicios adicionales no en spec original

| Servicio/Utilidad | Qué es | Acción |
|---|---|---|
| `project-paths.ts` | Funciones puras de rutas | Añadir a Fase A (sin fricción) |
| `insertAfter`, `insertInside` en `project.service.ts` | Funciones puras exportadas | Añadir tests en Bloque A de `project.service.spec.ts` |
| `tiptap-languagetool.ts` | Extensión TipTap/ProseMirror compleja | Fase G (muy compleja), solo funciones puras exportadas |

---

## Fases de implementación

### Fase A: Funciones puras sin fricción

**Objetivo**: Cobertura rápida de utilidades puras. Sin TestBed, sin mocks.

#### A.1 — `tiptap-to-text.ts`
- **Fichero**: `src/app/shared/utils/tiptap-to-text.ts`
- **Tipo**: Funciones puras, sin TestBed
- **Mocks**: Ninguno
- **Tests**:
  1. `tiptapToText()` con documento vacío devuelve string vacío.
  2. `tiptapToText()` extrae texto plano de un párrafo simple.
  3. `tiptapToText()` maneja nodos anidados (texto dentro de bold/italic).
  4. `tiptapToText()` concatena múltiples párrafos con saltos de línea.
  5. `tiptapToText()` ignora nodos `horizontalRule` pero respeta bloques.
- **Estimación**: 5 tests

#### A.2 — `project-paths.ts`
- **Fichero**: `src/app/shared/utils/project-paths.ts`
- **Tipo**: Funciones puras, sin TestBed
- **Mocks**: Ninguno
- **Tests**:
  1. `projectJsonPath()` concatena correctamente.
  2. `documentPath()` incluye extensión `.json`.
  3. `documentsFolderPath()` es carpeta sin archivo.
  4. `boardPath()` vs `boardsFolderPath()` diferencian fichero y carpeta.
  5. `statsPath()`, `consistencyReportPath()` rutas correctas.
  6. `deskNotePath()` incluye subcarpeta `desk_notes`.
  7. `aiSessionPath()` correcto.
- **Estimación**: 7 tests

#### A.3 — `insertAfter` e `insertInside` (en `project.service.ts`)
- **Fichero**: `src/app/core/services/project.service.ts` (funciones exportadas ya existentes)
- **Tipo**: Funciones puras, sin TestBed
- **Mocks**: Ninguno
- **Tests**:
  1. `insertAfter()` inserta nodo después del target en mismo nivel.
  2. `insertAfter()` funciona en profundidad anidada.
  3. `insertAfter()` no inserta si target no existe.
  4. `insertInside()` inserta como primer hijo de carpeta.
  5. `insertInside()` funciona en profundidad anidada.
- **Estimación**: 5 tests

**Acumulado Fase A**: ~17 tests

---

### Fase B: Servicios stateless simples

**Objetivo**: Servicios que no tienen signals propias. Se testean con TestBed + mocks de bridge/project/transloco. Los métodos puras se testean sin inyectar el servicio.

#### B.1 — `toast.service.ts`
- **Fichero**: `src/app/shared/services/toast.service.ts`
- **Tipo**: Señales con TestBed (tiene `toasts = signal<Toast[]>([])`)
- **Mocks**: Ninguno externo (no depende de bridge)
- **Tests**:
  1. `success()` añade toast con type 'success' y duration 3000.
  2. `error()` añade toast con type 'error' y duration 5000.
  3. `toasts()` señal refleja array tras llamada.
  4. `dismiss()` elimina toast por id.
  5. Auto-dismiss elimina toast tras timeout (usar `vi.useFakeTimers()`).
- **Estimación**: 5 tests
- **Riesgo**: `setTimeout` requiere fake timers de Vitest.

#### B.2 — `search.service.ts`
- **Fichero**: `src/app/core/services/search.service.ts`
- **Tipo**: Stateful con TestBed (cache interno + dependencias inyectadas)
- **Mocks necesarios**:
  - `TauriBridgeService`: `readJsonFile`, `listJsonFiles`
  - `ProjectService`: `project()` signal, `basePath()` signal
- **Tests**:
  1. `search()` devuelve [] con query vacía.
  2. `search()` devuelve [] sin proyecto abierto (`basePath()` null).
  3. `search()` encuentra matches simples en un documento.
  4. `search()` respeta límite de 5 matches por documento.
  5. `search()` extrae contexto con radius de 60 chars y elipsis.
  6. `search()` usa coincidencia de palabra completa cuando `wholeWord=true`.
  7. `search()` usa regex parcial cuando `wholeWord=false`.
  8. `search()` escapa caracteres especiales en query.
  9. `invalidate()` limpia caché de texto.
  10. `search()` reutiliza caché en segunda búsqueda (no llama `readJsonFile` de nuevo para mismo id).
- **Estimación**: 10 tests
- **Riesgo**: El método `search()` itera ficheros y usa `getDocumentTitle()` que lee del tree. Requiere tree mock completo.

#### B.3 — `board.service.ts`
- **Fichero**: `src/app/core/services/board.service.ts`
- **Tipo**: Mixto — funciones puras + async con TestBed
- **Mocks necesarios**:
  - `TauriBridgeService`: `readJsonFile`, `writeJsonFile`, `deleteJsonFile`, `listJsonFiles`
  - `ProjectService`: `basePath()` signal
  - `TranslocoService`: `translate` (mock simple)
- **Tests (funciones puras — sin TestBed)**:
  1. `addCard()` añade tarjeta sin mutar board original.
  2. `addCard()` asigna color por tipo por defecto.
  3. `updateCard()` modifica campos de tarjeta existente.
  4. `deleteCard()` elimina tarjeta por id.
- **Tests (async — con TestBed)**:
  5. `loadBoard()` parsea JSON y añade `type: 'note'` por defecto a tarjetas sin tipo.
  6. `saveBoard()` actualiza `updatedAt` y llama `writeJsonFile`.
  7. `createBoard()` genera id y fecha, luego delega a `saveBoard`.
  8. `deleteBoard()` llama `deleteJsonFile` con ruta correcta.
  9. `listBoardIds()` llama `listJsonFiles` en carpeta boards.
  10. Métodos lanzan error traducido cuando no hay proyecto abierto.
- **Estimación**: 10 tests
- **Riesgo**: `requireBasePath()` es privado; se testea indirectamente verificando que los métodos públicos lanzan cuando `basePath()` es null.

#### B.4 — `document.service.ts`
- **Fichero**: `src/app/core/services/document.service.ts`
- **Tipo**: Mixto — funciones puras + async con TestBed
- **Mocks necesarios**:
  - `TauriBridgeService`: `readJsonFile`, `writeJsonFile`, `deleteJsonFile`
  - `ProjectService`: `project()` signal (con settings), `basePath()` signal, `updateWordCountCache`, `removeNode`, `addDeskDocumentNode`
  - `SearchService`: `invalidate`
  - `TranslocoService`: `translate`
- **Tests (funciones puras)**:
  1. `createSnapshot()` genera snapshot con id único y timestamp.
  2. `createSnapshot()` usa `maxSnapshots` del proyecto (default 10 si no hay proyecto).
  3. `createSnapshot()` elimina snapshots más antiguos al exceder límite.
  4. `restoreSnapshot()` reemplaza contenido por snapshot.
  5. `restoreSnapshot()` crea snapshot automático del estado actual antes de restaurar.
  6. `restoreSnapshot()` lanza si snapshotId no existe.
  7. `deleteSnapshot()` elimina snapshot por id.
- **Tests (async — con TestBed)**:
  8. `loadDocument()` parsea JSON y devuelve `DocumentFile`.
  9. `saveDocument()` actualiza `updatedAt`, llama `writeJsonFile`, invalida search, updatea word count cache.
  10. `createDocument()` crea nodo vía `project.addNode()` y documento vacío.
  11. `deleteDocument()` borra fichero y elimina nodo del árbol.
  12. `createDocumentInDesk()` convierte markdown a TipTap y guarda en `desk_notes`.
  13. `loadDeskDocument()` lee desde `desk_notes`.
- **Estimación**: 13 tests
- **Riesgo**: `countWords()` es privado; se testea indirectamente via `saveDocument()` que lo invoca. `createDocumentInDesk()` usa `marked` y `generateJSON` — son librerías reales, no requieren mock.

**Acumulado Fase B**: ~38 tests (total: ~55)

---

### Fase C: Servicios async y utilitarios

**Objetivo**: Servicios con lógica async, sin signals propias o con signals triviales.

#### C.1 — `stats.service.ts`
- **Fichero**: `src/app/core/services/stats.service.ts`
- **Tipo**: Async con TestBed
- **Mocks necesarios**:
  - `TauriBridgeService`: `readJsonFile`, `writeJsonFile`
  - `ProjectService`: `basePath()` signal, `totalWordCount()` computed
- **Tests**:
  1. `load()` devuelve `{ entries: [] }` cuando no hay proyecto.
  2. `load()` devuelve `{ entries: [] }` cuando fichero no existe.
  3. `load()` parsea JSON existente correctamente.
  4. `trackSessionStart()` incrementa sessions del día existente.
  5. `trackSessionStart()` crea entrada nueva si no existe día.
  6. `trackSessionStart()` no hace nada si ya se trackeó (`sessionTracked`).
  7. `updateTodayWords()` actualiza `wordsAdded` con delta respecto a `todayWordBase`.
  8. `updateTodayWords()` no hace nada si `sessionTracked` es false.
  9. `getLastNDays()` rellena días sin datos con ceros.
  10. `getLastNDays()` respeta el parámetro `n`.
  11. `totalWordsLastNDays()` suma solo valores positivos.
  12. `currentStreak()` cuenta días consecutivos con wordsAdded > 0.
  13. `currentStreak()` rompe streak en gap (día sin escritura).
  14. `resetSession()` limpia estado interno.
  15. `save()` recorta entries a 365 días.
- **Estimación**: 15 tests
- **Riesgo**: Depende de fecha actual (`new Date()`). Usar `vi.useFakeTimers()` para fechas deterministas.

#### C.2 — `character-scan.service.ts`
- **Fichero**: `src/app/core/services/character-scan.service.ts`
- **Tipo**: Async con TestBed
- **Mocks necesarios**:
  - `TauriBridgeService`: `readJsonFile`, `listJsonFiles`
  - `ProjectService`: `basePath()` signal
- **Tests**:
  1. `scanCharacter()` devuelve [] si no hay proyecto.
  2. `scanCharacter()` devuelve [] si nombre vacío.
  3. `scanCharacter()` encuentra menciones de personaje en un documento.
  4. `scanCharacter()` usa aliases incluyendo nombre principal.
  5. `scanCharacter()` no cuenta substrings parciales (word boundary).
  6. `scanCharacter()` escapa caracteres especiales en aliases.
  7. `scanCharacter()` suma matchCount correctamente.
  8. `scanCharacter()` ignora documentos no legibles (catch silencioso).
- **Estimación**: 8 tests
- **Riesgo**: `buildPattern()` es privado; se testea vía comportamiento de `scanCharacter()` con nombres que requieren escaping.

#### C.3 — `update.service.ts`
- **Fichero**: `src/app/core/services/update.service.ts`
- **Tipo**: Señales con TestBed
- **Mocks necesarios**:
  - `TauriBridgeService`: `checkForUpdate`, `openReleasesPage`
- **Tests**:
  1. `checked()` es false al inicio.
  2. `checkOnce()` llama `checkForUpdate` una sola vez.
  3. `checkOnce()` no llama `checkForUpdate` si `checked()` ya es true.
  4. `checkOnce()` setea `updateInfo()` si hay update.
  5. `checkOnce()` maneja error silencioso.
  6. `dismiss()` limpia `updateInfo()`.
  7. `openReleasesPage()` llama `openReleasesPage` del bridge y luego dismiss.
- **Estimación**: 7 tests

#### C.4 — `desk.service.ts`
- **Fichero**: `src/app/core/services/desk.service.ts`
- **Tipo**: Subject trivial con TestBed
- **Mocks**: Ninguno
- **Tests**:
  1. `notifyNewDocument()` emite valor por `newDocument$`.
  2. Observable completa correctamente (verificar que no es multicast no deseado).
- **Estimación**: 2 tests

**Acumulado Fase C**: ~32 tests (total: ~87)

---

### Fase D: Servicios con dependencias de configuración

**Objetivo**: Servicios que dependen de `AppConfigService` y señales/computed.

#### D.1 — `settings.service.ts`
- **Fichero**: `src/app/core/services/settings.service.ts`
- **Tipo**: TestBed con mock de AppConfigService
- **Mocks necesarios**:
  - `AppConfigService`: `config()` signal, `setAppSettings`
- **Tests**:
  1. `settings()` computado refleja `appSettings` del config.
  2. `setEditorFontFamily()` delega a `setAppSettings` con fontFamily.
  3. `setEditorFontSize()` hace clamp entre 12 y 32.
  4. `setEditorFontSize()` acepta valores dentro del rango.
  5. `setUiFontScale()` delega correctamente.
  6. `setAiPanelWidth()` hace clamp entre 240 y 600.
  7. `setDeskPosition()` delega correctamente.
  8. `setDeskBottomHeight()` hace clamp usando `window.innerHeight * 0.70` como max.
  9. `setDeskSideWidth()` hace clamp usando `window.innerWidth * 0.60` como max.
- **Estimación**: 9 tests
- **Riesgo**: Depende de `window.innerHeight/innerWidth`. Mockear en `beforeEach`.

#### D.2 — `theme.service.ts`
- **Fichero**: `src/app/core/services/theme.service.ts`
- **Tipo**: TestBed con mocks + DOM effects
- **Mocks necesarios**:
  - `AppConfigService`: `config()` signal, `setTheme`
  - `SettingsService`: `settings()` computed (mock con `appearance.uiFontScale`)
- **Tests**:
  1. `theme()` computado refleja valor del config.
  2. `toggle()` alterna entre dark y light.
  3. `setTheme()` delega a `appConfig.setTheme`.
  4. Effect aplica `data-theme` al DOM (verificar `document.documentElement.getAttribute`).
  5. Effect aplica `font-size` al DOM según `FONT_SCALE_MAP`.
- **Estimación**: 5 tests
- **Riesgo**: Effects de DOM requieren que TestBed ejecute en entorno DOM real (jsdom ya configurado). Hay que limpiar atributos entre tests.

**Acumulado Fase D**: ~14 tests (total: ~101)

---

### Fase E: Servicios complejos con señales

**Objetivo**: Servicios con máquinas de estado en señales, dependencias múltiples, y comportamiento async complejo.

#### E.1 — `language-tool.service.ts`
- **Fichero**: `src/app/core/services/language-tool.service.ts`
- **Tipo**: TestBed + mocks de bridge + fake timers
- **Mocks necesarios**:
  - `TauriBridgeService`: `ltIsInstalled`, `ltStartServer`, `ltStopServer`, `ltDownloadAndInstall`, `ltOnProgress`, `ltOnInstallComplete`, `ltServerReady`, `ltUninstall`
  - `AppConfigService`: `config()` signal (con `ltLanguage`, `lang`)
  - `ProjectService`: `project()` signal (con `authorProfile.language`)
- **Tests**:
  1. `resolvedLanguage()` devuelve `ltLanguage` del config si existe.
  2. `resolvedLanguage()` hace fallback a idioma del autor del proyecto.
  3. `resolvedLanguage()` hace fallback a `config.lang`.
  4. `resolvedLanguage()` devuelve 'es' si nada disponible.
  5. `resolvedLanguage()` mapea códigos de autor a códigos LT (ej: ca → ca-ES, pt → pt-PT).
  6. `initialize()` con `ltIsInstalled=false` setea `not-installed`.
  7. `initialize()` con `ltIsInstalled=true` setea `ready`.
  8. `initialize(autoStart=true)` inicia servidor y setea `serverReady=true`.
  9. `install()` transita `downloading` → `ready` vía callbacks.
  10. `install()` maneja error seteando `error`.
  11. `install()` limpia listeners anteriores (`_unlisteners`).
  12. `stopServer()` setea `serverReady(false)`.
  13. `uninstall()` limpia estado a `not-installed`.
  14. `progress()` se actualiza vía callback de `ltOnProgress`.
- **Estimación**: 14 tests
- **Riesgo**: `waitForServer()` usa `setTimeout` en loop. Requiere fake timers y múltiples `vi.advanceTimersByTime(1000)`. Los callbacks `ltOnProgress`/`ltOnInstallComplete` devuelven unlisten functions.

#### E.2 — `consistency.service.ts`
- **Fichero**: `src/app/core/services/consistency.service.ts`
- **Tipo**: TestBed + mocks de bridge + mock de AiService
- **Mocks necesarios**:
  - `TauriBridgeService`: `readJsonFile`, `writeJsonFile`, `listJsonFiles`
  - `ProjectService`: `project()` signal, `basePath()` signal
  - `AiService`: `callOnce` (mock que devuelve string)
- **Tests**:
  1. `documentCount` cuenta solo documentos (no carpetas) del árbol.
  2. `analyze()` setea `isAnalyzing(true)` al inicio y `false` al final.
  3. `analyze()` actualiza `progress()` durante fases.
  4. `analyze()` salta documentos con < 100 palabras.
  5. `analyze()` maneja error de IA por capítulo sin abortar todo.
  6. `analyze()` persiste reporte en disco vía `writeJsonFile`.
  7. `analyze()` setea `lastReport()` con resultado parseado.
  8. `analyze()` maneja respuesta de IA malformada (fallback a JSON con error).
  9. `loadSavedReport()` lee y parsea reporte existente.
  10. `loadSavedReport()` devuelve null si no existe.
- **Estimación**: 10 tests
- **Riesgo**: `analyze()` es muy largo y tiene muchas ramas. Requiere mockear `callOnce` con respuestas controladas. El parsing de JSON de IA limpia bloques markdown (```json).

#### E.3 — `narrative.service.ts`
- **Fichero**: `src/app/core/services/narrative.service.ts`
- **Tipo**: TestBed + mocks de bridge + boardService
- **Mocks necesarios**:
  - `TauriBridgeService`: `readJsonFile`
  - `ProjectService`: `project()` signal (con tree, wordCountCache), `isLoaded()`, `basePath()`
  - `BoardService`: `listBoardIds()` (mock, no el real para evitar cascada)
- **Tests**:
  1. `buildNarrativeCards()` devuelve [] si proyecto no cargado.
  2. `buildNarrativeCards()` devuelve [] si no hay basePath.
  3. `buildNarrativeCards()` incluye folders como `isSection=true` con wordCount=0.
  4. `buildNarrativeCards()` incluye documentos con wordCount del cache.
  5. `buildNarrativeCards()` incluye personajes vinculados por `appearsInChapters`.
  6. `buildNarrativeCards()` incluye synopsis del documento.
  7. `buildNarrativeCards()` maneja error al leer documento (synopsis vacío).
  8. `buildNarrativeCards()` mantiene orden depth-first preorder del árbol.
- **Estimación**: 8 tests
- **Riesgo**: `flattenTree()` es privado; se testea vía orden de resultados. Requiere mockear `BoardService.listBoardIds()` para evitar que el test dependa de la implementación real de BoardService.

**Acumulado Fase E**: ~32 tests (total: ~133)

---

### Fase F: Servicios con librerías externas

**Objetivo**: Servicios que usan librerías externas (mammoth, marked, JSZip, fetch). Mock de librerías o fetch según sea necesario.

#### F.1 — `import.service.ts`
- **Fichero**: `src/app/core/services/import.service.ts`
- **Tipo**: TestBed + mocks + vi.mock de librerías
- **Mocks necesarios**:
  - `TauriBridgeService`: `readJsonFile`, `readFileBytes`, `openFilesDialog`, `convertOdtToDocx`, `deleteJsonFile`
  - `DocumentService`: `createDocument`, `saveDocument`
  - `ToastService`: `error`
  - Librerías: `vi.mock('mammoth')`, `vi.mock('marked')` opcional (pueden usarse reales si son deterministas)
- **Tests**:
  1. `openAndImport()` devuelve [] si usuario cancela diálogo.
  2. `openAndImport()` maneja error de un fichero y notifica toast.
  3. `importFile()` lanza error si extensión no soportada.
  4. `importFile()` detecta extensión y delega a parser correcto (txt).
  5. `importFile()` detecta extensión y delega a parser correcto (md).
  6. `importFile()` detecta extensión y delega a parser correcto (docx).
  7. `importFile()` detecta extensión y delega a parser correcto (odt).
  8. `importFile()` con txt divide párrafos por doble salto de línea.
  9. `importFile()` con txt maneja fichero vacío.
  10. `importFile()` con md convierte markdown a TipTap JSON.
  11. `importFile()` con docx pasa warnings de mammoth.
  12. `importFile()` con odt usa conversión temporal y limpia fichero.
  13. `titleFromPath()` (vía `importFile()`) extrae nombre limpio y capitaliza.
- **Estimación**: 13 tests
- **Riesgo**: `mammoth` y `marked` son dependencias reales. Para unit tests, es más estable mockear `mammoth.convertToHtml`. `generateJSON` de TipTap requiere StarterKit real (está en dependencias). `importOdt()` usa try/finally — verificar que se limpia el fichero temporal incluso en error.

#### F.2 — `image.service.ts`
- **Fichero**: `src/app/core/services/image.service.ts`
- **Tipo**: TestBed + mocks de ProjectService + mock de `@tauri-apps/plugin-http`
- **Mocks necesarios**:
  - `ProjectService`: `project()` signal (con settings.imageProvider, imageApiKey, etc.)
  - `fetch` de `@tauri-apps/plugin-http`: mockear con `vi.mock('@tauri-apps/plugin-http')`
- **Tests**:
  1. `isConfigured()` false cuando no hay imageProvider.
  2. `isConfigured()` true para dalle con apiKey.
  3. `isConfigured()` false para dalle sin apiKey.
  4. `isConfigured()` true para openai-compatible con endpoint.
  5. `providerStatusMessage()` refleja cada estado.
  6. `generate()` lanza error si no está configurado.
  7. `generate()` setea `isGenerating(true)` durante llamada y `false` después.
  8. `generate()` con dalle llama fetch con modelo dall-e-3.
  9. `generate()` con dalle parsea b64_json y devuelve data URL.
  10. `generate()` con openai-compatible usa endpoint custom.
  11. `generate()` maneja error HTTP de API.
  12. `buildAutoPrompt()` genera prompt con título + body truncado.
  13. `buildAutoPrompt()` funciona con body vacío.
- **Estimación**: 13 tests
- **Riesgo**: Mock de `fetch` de `@tauri-apps/plugin-http` es crítico. No debe hacerse fetch real a OpenAI.

#### F.3 — `transcription.service.ts`
- **Fichero**: `src/app/core/services/transcription.service.ts`
- **Tipo**: TestBed + mocks + mock de fetch
- **Mocks necesarios**:
  - `ProjectService`: `project()` signal (con settings.transcriptionProvider, etc.)
  - `DocumentService`: `createDocument`, `saveDocument`
  - `TauriBridgeService`: `readFileBytes`
  - `fetch` de `@tauri-apps/plugin-http`: mockear
- **Tests**:
  1. `isConfigured()` false sin provider.
  2. `isConfigured()` true para openai/groq con apiKey.
  3. `isConfigured()` true para local con endpoint.
  4. `providerStatusMessage()` refleja cada estado.
  5. `transcribe()` setea progreso en fases.
  6. `transcribe()` construye FormData correctamente.
  7. `transcribe()` envía language si está configurado.
  8. `transcribe()` usa endpoint correcto según provider.
  9. `transcribe()` maneja error HTTP.
  10. `transcribe()` devuelve `durationMs` > 0.
  11. `saveTranscriptionToProject()` crea documento con header y contenido.
  12. `saveTranscriptionToProject()` reusa carpeta existente o crea nueva.
  13. `saveTranscriptionToProject()` formatea título con timestamp.
- **Estimación**: 13 tests
- **Riesgo**: `transcribe()` usa `File` y `FormData` del DOM. Requiere jsdom (ya configurado). `Date.now()` en duration debe ser >0 pero es difícil de testear exactamente; verificar que existe y es número.

**Acumulado Fase F**: ~39 tests (total: ~172)

---

### Fase G: Servicios muy complejos

**Objetivo**: Servicios con alta complejidad que requieren mocks elaborados o tienen estado global difícil de aislar.

#### G.1 — `tiptap-languagetool.ts` — funciones puras exportadas
- **Fichero**: `src/app/shared/utils/tiptap-languagetool.ts`
- **Tipo**: Solo funciones puras exportadas. **NO testear la extensión TipTip completa** (requeriría ProseMirror real).
- **Mocks**: Ninguno
- **Tests**:
  1. `debounce()` retrasa ejecución y cancela timer previo.
  2. `debounce()` ejecuta solo una vez tras ráfaga de llamadas.
  3. `moreThan500Words()` true con ≥500 palabras.
  4. `moreThan500Words()` false con <500 palabras.
  5. `changedDescendants()` recorre nodos modificados entre dos docs.
  6. `changedDescendants()` ignora hijos idénticos por referencia.
  7. `gimmeDecoration()` (si se puede importar sin dependencias pesadas) genera Decoration inline.
- **Estimación**: 6-7 tests
- **Riesgo**: `debounce` usa `setTimeout` — requiere fake timers. `changedDescendants` usa `any` y métodos ProseMirror; requiere construir objetos mock con `childCount`, `child()`, `sameMarkup()`, `nodeSize`, `nodesBetween()`.

#### G.2 — `export.service.ts`
- **Fichero**: `src/app/core/services/export.service.ts`
- **Tipo**: TestBed + mocks de bridge. La lógica de generación de HTML/DOCX es pura y puede testearse indirectamente.
- **Mocks necesarios**:
  - `TauriBridgeService`: `saveFileDialog`, `writeBinaryFile`, `openPrintWindow`
- **Tests**:
  1. `export()` con formato `pdf-manuscript` llama `openPrintWindow`.
  2. `export()` con formato `docx` llama `saveFileDialog` + `writeBinaryFile`.
  3. `export()` con formato `epub` llama `saveFileDialog` + `writeBinaryFile`.
  4. `export()` cancela si `saveFileDialog` devuelve null.
  5. `buildManuscriptHtml()` incluye metadatos (título, autor, género, word count).
  6. `buildManuscriptHtml()` genera páginas de capítulo con estilos correctos.
  7. `buildManuscriptHtml()` respeta pageSize (A4 vs letter).
  8. `buildManuscriptHtml()` incluye toolbar solo en media screen.
  9. `buildDocxDocument()` (vía `export()` docx) genera documento con título y capítulos.
  10. `tiptapToDocxParagraphs()` convierte paragraphs a Paragraph con indent.
  11. `tiptapToDocxParagraphs()` maneja headings con niveles.
  12. `tiptapToDocxParagraphs()` maneja blockquotes.
  13. `tiptapToDocxParagraphs()` maneja listas (bullet/ordered).
  14. `inlineToRuns()` aplica bold, italic, strike según marks.
  15. `countWords()` cuenta palabras de múltiples documentos.
- **Estimación**: 15 tests
- **Riesgo**: `docx` y `epub-gen-memory` son librerías grandes. Para unit tests, es mejor mockear `Packer.toBlob` y `epub` default, o usar los reales si no ralentizan. `buildManuscriptHtml` es público y testeable directamente.

#### G.3 — `backup.service.ts`
- **Fichero**: `src/app/core/services/backup.service.ts`
- **Tipo**: TestBed + mocks de bridge + mock de JSZip
- **Mocks necesarios**:
  - `TauriBridgeService`: `saveFileDialog`, `readJsonFile`, `listJsonFiles`, `writeBinaryFile`
  - `ProjectService`: `project()` signal, `basePath()` signal
  - `ToastService`: `success`, `error`
  - `JSZip`: `vi.mock('jszip')` — mockear constructor y `generateAsync`
- **Tests**:
  1. `createBackup()` devuelve temprano si no hay proyecto.
  2. `createBackup()` devuelve temprano si usuario cancela diálogo.
  3. `createBackup()` añade `project.json` al ZIP.
  4. `createBackup()` añade documentos al ZIP.
  5. `createBackup()` añade boards al ZIP.
  6. `createBackup()` llama `writeBinaryFile` con buffer generado.
  7. `createBackup()` notifica éxito vía toast.
  8. `createBackup()` notifica error vía toast si falla.
- **Estimación**: 8 tests
- **Riesgo**: JSZip es una librería externa. Mockear completamente evita dependencias pesadas en test.

**Acumulado Fase G**: ~30 tests (total: ~202)

---

## Criterios de aceptación ajustados

Basados en la realidad del código:

- [ ] `pnpm test --watch=false` ejecuta sin errores de infraestructura.
- [ ] Todos los tests usan mocks de `TauriBridgeService`; ninguno accede a disco ni red real.
- [ ] Todos los tests de funciones puras se ejecutan sin `TestBed`.
- [ ] Todos los tests con `TestBed` incluyen `provideZonelessChangeDetection()`.
- [ ] Ningún test importa `jasmine` ni usa sintaxis Jasmine (`spyOn`, `done()`, etc.).
- [ ] Servicios que la spec asumía con señales pero son stateless se testean como stateless (no se inventan tests de señales).
- [ ] Métodos privados se testean indirectamente vía métodos públicos (no se usa `as any` para acceder a privados).
- [ ] Coverage objetivo: 100% de los ficheros listados en este plan que tienen lógica de negocio significativa. Se acepta <100% en `tiptap-languagetool.ts` (solo funciones puras exportadas) y `export.service.ts` (librerías externas).

### Métricas ajustadas por fase

| Fase | Unidades | Tests estimados | Acumulado |
|---|---|---:|---:|
| Parte 1 (core) | 3 | 27 | **27** ✅ |
| Fase A (puras) | 3 | 17 | **44** |
| Fase B (stateless simples) | 4 | 38 | **82** |
| Fase C (async/util) | 4 | 32 | **114** |
| Fase D (config) | 2 | 14 | **128** |
| Fase E (señales complejas) | 3 | 32 | **160** |
| Fase F (librerías externas) | 3 | 39 | **199** |
| Fase G (muy complejos) | 3 | 30 | **229** |

**Nota**: El total (~229) es mayor que el estimado original (~199) porque se añaden servicios no contemplados (`project-paths.ts`, `insertAfter/insertInside`, y algunos servicios tienen más superficie de test al ser stateless con más métodos que testear).

---

## Notas de implementación para el Implementer

### 1. Patrón de mock estándar (ya establecido)

```typescript
const mockBridge = {
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn().mockResolvedValue(undefined),
  folderExists: vi.fn().mockResolvedValue(true),
  createFolder: vi.fn().mockResolvedValue(undefined),
  listJsonFiles: vi.fn().mockResolvedValue([]),
  // ... añadir métodos según necesidad
} as unknown as TauriBridgeService;
```

### 2. Mock de ProjectService

Muchos servicios dependen de `ProjectService`. Crear helper reutilizable:

```typescript
function mockProjectService(overrides?: Partial<Project>) {
  return {
    project: signal({ ...mockProject(), ...overrides }),
    basePath: signal('/test/project'),
    isLoaded: computed(() => true),
    totalWordCount: computed(() => 0),
    // ... añadir métodos mock según necesidad
  } as unknown as ProjectService;
}
```

### 3. Mock de TranslocoService

```typescript
const mockTransloco = {
  translate: vi.fn((key: string) => key),
} as unknown as TranslocoService;
```

### 4. Fake timers para timeouts

Usar siempre en tests con `setTimeout`:

```typescript
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); });
```

### 5. Fechas deterministas

```typescript
beforeEach(() => {
  const fixedDate = new Date('2025-01-15T12:00:00Z');
  vi.setSystemTime(fixedDate);
});
```

### 6. Gotchas conocidos

- **Zoneless + TestBed**: Siempre incluir `provideZonelessChangeDetection()` en providers del TestBed.
- **Signals en mocks**: Los mocks de servicios con signals deben usar `signal(valorInicial)` real, no objetos planos. `computed()` también.
- **DOM effects** (`theme.service.ts`): Limpiar atributos/style en `afterEach` para no contaminar entre tests.
- **ProseMirror mocks** (`tiptap-languagetool.ts`): Los nodos ProseMirror son objetos con métodos (`childCount`, `child(i)`, `sameMarkup()`, `nodeSize`). Construir mocks explícitos.
- **Librerías externas**: Preferir `vi.mock('mammoth')` y `vi.mock('jszip')` a nivel de módulo antes que importar reales.
- **`structuredClone`**: Disponible en jsdom (Vitest usa jsdom). Si no, usar `JSON.parse(JSON.stringify(...))` en tests.
- **`crypto.randomUUID`**: Disponible en jsdom. Si falla, usar `vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })`.
- **`window.innerHeight/innerWidth`**: Mockear en tests de `settings.service.ts`.

### 7. Orden recomendado de implementación

Dentro de cada fase, priorizar:
1. Funciones puras primero (rápido feedback, sin TestBed).
2. Métodos async simples (read/write JSON).
3. Métodos con lógica de negocio (clamping, regex, etc.).
4. Effects y signals complejos al final.

### 8. Qué NO hacer

- **No testear componentes UI** — fuera del scope de INK-33.
- **No acceder a métodos privados con `as any`** — testear indirectamente.
- **No inventar APIs que no existen** — si un servicio no tiene signals, no testear signals.
- **No usar `spyOn`** — es API de Jasmine. Usar `vi.fn()` y `vi.mocked()`.
- **No dejar tests skipped (`it.skip`, `describe.skip`)** en commits.

---

## Dependencias entre tareas

```
Fase A (puras)
    │
    ▼
Fase B (stateless simples)
    │ (toast → search → board → document)
    ▼
Fase C (async/util)
    │ (stats, character-scan, update, desk)
    ▼
Fase D (config)
    │ (settings → theme)
    ▼
Fase E (señales complejas)
    │ (language-tool, consistency, narrative)
    ▼
Fase F (librerías externas)
    │ (import, image, transcription)
    ▼
Fase G (muy complejos)
    │ (tiptap-languagetool, export, backup)
    ▼
Done
```

Dentro de cada fase, las tareas son independientes y pueden paralelizarse. La única dependencia interna es que `theme.service.ts` (D.2) necesita `SettingsService` (D.1), pero ambos están en la misma fase.
