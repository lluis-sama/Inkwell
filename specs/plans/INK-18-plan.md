# Plan de implementación — INK-18

### Resumen

Se implementa un analizador de inconsistencias narrativas basado en IA. El proceso es batch y manual: el usuario lo lanza desde un nuevo botón en la barra de navegación, el análisis recorre todos los documentos del proyecto en dos fases (extracción de hechos por capítulo + análisis global de contradicciones), y el resultado se presenta en un modal y se persiste en `consistency-report.json` dentro del proyecto.

---

### Tareas

#### Tarea 1: Modelo de datos
- **Fichero**: `src/app/core/models/consistency.model.ts` (crear)
- **Qué hace**: Define las interfaces `ConsistencyReport` y `ConsistencyIssue`, el tipo `IssueType` y las constantes `ISSUE_TYPE_LABELS` e `ISSUE_SEVERITY_CONFIG` tal como aparecen en la spec. Sin lógica.
- **Depende de**: ninguna dependencia previa

#### Tarea 2: Ruta del informe en `project-paths.ts`
- **Fichero**: `src/app/shared/utils/project-paths.ts` (modificar)
- **Qué hace**: Añadir la función exportada `consistencyReportPath(basePath: string): string` al final del fichero, siguiendo el patrón de las funciones ya existentes (`statsPath`, `boardPath`, etc.). El valor de retorno es `${basePath}/consistency-report.json`.
- **Depende de**: ninguna dependencia previa

#### Tarea 3: `ConsistencyService`
- **Fichero**: `src/app/core/services/consistency.service.ts` (crear)
- **Qué hace**: Servicio con las signals `isAnalyzing`, `progress` y `lastReport`; el método público `analyze(onProgress?)` que ejecuta las dos fases IA; el método `loadSavedReport()`; y los métodos privados `extractFacts`, `detectInconsistencies`, `callAiOnce`, `flattenDocumentIds`, `flattenDocumentTitles` y `loadCharacterList`. Incluye las constantes de prompt `EXTRACTION_PROMPT`, `ANALYSIS_PROMPT` y `BATCH_SIZE`.
- **Depende de**: Tarea 1 (modelo), Tarea 2 (ruta del informe)
- **Riesgo**: La spec define `callAiOnce` usando `fetch()` nativo del navegador con la cabecera `anthropic-dangerous-allow-browser: true`. Sin embargo, `AiService` usa `fetch` de `@tauri-apps/plugin-http` (no el nativo). En Tauri 2.x la fetch nativa del navegador puede estar bloqueada por la Content Security Policy. El Implementer debe verificar si la llamada directa a `api.anthropic.com` desde `fetch()` nativo funciona en el contexto Tauri del proyecto; si no, tendrá que importar `fetch` de `@tauri-apps/plugin-http` como hace `AiService` y eliminar la cabecera `anthropic-dangerous-allow-browser`. Esta es la decisión técnica de mayor riesgo de la spec.

#### Tarea 4: `ConsistencyModalComponent` — fichero TypeScript
- **Fichero**: `src/app/features/editor/consistency/consistency-modal.component.ts` (crear)
- **Qué hace**: Componente standalone con `selector: 'app-consistency-modal'`, `templateUrl` apuntando al `.html` separado (Tarea 5) y `styleUrl` apuntando al `.css` separado (Tarea 6). Declara el `output` `closed`, las signals `report` y `progressLog`, las propiedades readonly `typeLabels` y `severityConfig`, y los métodos `sortedIssues()`, `estimatedCost()`, `ngOnInit()`, `startAnalysis()`, `formatDate()` y el privado `countDocs()`. Importa `InkModalComponent` e `InkButtonComponent` en el array `imports`.
- **Depende de**: Tarea 1 (modelo), Tarea 3 (servicio)
- **Riesgo**: La spec muestra el template inline (`template: \`...\``). La convención del proyecto exige `templateUrl` y `styleUrl` en ficheros separados. El Implementer NO debe usar `template` ni `styles` inline.

#### Tarea 5: `ConsistencyModalComponent` — template HTML
- **Fichero**: `src/app/features/editor/consistency/consistency-modal.component.html` (crear)
- **Qué hace**: Extrae el template que la spec define inline y lo coloca en el fichero `.html` separado. El contenido es idéntico al bloque `template` de la spec: contiene los cuatro estados del modal (sin API key, analizando, sin informe, informe disponible) usando `@if`, `@for` y bindings de signals. Usa solo clases Tailwind y tokens `--ink-*` vía clases utilitarias. No añade lógica ni interacciones nuevas respecto a la spec.
- **Depende de**: Tarea 4 (necesario que el componente .ts exista para que la referencia sea coherente)

#### Tarea 6: `ConsistencyModalComponent` — hoja de estilos
- **Fichero**: `src/app/features/editor/consistency/consistency-modal.component.css` (crear)
- **Qué hace**: Fichero CSS vacío o con un comentario placeholder. Todo el estilo visual se cubre con Tailwind en el template; no se necesitan reglas CSS custom.
- **Depende de**: Tarea 4

