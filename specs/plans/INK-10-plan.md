## Plan de implementación — INK-10

### Resumen

Se añade al editor de Inkwell un flujo de exportación en forma de wizard de 3 pasos (formato → documentos → metadatos) que permite generar un PDF en Standard Manuscript Format —abriendo una ventana nativa de Tauri para imprimir— o un EPUB 3 que se guarda directamente en disco. La implementación requiere tres nuevos comandos Rust, tres métodos nuevos en `TauriBridgeService`, un `ExportService` orquestador, tres componentes de paso, un modal wizard y la integración del botón de exportación en la top bar del editor.

---

### Tareas

#### Tarea 1: Instalar `epub-gen-memory`

- **Fichero**: `package.json` (modificar via pnpm)
- **Qué hace**: Añade la dependencia `epub-gen-memory` al proyecto. Esta librería usa CJS (`dist/lib/index.js`) y tiene dependencias como `node-fetch` y `ejs` que pueden producir advertencias de CommonJS en el build de Angular (`@angular/build:application`). Si el build emite errores por módulos CJS, habrá que añadir `"allowedCommonJsDependencies": ["epub-gen-memory"]` en la sección `options` del builder en `angular.json`. El import debe hacerse con `import epub from 'epub-gen-memory'` tal como indica la spec; si TypeScript protesta, añadir `"skipLibCheck": true` ya está configurado, pero puede ser necesario `// @ts-expect-error` en el punto de import o instalar `@types/epub-gen-memory` si existieran.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: `epub-gen-memory` usa `node-fetch` internamente, que asume entorno Node.js. En el contexto de Tauri 2 / WebView el `fetch` nativo del browser está disponible, pero `node-fetch` puede intentar leer variables de entorno de Node que no existen. Verificar que la generación del EPUB produce un `ArrayBuffer` válido antes de avanzar a la tarea de integración. Si hay errores de runtime irresolubles, la alternativa es usar `jszip` (ya es dependencia transitiva de `epub-gen-memory`) directamente para construir el EPUB de forma manual —pero esto queda como plan B y no debe implementarse salvo que la opción principal falle.

#### Tarea 2: Modelo de exportación

- **Fichero**: `src/app/core/models/export.model.ts` (crear)
- **Qué hace**: Define las interfaces `ExportMetadata`, `ExportOptions`, los tipos `ExportFormat` y `PageSize`, y el objeto `DEFAULT_EXPORT_METADATA`. Seguir exactamente las definiciones de la Parte 1 de la spec.
- **Depende de**: Tarea 1

#### Tarea 3: Exportar el modelo en el barrel de modelos

- **Fichero**: `src/app/core/models/index.ts` (modificar)
- **Qué hace**: Añadir `export * from './export.model';` al final del barrel. El fichero actualmente re-exporta `project.model`, `document.model` y `board.model`.
- **Depende de**: Tarea 2

#### Tarea 4: Nuevos comandos Rust en `fs_commands.rs`

- **Fichero**: `src-tauri/src/commands/fs_commands.rs` (modificar)
- **Qué hace**: Añade tres funciones al final del fichero:
  1. `open_print_window` — escribe el HTML en un archivo temporal y abre una `WebviewWindowBuilder` con `WebviewUrl::External`. Necesita añadir al `use` inicial: `use tauri::{WebviewUrl};` y `use tauri::webview::WebviewWindowBuilder;` (la ruta exacta depende de la versión de Tauri 2; el Explorer confirmó que el proyecto usa Tauri 2.x; la firma de la spec debe respetarse).
  2. `save_file_dialog` — usa `tauri_plugin_dialog::DialogExt` y `tokio::sync::oneshot`. La firma Rust acepta `default_name: String` y `extension: String` (una sola extensión, no un array). Retorna `Option<String>`.
  3. `write_binary_file` — recibe `data: Vec<u8>` (no `ArrayBuffer`; la conversión a `Vec<u8>` ocurre en el lado Angular con `Array.from(new Uint8Array(data))`).
