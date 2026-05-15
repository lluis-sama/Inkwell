# Plan de implementación — INK-08

### Resumen

Implementar el asistente IA lateral del editor: un `AiService` que encapsula el streaming SSE a la API de Anthropic, un `InkSettingsModalComponent` para gestionar la API key, y un `AiAssistantPanelComponent` con historial de conversación y tres modos. La integración se completa modificando `TiptapEditorComponent` (exponer `insertAtCursor`), `EditorTopBarComponent` (botón IA) y `EditorLayoutComponent` (wiring completo del panel, atajo de teclado y lógica de exclusión con el panel de snapshots).

---

### Tareas

#### Tarea 1: AiService
- **Fichero**: `src/app/core/services/ai.service.ts` (crear)
- **Qué hace**: Servicio `providedIn: 'root'` con signal `apiKey` (hidratado desde `localStorage`), métodos `saveApiKey`, `clearApiKey`, getter `hasApiKey`, y método `streamMessage` que realiza fetch SSE a `api.anthropic.com/v1/messages` devolviendo un `AsyncGenerator<string>`. Incluye la lógica `injectContext` privada y los `SYSTEM_PROMPTS` para los tres modos (`analyze`, `review`, `brainstorm`). Exporta los tipos `AiMode` y `AiMessage`.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: El header `anthropic-dangerous-allow-browser: 'true'` es obligatorio para llamadas desde el navegador. Sin él la API rechaza la petición. Verificar que está incluido exactamente como aparece en la spec.

#### Tarea 2: InkSettingsModalComponent
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (crear)
- **Qué hace**: Modal standalone con template inline que usa `InkModalComponent` y `InkButtonComponent`. Campo `[(ngModel)]` para introducir la API key (`type="password"`). Muestra un indicador verde cuando ya hay key guardada, con botón "Eliminar". Output `closed`. Inyecta `AiService` para `saveApiKey` y `clearApiKey`.
- **Depende de**: Tarea 1
- **Riesgo**: `FormsModule` debe incluirse en `imports[]` para que `[(ngModel)]` compile. `InkModalComponent` usa `slot="actions"` via `<ng-container slot="actions">` — respetar exactamente esta sintaxis de slot o los botones no aparecen.

#### Tarea 3: Exponer `insertAtCursor` en TiptapEditorComponent
- **Fichero**: `src/app/features/editor/tiptap/tiptap-editor.component.ts` (modificar)
- **Qué hace**: Añadir el método público `insertAtCursor(text: string): void` al final de la clase. El método verifica que `this.editor` no es null, llama a `this.editor.chain().focus().insertContent(text).run()`.
- **Depende de**: ninguna dependencia previa (modificación aislada)
- **Riesgo**: `this.editor` es privado y se inicializa en `ngAfterViewInit`. El método debe ser defensivo (`if (!this.editor) return`) para no lanzar errores si se invoca antes de que el editor esté listo.

#### Tarea 4: AiAssistantPanelComponent
- **Fichero**: `src/app/features/editor/ai-assistant/ai-assistant-panel.component.ts` (crear — carpeta nueva)
- **Qué hace**: Componente standalone con template inline. Implementa `AfterViewChecked` para auto-scroll. Inputs: `activeDocument: input<DocumentFile | null>(null)`. Outputs: `insertIntoEditor: output<string>()`, `closed: output<void>()`. Signals internos: `activeMode`, `messages`, `streamingContent`, `isStreaming`, `error`, `showSettings`. Método `send()` async que itera el `AsyncGenerator` de `AiService.streamMessage`, actualizando `streamingContent` en cada chunk. Al finalizar mueve el contenido al array `messages`. Renderiza el modal de settings cuando `showSettings()` es true. Construye el contexto del documento con `tiptapToText` y el nombre del proyecto via `ProjectService`.
- **Depende de**: Tarea 1, Tarea 2
- **Riesgo**: `canSend` y `modeDescription` son declarados como propiedades de función (arrow) en la spec — esto evita el error de compilación por arrow functions en templates. No convertirlos a métodos ordinarios con `get`. La constante `modeKeys` debe tipare como `AiMode[]` con `as AiMode[]` para que el `@for` no pierda el tipado. `FormsModule` en `imports[]` para el `[(ngModel)]` del textarea. `shouldScrollToBottom` es una propiedad booleana ordinaria (no signal) que se usa como flag para coordinar el auto-scroll en `ngAfterViewChecked`.