#### Tarea 7: Integración en `InkNavComponent` — lógica TypeScript
- **Fichero**: `src/app/shared/components/ink-nav.component.ts` (modificar)
- **Qué hace**: Tres cambios en el fichero existente:
  1. Añadir `import { ConsistencyService } from '../../core/services/consistency.service';` en la sección de imports.
  2. Añadir `import { ConsistencyModalComponent } from '../../features/editor/consistency/consistency-modal.component';` en la sección de imports.
  3. En el array `imports` del decorador `@Component`, añadir `ConsistencyModalComponent`.
  4. En el cuerpo de la clase, añadir: `protected consistencySvc = inject(ConsistencyService);` y `showConsistency = signal(false);`.
- **Depende de**: Tarea 3, Tarea 4

#### Tarea 8: Integración en `InkNavComponent` — template HTML
- **Fichero**: `src/app/shared/components/ink-nav.component.html` (modificar)
- **Qué hace**: Dos inserciones en el HTML existente:
  1. Insertar el botón de análisis de inconsistencias inmediatamente después del bloque del botón de Stats (líneas ~80-90). El botón sigue el patrón exacto de los otros botones de nav: condicionado con `@if (projectService.isLoaded())`, clase `nav-icon`, con el atributo `[class.text-ink-warning]="consistencySvc.isAnalyzing()"` para reflejar el estado activo.
  2. Insertar el bloque `@if (showConsistency()) { <app-consistency-modal (closed)="showConsistency.set(false)"/> }` inmediatamente después del bloque `@if (showStats())` y antes del espaciador o del toggle de tema, siguiendo el patrón de los otros modales.
- **Depende de**: Tarea 7

---

### Orden de ejecución

1. Tarea 1 — `consistency.model.ts`
2. Tarea 2 — `consistencyReportPath()` en `project-paths.ts`
3. Tarea 3 — `ConsistencyService`
4. Tarea 4 — `ConsistencyModalComponent` (.ts)
5. Tarea 5 — `ConsistencyModalComponent` (.html)
6. Tarea 6 — `ConsistencyModalComponent` (.css)
7. Tarea 7 — `InkNavComponent` (.ts)
8. Tarea 8 — `InkNavComponent` (.html)

---

### Puntos de atención para el Implementer

**Fetch nativo vs. Tauri HTTP plugin (riesgo alto)**
`AiService` usa `import { fetch } from '@tauri-apps/plugin-http'`, no el `fetch` global del navegador. La `callAiOnce` de la spec usa `fetch` nativo con la cabecera `anthropic-dangerous-allow-browser: true`. En Tauri 2.x la CSP puede bloquear el fetch nativo hacia dominios externos. El Implementer debe comprobar si en este proyecto el fetch nativo a `api.anthropic.com` funciona o si hay que usar el plugin Tauri. Si es necesario usar el plugin, se importa `fetch` de `@tauri-apps/plugin-http` y se elimina la cabecera `anthropic-dangerous-allow-browser`.

**Templates y estilos en ficheros separados (obligatorio)**
La spec muestra el template del modal inline. Esto es solo ilustrativo. La convención del proyecto exige `templateUrl` y `styleUrl`. El componente `.ts` no debe contener ni `template` ni `styles`.

**`estimatedCost()` accede a un campo privado del servicio**
La spec define `estimatedCost()` accediendo a `this.consistencySvc['project']`. Esto funciona pero es un acceso a miembro privado mediante bracket notation. El Implementer puede mantenerlo tal cual (es una estimación de coste, no lógica crítica) o, preferiblemente, exponer un getter `documentCount` en `ConsistencyService` que llame a `flattenDocumentIds(project.tree).length`.

**`hasApiKey` en `AiService` es una función, no una signal**
La propiedad `hasApiKey` de `AiService` está definida como `readonly hasApiKey = () => this.apiKey().trim().length > 0;`, es decir, una función flecha, no un `signal()`. En el template el Implementer debe invocarla como `ai.hasApiKey()` (con paréntesis), lo cual ya está correcto en la spec.

**`consistencySvc` en `InkNavComponent` debe ser `protected`, no `private`**
Los otros servicios inyectados en `InkNavComponent` que se referencian desde el template usan `protected` (ver `theme` y `projectService`). El campo `consistencySvc` debe declararse `protected` para ser accesible desde el template.

**Directorio a crear**
El directorio `src/app/features/editor/consistency/` no existe. El Implementer debe crearlo al crear el primer fichero dentro.

**Restricciones de la spec ("Lo que NO hacer")**
- No añadir análisis automático al guardar documentos.
- No añadir botones para marcar issues como resueltos o falso positivo.
- No implementar selección parcial de capítulos para el análisis.
- No mostrar el informe inline en el editor; siempre en el modal.
- No forzar un modelo distinto al configurado en `project.settings.aiModel`.