- **Depende de**: ninguna dependencia previa (cambio Rust independiente)
- **Riesgo**: El import de `WebviewWindowBuilder` en Tauri 2 puede requerir la ruta `tauri::webview::WebviewWindowBuilder` en lugar de la que muestra la spec (`tauri::WebviewWindowBuilder`). Verificar en los docs de Tauri 2 o con `cargo check` tras implementar. Además, `open_print_window` usa `file://` URLs: en Linux con WebKitGTK esto funciona bien, pero hay que confirmar que la CSP de `tauri.conf.json` (`"csp": null`) lo permite sin restricciones. El fichero temporal `inkwell_manuscript_print.html` queda en el directorio temporal del SO; no se borra al cerrar la ventana —esto es aceptable para esta spec.

#### Tarea 5: Registrar los nuevos comandos en `lib.rs`

- **Fichero**: `src-tauri/src/lib.rs` (modificar)
- **Qué hace**: Añade `commands::fs_commands::open_print_window`, `commands::fs_commands::save_file_dialog` y `commands::fs_commands::write_binary_file` al array de `tauri::generate_handler!`. El fichero ya tiene los 8 comandos existentes; esta tarea los amplía a 11.
- **Depende de**: Tarea 4

#### Tarea 6: Nuevos métodos en `TauriBridgeService`

- **Fichero**: `src/app/core/services/tauri-bridge.service.ts` (modificar)
- **Qué hace**: Añade tres métodos al servicio existente:
  1. `openPrintWindow(html: string): Promise<void>` — invoca `open_print_window` con `{ html }`.
  2. `saveFileDialog(defaultName: string, extension: string): Promise<string | null>` — invoca `save_file_dialog` con `{ defaultName, extension }`. **Atención**: la firma del bridge recibe `extension: string` (un string único), no un array de filtros como en la spec de `ExportService`. El `ExportService` llama `this.bridge.saveFileDialog('${title}.epub', 'epub')` — sin el array de objetos que aparece en el código de ejemplo del `exportEpub`. El plan alinea explícitamente la firma del bridge con la firma Rust.
  3. `writeBinaryFile(path: string, data: ArrayBuffer): Promise<void>` — convierte con `Array.from(new Uint8Array(data))` antes de invocar `write_binary_file`.
- **Depende de**: Tarea 5

#### Tarea 7: `ExportService`

- **Fichero**: `src/app/core/services/export.service.ts` (crear)
- **Qué hace**: Servicio `providedIn: 'root'` que contiene:
  - `export(options, documents, projectTitle)` — método principal orquestador.
  - `buildManuscriptHtml(docs, meta, title, wordCount)` — construye el HTML completo con estilos SMF incrustados. Este método es `public` porque `ExportModalComponent` no lo usa directamente, pero los tests manuales pueden validarlo.
  - `exportManuscriptPdf` (privado) — calcula `wordCount`, construye el HTML y llama a `bridge.openPrintWindow`.
  - `exportEpub` (privado) — llama a `bridge.saveFileDialog` con `('${title}.epub', 'epub')`, genera el EPUB con `epub-gen-memory` y escribe con `bridge.writeBinaryFile`.
  - `countWords(docs)` — público, usado también desde `ExportModalComponent` para contar palabras en la lista de documentos.
  - `buildChapterHtml` (privado) — envuelve el HTML del capítulo en `<div class="chapter">`.
  - Importa `generateHTML` desde `@tiptap/core` (ya exportado en la versión 3.23.2 instalada; no hace falta `@tiptap/html` separado).
  - Importa `StarterKit` desde `@tiptap/starter-kit`.
- **Depende de**: Tarea 3, Tarea 6
- **Riesgo**: La llamada a `epub()` de `epub-gen-memory` retorna una promesa. La spec la llama con segundo argumento `'arraybuffer'`, lo que según la API de la librería debe devolver un `ArrayBuffer`. Si los tipos TypeScript de `epub-gen-memory` no declaran correctamente la sobrecarga, puede ser necesario un cast explícito (`as ArrayBuffer`). La spec ya lo anticipa con `as ArrayBuffer`.

