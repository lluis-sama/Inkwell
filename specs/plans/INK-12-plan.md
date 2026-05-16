## Plan de implementación — INK-12

### Resumen

Se añade soporte para importar documentos TXT, Markdown y DOCX al proyecto activo. El flujo implica dos nuevos comandos Tauri (diálogo de selección multi-fichero y lectura de bytes binarios), dos nuevos métodos en `TauriBridgeService`, un nuevo `ImportService` que convierte cada formato a TipTap JSON, y un botón de importación en el binder que invoca el servicio y abre el primer documento importado en el editor. Hay un problema de incompatibilidad entre la spec y el `ToastService` existente que se resuelve en la Tarea 7.

---

### Tareas

#### Tarea 1: Instalar dependencias npm
- **Fichero**: `package.json` / `pnpm-lock.yaml` (modificar via CLI)
- **Qué hace**: Ejecutar `pnpm add mammoth marked` para añadir las dos nuevas dependencias de conversión de formato.
- **Depende de**: ninguna dependencia previa
- **Riesgo**: `mammoth` es una librería CommonJS. Verificar que el bundler (Vite) la resuelve correctamente. Si hay errores de "named exports", puede ser necesario añadirla a `optimizeDeps.include` en `vite.config.ts`.

#### Tarea 2: Añadir comandos Rust a `fs_commands.rs`
- **Fichero**: `src-tauri/src/commands/fs_commands.rs` (modificar — añadir al final del fichero)
- **Qué hace**: Añadir los dos comandos Tauri nuevos: `open_files_dialog` (diálogo de selección de uno o varios ficheros con filtro por extensión) y `read_file_bytes` (lectura de fichero como Vec<u8>).
- **Depende de**: Tarea 1 (sin bloqueo real — son independientes; puede ejecutarse en paralelo)
- **Riesgo**: El bloque `if multiple` en `open_files_dialog` de la spec tiene un `return` dentro del `if` y otro flujo fuera, lo que produce código inalcanzable para la rama `multiple = true` (la variable `rx` nunca se espera en esa rama). El Implementer debe reestructurar para que ambas ramas funcionen correctamente: la rama `multiple = true` debe usar `rx.await`, y la rama `multiple = false` debe usar `rx2.await`. La spec tiene un bug lógico aquí — el `pick_files` llama a `builder.pick_files(...)` pero `builder` ya consumió el filtro; verificar que el patrón de `oneshot` es correcto para ambas ramas. Revisar el código existente de `open_folder_dialog` y `save_file_dialog` como referencia de cómo se hace correctamente en este proyecto.

#### Tarea 3: Registrar los comandos nuevos en `lib.rs`
- **Fichero**: `src-tauri/src/lib.rs` (modificar — añadir dos entradas al `invoke_handler`)
- **Qué hace**: Añadir `commands::fs_commands::open_files_dialog` y `commands::fs_commands::read_file_bytes` a la lista del `tauri::generate_handler![]`.
- **Depende de**: Tarea 2 (los símbolos deben existir antes de registrarlos)

#### Tarea 4: Añadir métodos a `TauriBridgeService`
- **Fichero**: `src/app/core/services/tauri-bridge.service.ts` (modificar — añadir dos métodos al final de la clase)
- **Qué hace**: Añadir `openFilesDialog(extensions: string[], multiple = false): Promise<string[]>` y `readFileBytes(path: string): Promise<number[]>`. Son wrappers de `invoke` como los existentes.
- **Depende de**: Tarea 3 (los comandos Rust deben existir para que el invoke funcione en runtime, aunque TypeScript compila independientemente)

