# Plan de implementación — INK-22

### Resumen

Esta spec añade transcripción de audio a Inkwell mediante tres proveedores compatibles con la API de OpenAI Whisper (OpenAI, Groq y servidor local). El trabajo se divide en: ampliar el modelo de datos, crear un servicio de transcripción, crear un modal de transcripción con sus tres ficheros, añadir la subsección de configuración en el modal de settings y conectar el botón de entrada en la nav.

---

### Tareas

#### Tarea 1: Ampliar `project.model.ts` con tipos y campos de transcripción
- **Fichero**: `src/app/core/models/project.model.ts` (modificar)
- **Qué hace**: Añadir el tipo `TranscriptionProvider = 'openai' | 'groq' | 'local'` junto a los tipos `AiProvider` e `ImageProvider` existentes (línea 47). Añadir cinco campos opcionales a `ProjectSettings` tras `imageSize?`: `transcriptionProvider?`, `transcriptionEndpoint?`, `transcriptionApiKey?`, `transcriptionModel?`, `transcriptionLanguage?`. No tocar `DEFAULT_PROJECT_SETTINGS` — todos los campos nuevos son opcionales.
- **Depende de**: ninguna dependencia previa

#### Tarea 2: Crear `TranscriptionService`
- **Fichero**: `src/app/core/services/transcription.service.ts` (crear)
- **Qué hace**: Servicio `providedIn: 'root'` con signals `isTranscribing` y `progress`. Expone `isConfigured(): boolean`, `providerStatusMessage(): string`, `transcribe(filePath): Promise<TranscriptionResult>` y `saveTranscriptionToProject(result): Promise<TreeNode>`. Helpers privados: `getOrCreateTranscriptionsFolder()`, `buildHeaderText()`, `buildTipTapContent()`, `mimeType()`. Exporta también la interfaz `TranscriptionResult` desde el mismo fichero. Inyecta `ProjectService`, `DocumentService` y `TauriBridgeService`.
- **Depende de**: Tarea 1
- **Riesgo**: La llamada HTTP debe usar `fetch` de `@tauri-apps/plugin-http`, NO el `fetch` nativo del navegador. La CSP de Tauri 2.x bloquea el fetch nativo para URLs externas. Importar explícitamente: `import { fetch } from '@tauri-apps/plugin-http'`. Ver patrón idéntico en `ink-settings-modal.component.ts` línea 3.

#### Tarea 3: Crear `TranscriptionModalComponent` — fichero TypeScript
- **Fichero**: `src/app/features/transcription/transcription-modal.component.ts` (crear)
- **Qué hace**: Componente standalone con `selector: 'app-transcription-modal'`, `output closed`, signals `selectedFile`, `fileSizeWarning` y `error`. Métodos `selectFile()`, `transcribe()` y computed `canTranscribe()`. Propiedad de clase simple `selectedLanguage = ''`. Inyecta `TranscriptionService`, `TauriBridgeService`, `ProjectService`, `ToastService` y `Router`. `templateUrl` apunta a `./transcription-modal.component.html`, `styleUrl` a `./transcription-modal.component.css`. Imports del decorador: `InkModalComponent`, `InkButtonComponent`, `FormsModule`.
- **Depende de**: Tarea 2
- **Riesgo**: Template y estilos van OBLIGATORIAMENTE en ficheros externos. La spec muestra template y styles inline — el Implementer debe ignorar eso y usar `templateUrl`/`styleUrl`.

#### Tarea 4: Crear `TranscriptionModalComponent` — fichero HTML
- **Fichero**: `src/app/features/transcription/transcription-modal.component.html` (crear)
- **Qué hace**: Template del modal. Estructura: `<ink-modal>` con bloque de aviso cuando `!svc.isConfigured()`, campo de selección de archivo con botón "Elegir" y advertencia de tamaño, selector de idioma con opciones BCP 47, bloque de spinner mientras `svc.isTranscribing()` que muestra `svc.progress()`, bloque de error, mensaje de proveedor activo, y slot `actions` con botones "Cancelar" y "Transcribir" (deshabilitado cuando `!canTranscribe()`, con loading cuando `svc.isTranscribing()`). Usar clases Tailwind y tokens `--ink-*`, no clases CSS custom para elementos de layout.
- **Depende de**: Tarea 3

#### Tarea 5: Crear `TranscriptionModalComponent` — fichero CSS
- **Fichero**: `src/app/features/transcription/transcription-modal.component.css` (crear)
- **Qué hace**: Define las clases de utilidad locales `.field-label` y `.field-input` usando variables CSS `var(--ink-*)`. Estas clases se usan en el template para los labels e inputs del modal. El fichero puede ser mínimo pero debe existir para que el componente compile sin error de resolución de `styleUrl`.
- **Depende de**: Tarea 4