#### Tarea 5: Modificar EditorTopBarComponent
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.ts` (modificar)
- **Qué hace**: Añadir `showAiPanel = input<boolean>(false)` y `aiPanelToggled = output<void>()` a la clase.
- **Depende de**: ninguna dependencia previa (modificación aislada del .ts)
- **Riesgo**: ninguno significativo.

#### Tarea 6: Añadir botón IA en el template de EditorTopBarComponent
- **Fichero**: `src/app/features/editor/top-bar/editor-top-bar.component.html` (modificar)
- **Qué hace**: Insertar, justo después del bloque del botón de toggle panel snapshots (líneas 81-96) y antes del botón de modo focus, un separador `<div class="w-px h-5 bg-ink-border shrink-0"></div>` seguido del botón toggle panel IA que emite `aiPanelToggled` y aplica clases condicionales según `showAiPanel()`.
- **Depende de**: Tarea 5
- **Riesgo**: El binding `[class]` condicional en el botón del panel IA debe usar la misma técnica que ya usa el botón de snapshots: binding de clase por separado con `[class.text-ink-accent]`, `[class.bg-ink-border]`, etc. — NO usar un `[class]` con expresión ternaria que retorne un string largo, porque genera el error conocido de arrow functions/expresiones complejas en templates. Revisar el patrón del botón de snapshots en líneas 86-96 del html actual y replicarlo.

#### Tarea 7: Modificar EditorLayoutComponent — TypeScript
- **Fichero**: `src/app/features/editor/editor-layout.component.ts` (modificar)
- **Qué hace**: 
  1. Añadir import de `ViewChild` y `AiAssistantPanelComponent`.
  2. Añadir `@ViewChild(TiptapEditorComponent) tiptapEditor?: TiptapEditorComponent`.
  3. Añadir signal `showAiPanel = signal(false)`.
  4. Añadir método `onInsertIntoEditor(text: string): void` que delega en `this.tiptapEditor?.insertAtCursor(text)`.
  5. Actualizar `toggleSnapshotsPanel()` para que al abrir snapshots cierre el panel IA: `if (!this.showSnapshotsPanel()) this.showAiPanel.set(false)` antes del update.
  6. Añadir método `toggleAiPanel()` que cierra snapshots al abrir IA: `if (!this.showAiPanel()) this.showSnapshotsPanel.set(false)`, luego `this.showAiPanel.update(v => !v)`.
  7. Actualizar el `@HostListener` para capturar `Ctrl+Shift+A` y llamar a `toggleAiPanel()`.
  8. Añadir `AiAssistantPanelComponent` al array `imports[]` del decorador.
- **Depende de**: Tarea 3, Tarea 4
- **Riesgo**: `ViewChild` ya está importado en Angular core pero no en el fichero actual — verificar los imports al inicio. La key del HostListener para `Ctrl+Shift+A` es `event.key === 'A'` (mayúscula), igual que el shortcut de focus mode usa `event.key === 'F'` (mayúscula). Usar el mismo patrón.

#### Tarea 8: Modificar EditorLayoutComponent — Template
- **Fichero**: `src/app/features/editor/editor-layout.component.html` (modificar)
- **Qué hace**:
  1. Actualizar el binding de `<app-editor-top-bar>` para añadir `[showAiPanel]="showAiPanel()"` y `(aiPanelToggled)="toggleAiPanel()"`.
  2. Reemplazar el bloque del placeholder IA (líneas 85-90 del html actual, el `@else if` que muestra la franja "IA") por la nueva lógica: mostrar `<app-ai-assistant-panel>` cuando `showAiPanel() && !focusMode()`, con franja colapsada cuando ningún panel está abierto. La condición del panel de snapshots también necesita ajuste: mostrar snapshots solo cuando `showSnapshotsPanel() && !focusMode() && activeDocument()`, y el else-if de la franja debe cubrir cuando `!showSnapshotsPanel() && !showAiPanel() && !focusMode()`.
- **Depende de**: Tarea 7
- **Riesgo**: La lógica de visibilidad de la zona derecha tiene tres estados mutuamente excluyentes: (a) panel snapshots abierto, (b) panel IA abierto, (c) franja colapsada. Debe modelarse con `@if / @else if / @else` anidados correctamente. El panel IA recibe `[activeDocument]="activeDocument()"` — usar `activeDocument()` sin `!` (no force-unwrap) porque el panel acepta `null`. El output `(closed)` del panel IA debe llamar a `showAiPanel.set(false)`.

---

### Orden de ejecución

1. Tarea 1 — `AiService` (sin dependencias, base para todo)
2. Tarea 2 — `InkSettingsModalComponent` (depende de AiService)
3. Tarea 3 — `TiptapEditorComponent.insertAtCursor` (sin dependencias externas, aislada)
4. Tarea 4 — `AiAssistantPanelComponent` (depende de Tarea 1 y Tarea 2)
5. Tarea 5 — `EditorTopBarComponent` .ts (sin dependencias externas)
6. Tarea 6 — `EditorTopBarComponent` .html (depende de Tarea 5)
7. Tarea 7 — `EditorLayoutComponent` .ts (depende de Tarea 3 y Tarea 4)
8. Tarea 8 — `EditorLayoutComponent` .html (depende de Tarea 7)

---

### Puntos de atención para el Implementer

**Restricciones explícitas de la spec (Lo que NO hacer):**
- No implementar historial de conversación persistente entre sesiones (el historial vive solo en memoria de la sesión).
- No añadir soporte para adjuntar imágenes o archivos.
- No implementar selector de modelo en esta spec.
- No mostrar tokens usados.

**Gotchas del proyecto:**
- Arrow functions en expresiones de template `[class]` con ternario largo dan error de compilación en zoneless. Si se necesita lógica condicional para clases en el botón del top-bar, usar múltiples `[class.xxx]` individuales igual que hace el botón de snapshots existente.
- `FormsModule` debe estar en `imports[]` de cualquier componente que use `[(ngModel)]` (tanto `InkSettingsModalComponent` como `AiAssistantPanelComponent`).
- El `AiService` usa `localStorage` directamente — compatible con el entorno Tauri porque la webview tiene localStorage. No usar Tauri commands para persistir la API key.
- En `AiAssistantPanelComponent`, la propiedad `canSend` está declarada como arrow function (`canSend = () => ...`) en la spec. Esto es intencional para evitar el error de compilación con expresiones complejas en templates — no refactorizarla como método con `get` ni como método ordinario.
- `shouldScrollToBottom` es un flag booleano ordinario (no signal) porque solo sirve para coordinar entre el ciclo de cambio y `ngAfterViewChecked`. No convertirlo en signal.
- El HostListener de `Ctrl+Shift+A` debe usar `event.key === 'A'` (mayúscula, igual que `'F'` para focus mode). Con Shift activado, `event.key` devuelve la letra en mayúscula.
- Al modificar `toggleSnapshotsPanel()` en el layout, el cierre de paneles debe aplicarse con la lógica "cerrar el otro panel si se va a abrir este". Usar el estado actual (`!this.showSnapshotsPanel()`) para saber si el toggle va a abrir o cerrar.
- La carpeta `src/app/features/editor/ai-assistant/` no existe — crearla al crear el fichero del componente.
- `tiptapToText` ya existe en `src/app/shared/utils/tiptap-to-text.ts` — no reimplementar.
- `InkModalComponent` usa `templateUrl`, no template inline. El slot `slot="actions"` se usa con `<ng-container slot="actions">` — respetar exactamente esta API de slots para que los botones de acción aparezcan en el modal.