#### Tarea 5: Verificar tipo de retorno de `mammoth` en el entorno
- **Fichero**: ninguno (verificación de compatibilidad)
- **Qué hace**: Antes de escribir `ImportService`, el Implementer debe comprobar que `import mammoth from 'mammoth'` resuelve correctamente y que `mammoth.convertToHtml` existe en el módulo. Ejecutar `pnpm tsc --noEmit` o simplemente leer las typings en `node_modules/mammoth/types/mammoth.d.ts`. Si el import falla, usar `import * as mammoth from 'mammoth'` en su lugar. Hacer lo mismo con `marked`: verificar que `marked(raw, { async: false }) as string` retorna `string` sin error de tipos con la versión instalada. En `marked` v15+ el segundo parámetro de opciones ha cambiado — puede ser necesario usar `marked.parse(raw)` en lugar de `marked(raw, { async: false })`.
- **Depende de**: Tarea 1
- **Riesgo**: Las APIs de `mammoth` y `marked` varían entre versiones. Esta tarea evita que el Implementer escriba código que no compila.

#### Tarea 6: Crear `ImportService`
- **Fichero**: `src/app/core/services/import.service.ts` (crear)
- **Qué hace**: Implementar el servicio de importación con tres métodos privados de conversión (`importTxt`, `importMarkdown`, `importDocx`) y los métodos públicos `openAndImport` e `importFile`. Notar los siguientes ajustes respecto a la spec:
  - `importTxt` llama a `this.bridge.readJsonFile(filePath)` — correcto, porque `readJsonFile` lee texto plano (el nombre es un legado de specs anteriores pero el comando Rust es `fs::read_to_string`).
  - `importMarkdown` usa la API de `marked` verificada en Tarea 5.
  - `importDocx` usa `this.bridge.readFileBytes(filePath)` y convierte el array de números a `Uint8Array` antes de pasarlo a `mammoth`.
  - El método `openAndImport` llama a `this.toast.error(...)` para errores individuales — compatible con el `ToastService` existente.
  - El método **no** llama a `this.toast.show(..., 'warning', 6000)` — esa llamada debe hacerse con `this.toast.error(...)` o un patrón compatible (ver Tarea 7).
- **Depende de**: Tarea 4, Tarea 5
- **Riesgo**: `generateJSON` de `@tiptap/core` necesita extensiones registradas para parsear el HTML correctamente. Usar `[StarterKit]` como en la spec. Verificar que `@tiptap/core` v3 exporta `generateJSON` — en v2 era diferente. Buscar el import correcto en los usages existentes del proyecto antes de escribir.

#### Tarea 7: Adaptar llamada a `ToastService` en `BinderComponent`
- **Fichero**: Documentar la incompatibilidad antes de tocar el binder
- **Qué hace**: El `ToastService` actual tiene solo los métodos `success(message)` y `error(message)`. La spec llama a `this.toast.show(..., 'warning', 6000)` que no existe. Hay dos opciones:
  - **Opción A (recomendada)**: En `importDocuments()` del binder, sustituir la llamada `warning` por `this.toast.success(...)` con un mensaje que mencione las advertencias (p.ej. "Importado. Puede que el formato complejo no se haya convertido perfectamente.").
  - **Opción B**: Añadir un método `warning(message: string, duration?: number)` al `ToastService` y un tipo `'warning'` al `Toast` interface. Implica también modificar el componente de toasts en la UI para que renderice el estilo amarillo.
  - El Implementer debe elegir Opción A salvo que el usuario haya solicitado explícitamente el tipo `warning` en la UI de toasts.
- **Depende de**: ninguna dependencia previa (es una decisión antes de Tarea 8)

#### Tarea 8: Modificar `BinderComponent` — lógica TypeScript
- **Fichero**: `src/app/features/editor/binder/binder.component.ts` (modificar)
- **Qué hace**: Añadir las siguientes modificaciones a la clase `BinderComponent`:
  1. Import de `ImportService` y `ToastService`.
  2. Inyección: `private importService = inject(ImportService)` y `private toast = inject(ToastService)`.
  3. Signal: `importing = signal(false)`.
  4. Método `async importDocuments(): Promise<void>` con el flujo descrito en la spec, usando la adaptación de toast de Tarea 7.
  - Notar que `findNode` ya está importado de `project.service` en el binder (línea 3 del fichero actual). No reimportar.
  - El método `importDocuments` puede llamar a `findNode(this.projectService.project()?.tree ?? [], first.documentId)` directamente.