#### Tarea 8: `StepDocumentSelectorComponent`

- **Fichero**: `src/app/features/export/steps/step-document-selector.component.ts` (crear)
- **Qué hace**: Componente standalone que recibe `documents = input.required<FlatDocument[]>()` y `selectedIds = model<string[]>([])`. Renderiza la lista de documentos con checkboxes, sangría proporcional a `depth`, recuento de palabras y botones "Seleccionar todo" / "Deseleccionar todo". La interfaz `FlatDocument` se define en este mismo fichero y se re-exporta para que `ExportModalComponent` la importe desde aquí.
  - Importa `FormsModule` para los checkboxes con `[(ngModel)]`... **ATENCIÓN**: en el template se usa `[checked]` + `(change)` en lugar de `[(ngModel)]` para checkboxes, lo cual es correcto con zoneless. No usar `ngModel` en checkboxes si produce problemas de detección de cambios; el patrón `[checked] + (change)="toggleDoc()"` es más seguro en zoneless.
  - Usa `DecimalPipe` para formatear `wordCount` con `| number` — importar `DecimalPipe` de `@angular/common` en `imports`.
- **Depende de**: Tarea 2
- **Riesgo**: El template usa `| number` para el recuento de palabras. En componentes standalone, `DecimalPipe` debe estar en el array `imports` del decorator. Si se omite, el compilador de templates lanzará error en build.

#### Tarea 9: `StepMetadataComponent`

- **Fichero**: `src/app/features/export/steps/step-metadata.component.ts` (crear)
- **Qué hace**: Componente standalone con `meta = model.required<ExportMetadata>()` y `format = input<ExportFormat>('pdf-manuscript')`. Los campos opcionales (`penName`, `phone`, `address`, `agentName`, `synopsis`) se gestionan como propiedades locales del componente y se fusionan en `emitChange()` con `this.meta.update(...)`. Usa `FormsModule` para `[(ngModel)]` en inputs. Los estilos de `.input-field` van en el array `styles` del decorator (component-scoped). Importa `ExportMetadata` y `ExportFormat` desde `../../../core/models/export.model`.
- **Depende de**: Tarea 2
- **Riesgo**: La spec muestra `[(ngModel)]="meta().legalName"` en el template, lo que es incorrecto para una signal: `meta()` retorna el valor pero no se puede usar como target de `ngModel` two-way porque no es una referencia mutable directa. La solución correcta es usar las propiedades locales del componente para todos los campos (tanto obligatorios como opcionales) y sincronizar con `meta.update()` en `emitChange()`. El Implementer debe aplicar este patrón a todos los campos, no solo a los opcionales.

#### Tarea 10: `StepFormatComponent`

- **Fichero**: `src/app/features/export/steps/step-format.component.ts` (crear)
- **Qué hace**: Componente standalone con `format = model<ExportFormat>('pdf-manuscript')` y `pageSize = signal<PageSize>('a4')`. Renderiza las dos tarjetas de selección de formato (PDF manuscrito y EPUB) y el selector de tamaño de página (visible solo cuando `format() === 'pdf-manuscript'`). El evento `pageSizeChange` no existe como `output` explícito en la spec — en cambio, `pageSize` es un signal interno. El `ExportModalComponent` llama a `onPageSizeChange($event)` en la spec, lo que implica que `StepFormatComponent` debe emitir un output `pageSizeChange = output<PageSize>()` que se dispara cuando cambia `pageSize`. El Implementer debe añadir este output y emitirlo en el handler del radio.
  - Importa `FormsModule` para `[(ngModel)]` en los radios.
  - Importa `PageSize` y `ExportFormat` desde `../../../core/models/export.model`.
- **Depende de**: Tarea 2
- **Riesgo**: La spec muestra `pageSize` como `signal<PageSize>('a4')` dentro del componente pero el `ExportModalComponent` espera recibir cambios vía `(pageSizeChange)`. Alinear ambos lados: `StepFormatComponent` necesita `pageSizeChange = output<PageSize>()` emitido cada vez que cambia el radio.