#### Tarea 6: Modificar `InkSettingsModalComponent` — clase TypeScript
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.ts` (modificar)
- **Qué hace**: Tres cambios en la clase:
  1. Añadir `TranscriptionProvider` al import de `project.model.ts`.
  2. Añadir propiedades de clase simples (no signals): `transcriptionProvider: TranscriptionProvider | '' = ''`, `transcriptionApiKey = ''`, `transcriptionEndpoint = ''`, `transcriptionLanguage = ''`. Mismo patrón que las propiedades `imageProvider`, `imageApiKey`, etc.
  3. En `ngOnInit()`: leer y asignar los cuatro campos nuevos desde `settings` (igual que se hace con `imageProvider` en líneas 123-127).
  4. En `saveAiSettings()`: añadir los cuatro campos nuevos al objeto pasado a `projectService.updateSettings()`. Mantener el cast `as TranscriptionProvider | undefined` para `transcriptionProvider`.
- **Depende de**: Tarea 1

#### Tarea 7: Modificar `InkSettingsModalComponent` — template HTML
- **Fichero**: `src/app/shared/components/ink-settings-modal.component.html` (modificar)
- **Qué hace**: Añadir una nueva subsección "Transcripción de audio" inmediatamente después del bloque `</div>` de cierre de la subsección de imágenes (tras la línea 332 del HTML actual), y antes del botón "Guardar configuración de IA". La subsección contiene: selector de proveedor (`[(ngModel)]="transcriptionProvider"`), campo de API key condicional cuando proveedor es `openai` o `groq`, campo de URL condicional cuando proveedor es `local`, y selector de idioma por defecto. Todos los inputs usan las mismas clases Tailwind que el resto del formulario (no clases CSS custom).
- **Depende de**: Tarea 6
- **Riesgo**: La spec incluye un error tipográfico en el template de ejemplo: `@if (transcriptionProvider === 'local'"` (comilla doble de cierre incorrecta). El Implementer debe corregirlo a `@if (transcriptionProvider === 'local')`.

#### Tarea 8: Modificar `InkNavComponent` — clase TypeScript
- **Fichero**: `src/app/shared/components/ink-nav.component.ts` (modificar)
- **Qué hace**: Cuatro cambios:
  1. Importar `TranscriptionService` desde `../../core/services/transcription.service`.
  2. Importar `TranscriptionModalComponent` desde `../../features/transcription/transcription-modal.component`.
  3. Añadir `TranscriptionModalComponent` al array `imports` del decorador.
  4. En la clase: `protected transcriptionSvc = inject(TranscriptionService)` y `showTranscription = signal(false)`.
- **Depende de**: Tarea 3

#### Tarea 9: Modificar `InkNavComponent` — template HTML
- **Fichero**: `src/app/shared/components/ink-nav.component.html` (modificar)
- **Qué hace**: Dos adiciones:
  1. Botón de micrófono: insertar tras el bloque del botón de Consistency checker (tras la línea 229 del HTML actual), dentro del mismo patrón `@if (projectService.isLoaded())`. El botón aplica la clase `text-ink-warning` condicionalmente cuando `!transcriptionSvc.isConfigured()`. SVG de micrófono inline con los paths especificados en la spec.
  2. Modal: insertar el bloque `@if (showTranscription()) { <app-transcription-modal ... /> }` junto al resto de modales al final del template (antes del bloque del toggle de tema).
- **Depende de**: Tarea 8

---

### Orden de ejecución

1. Tarea 1 — Modelo de datos (`project.model.ts`)
2. Tarea 2 — `TranscriptionService`
3. Tarea 3 — `TranscriptionModalComponent` (.ts)
4. Tarea 4 — `TranscriptionModalComponent` (.html)
5. Tarea 5 — `TranscriptionModalComponent` (.css)
6. Tarea 6 — `InkSettingsModalComponent` (.ts)
7. Tarea 7 — `InkSettingsModalComponent` (.html)
8. Tarea 8 — `InkNavComponent` (.ts)
9. Tarea 9 — `InkNavComponent` (.html)

---

### Puntos de atención para el Implementer

**Fetch nativo prohibido.**
`TranscriptionService` debe importar `fetch` de `@tauri-apps/plugin-http`, no usar el global. La CSP de Tauri 2.x bloquea el fetch nativo para dominios externos. El patrón ya existe en `ink-settings-modal.component.ts` (línea 3). Si se usa el fetch nativo, las llamadas a `api.openai.com` y `api.groq.com` fallarán en producción sin error claro en desarrollo.

**Template y estilos en ficheros externos.**
`TranscriptionModalComponent` debe usar `templateUrl` y `styleUrl`, nunca `template` ni `styles` inline. La spec muestra los tres en un solo fichero — eso es solo para ilustrar el contenido; el Implementer debe repartirlos en tres ficheros separados conforme a la convención del proyecto.

**Error tipográfico en la spec.**
El bloque `@if (transcriptionProvider === 'local'"` en la spec tiene una comilla doble errónea. Corregir a `@if (transcriptionProvider === 'local')` en la Tarea 7.

**`readFileBytes` ya existe.**
`TauriBridgeService.readFileBytes()` y el comando Rust `read_file_bytes` están implementados desde INK-12. No añadir nada en Rust ni en `TauriBridgeService`.

**Directorio `features/transcription` no existe.**
El Implementer debe crear el directorio `src/app/features/transcription/` antes de crear los tres ficheros del modal. Verificar con `ls` antes de escribir.

**Propiedades de clase simples en settings, no signals.**
Las propiedades `transcriptionProvider`, `transcriptionApiKey`, `transcriptionEndpoint` y `transcriptionLanguage` en `InkSettingsModalComponent` deben ser propiedades de clase simples con `[(ngModel)]`, igual que `imageProvider` y sus hermanas. No usar `signal()` para estas propiedades.

**Visibilidad de `transcriptionSvc` en nav.**
La spec declara `private transcriptionSvc`. Sin embargo, como se accede desde el template (para `transcriptionSvc.isConfigured()`), debe ser `protected`, no `private`. Mismo patrón que `consistencySvc` en la línea 30 del `.ts` actual.

**Lo que NO hacer (restricciones de spec):**
- No implementar transcripción desde micrófono directo.
- No fragmentar archivos mayores de 25MB automáticamente.
- No añadir preview de audio en el modal.
- No soportar transcripción en batch de múltiples archivos.