- **Depende de**: Tarea 6, Tarea 7

#### Tarea 9: Modificar `binder.component.html` — botón de importación
- **Fichero**: `src/app/features/editor/binder/binder.component.html` (modificar)
- **Qué hace**: Añadir el botón de importación en el `<div class="flex gap-1">` del header (líneas 11-41 del fichero actual), junto a los botones de "Nuevo documento" y "Nueva carpeta". El botón muestra un spinner animado cuando `importing()` es `true` y el icono de subida cuando es `false`.
- **Depende de**: Tarea 8 (el signal `importing` y el método `importDocuments` deben existir en la clase)

---

### Orden de ejecución

1. Tarea 1 — Instalar dependencias npm (`mammoth`, `marked`)
2. Tarea 2 — Añadir comandos Rust en `fs_commands.rs`
3. Tarea 3 — Registrar comandos en `lib.rs`
4. Tarea 4 — Añadir métodos a `TauriBridgeService`
5. Tarea 5 — Verificar APIs de `mammoth` y `marked` (tipos y versión)
6. Tarea 6 — Crear `ImportService`
7. Tarea 7 — Decidir la estrategia de `toast.show` / `warning`
8. Tarea 8 — Modificar `BinderComponent` TypeScript
9. Tarea 9 — Modificar `binder.component.html`

---

### Puntos de atención para el Implementer

**Convenciones del proyecto:**
- `TauriBridgeService` es el único lugar con `import { invoke }`. No importar `invoke` directamente en `ImportService` ni en ningún otro sitio.
- `ImportService` se añade en `src/app/core/services/` (junto a `document.service.ts`, `board.service.ts`, etc.), no en `shared/`.
- No añadir `ImportService` al barrel `src/app/core/services/index.ts` salvo que ya exista ese patrón para todos los servicios — verificar antes.
- Standalone: el componente `BinderComponent` no declara un NgModule. No modificar esa parte.
- Signals: `importing` es un `signal(false)`, no un `BehaviorSubject`.

**Bug en la spec (Rust `open_files_dialog`):**
La implementación del comando para `multiple = true` en la spec tiene un problema estructural: la variable `builder` ya llama a `pick_files` pero el oneshot `rx` nunca se consuma en esa rama porque hay un `return` dentro del bloque `if multiple`. Revisar y corregir la lógica de flujo para que ambas ramas (`multiple = true` y `multiple = false`) funcionen correctamente con sus respectivos canales oneshot.

**Bug en la spec (ToastService `warning`):**
La spec llama a `this.toast.show(..., 'warning', 6000)` en `BinderComponent`. El `ToastService` actual solo tiene `success()` y `error()`. El método `show()` es privado. Resolver en Tarea 7 antes de implementar Tarea 8.

**Versión de `marked`:**
En versiones recientes de `marked` (v9+), la función es asíncrona por defecto y `marked(raw, { async: false })` puede retornar `string | Promise<string>`. Lo más seguro es usar `marked.parse(raw)` que retorna `string` de forma síncrona. Verificar la versión instalada con `pnpm list marked` tras Tarea 1.

**Versión de `@tiptap/core` y `generateJSON`:**
El proyecto usa `@tiptap/core` v3. En v3, `generateJSON` se importa de `@tiptap/core`. Confirmar que la función existe en esa versión antes de usarla.

**`readJsonFile` para TXT y MD:**
La spec usa `this.bridge.readJsonFile(filePath)` para leer ficheros TXT y MD. Esto es correcto porque `readJsonFile` simplemente lee texto plano con `fs::read_to_string` en Rust — el nombre es engañoso pero funciona para cualquier texto UTF-8. No crear un comando Rust adicional para texto plano.

**Nombre del parámetro en el invoke de `read_file_bytes`:**
En `TauriBridgeService.readFileBytes`, el parámetro de `invoke` debe ser `{ path }` para que coincida con el nombre del parámetro Rust (`path: String`). Verificar que la convención de camelCase/snake_case del invoke está alineada con el resto de métodos del servicio.