#### Tarea 11: `ExportModalComponent`

- **Fichero**: `src/app/features/export/export-modal.component.ts` (crear)
- **Qué hace**: Wizard standalone de 3 pasos que orquesta los tres componentes de paso. Implementa `OnInit` para cargar los documentos planos con recuentos de palabras. Contiene:
  - Signals de estado: `currentStep`, `selectedFormat`, `selectedIds`, `metadata`, `flatDocuments`, `pageSizeChoice`, `exporting`.
  - `stepTitle` computed.
  - `canAdvance()` y `canExport()` para deshabilitar botones de navegación.
  - `doExport()` que llama a `exportService.export()`, emite toast y cierra.
  - `loadFlatDocuments()` privado que aplana el árbol del proyecto y carga word counts en paralelo.
  - `flattenTree()` privado que filtra carpetas y extrae solo nodos de tipo `'document'`.
  - Output `closed = output<void>()`.
  - Importa: `InkModalComponent`, `InkButtonComponent`, `StepDocumentSelectorComponent`, `StepMetadataComponent`, `StepFormatComponent`.
  - Importa modelos: `TreeNode` desde `../../core/models/project.model`, `FlatDocument` desde `./steps/step-document-selector.component`.
- **Depende de**: Tareas 7, 8, 9, 10
- **Riesgo**: `ngOnInit` es `async`. En contextos zoneless, las actualizaciones de signals dentro de un `async ngOnInit` se detectan correctamente porque Angular 19 zoneless utiliza `markForCheck` implícito en `signal.set()`. Sin embargo, si la carga de documentos es lenta, el usuario verá la lista vacía brevemente. Es aceptable para esta spec. No usar `NgZone.run()`.

#### Tarea 12: Integración en `EditorTopBarComponent`

- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.ts` (modificar)
- **Qué hace**: Añade el output `exportRequested = output<void>()` al componente.
- **Depende de**: ninguna dependencia previa (cambio mínimo independiente)

#### Tarea 13: Botón de exportación en el template de la top bar

- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.html` (modificar)
- **Qué hace**: Añade el botón de exportación (icono de descarga SVG) justo antes del botón de modo focus, siguiendo el patrón visual de los botones existentes (clase `p-1.5 rounded text-ink-subtle hover:text-ink-text hover:bg-ink-border transition-colors`). El botón emite `exportRequested.emit()` en el `(click)`.
- **Depende de**: Tarea 12

#### Tarea 14: Integración del modal en `EditorLayoutComponent`

- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**:
  - Añade `showExportModal = signal(false)` junto a los otros signals de estado.
  - Añade el método `openExportModal(): void { this.showExportModal.set(true); }`.
  - Añade `ExportModalComponent` al array `imports` del decorator.
  - Importa `ExportModalComponent` desde `../../features/export/export-modal.component`.
- **Depende de**: Tarea 11

#### Tarea 15: Template de `EditorLayoutComponent` — conectar modal y output de top bar

- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**:
  - En el binding de `<app-editor-top-bar>`, añadir `(exportRequested)="showExportModal.set(true)"`.
  - Al final del template (antes del cierre del `<div>` principal), añadir el bloque condicional `@if (showExportModal()) { <app-export-modal (closed)="showExportModal.set(false)"/> }`.
- **Depende de**: Tareas 13, 14

---

### Orden de ejecución

1. Tarea 1 — Instalar `epub-gen-memory` (prerequisito de npm)
2. Tarea 2 — Crear `export.model.ts`
3. Tarea 3 — Actualizar barrel `index.ts`
4. Tarea 4 — Comandos Rust en `fs_commands.rs`
5. Tarea 5 — Registrar comandos en `lib.rs`
6. Tarea 6 — Métodos en `TauriBridgeService`
7. Tarea 7 — Crear `ExportService`
8. Tarea 8 — Crear `StepDocumentSelectorComponent`
9. Tarea 9 — Crear `StepMetadataComponent`
10. Tarea 10 — Crear `StepFormatComponent`
11. Tarea 11 — Crear `ExportModalComponent`
12. Tarea 12 — Añadir output `exportRequested` a `EditorTopBarComponent` (.ts)
13. Tarea 13 — Añadir botón en `editor-top-bar.component.html`
14. Tarea 14 — Integrar modal en `EditorLayoutComponent` (.ts)
15. Tarea 15 — Conectar en `editor-layout.component.html`

---

### Puntos de atención para el Implementer

**Firma de `saveFileDialog` — alineación Angular ↔ Rust**

La firma Rust recibe `extension: String` (un único string, p.ej. `"epub"`). El método del bridge es `saveFileDialog(defaultName: string, extension: string)`. El `ExportService` lo llama como `this.bridge.saveFileDialog(`${title}.epub`, 'epub')`. La spec de la Parte 2 muestra en el ejemplo de `exportEpub` una llamada con un array de objetos `[{ name: 'EPUB', extensions: ['epub'] }]`; ese es el código de ejemplo del servicio, no del bridge. El bridge tiene firma plana. El Implementer debe ignorar el array y usar el string en la llamada al bridge.

**`generateHTML` — import correcto**

`generateHTML` está exportado desde `@tiptap/core` directamente (confirmado en 3.23.2). El import es `import { generateHTML } from '@tiptap/core'`. No instalar `@tiptap/html` adicional.

**`epub-gen-memory` — tipado TypeScript**

La librería no tiene tipos DefinitelyTyped. Si TypeScript produce error en el import `import epub from 'epub-gen-memory'`, usar `// @ts-expect-error` en la línea anterior o añadir una declaración de módulo en `src/app/features/export/epub-gen-memory.d.ts` con `declare module 'epub-gen-memory'`. El cast `as ArrayBuffer` en el resultado es necesario.

**`epub-gen-memory` — CommonJS en Angular build**

`epub-gen-memory` es CJS. El builder `@angular/build:application` emite advertencias para dependencias CJS. Si el build falla (no solo advierte), añadir en `angular.json` bajo `projects.inkwell.architect.build.options`:
```json
"allowedCommonJsDependencies": ["epub-gen-memory"]
```

**`StepMetadataComponent` — ngModel sobre signals**

No usar `[(ngModel)]` directamente sobre `meta().campoOpcional` ni sobre `meta().campoObligatorio`. Todos los campos del formulario deben ser propiedades locales del componente (strings/numbers) inicializadas desde `meta()` en `ngOnInit` o mediante un `effect()`. Se fusionan de vuelta al signal en `emitChange()`. Esto evita mutaciones directas del valor interno de la signal y es el patrón correcto en zoneless.

**`open_print_window` — import Rust**

En Tauri 2, `WebviewWindowBuilder` puede estar en `tauri::webview::WebviewWindowBuilder`. Si el compilador Rust no encuentra la ruta de la spec, usar `use tauri::webview::WebviewWindowBuilder;`. Ejecutar `cargo check` después de cada modificación Rust antes de avanzar a la siguiente tarea Angular.

**Directorio a crear**

Antes de crear los ficheros de `export/`, el directorio `src/app/features/export/steps/` no existe. El Implementer debe crearlo (se crea implícitamente al escribir los ficheros, pero conviene confirmarlo).

**Restricciones de la spec (Lo que queda fuera)**

- No implementar exportación a `.docx`.
- No implementar portada con imagen para EPUB.
- No implementar previsualización del EPUB dentro de Inkwell.
- No añadir opciones de tipografía para EPUB.
- No añadir notas al pie en el manuscrito.

**Convenciones generales del proyecto**

- Todos los componentes son `standalone: true`. Sin NgModules.
- Signals: `signal()`, `computed()`, `model()`, `input()`, `output()`. Sin `BehaviorSubject`.
- `TauriBridgeService` es el único archivo con `import { invoke }` de Tauri.
- Tokens CSS `--ink-*` en lugar de `--ctp-*` directamente.
- `pnpm` como gestor de paquetes.
- `strict: true` — sin `any` salvo el cast necesario en `doc.content` para TipTap.
