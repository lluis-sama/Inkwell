# Plan: Testing del frontend Angular con Vitest

## Context

El frontend Angular 20 (zoneless + signals) no tiene tests operativos. Existe un fichero `ai.service.spec.ts` en sintaxis Jasmine (sin runner configurado) que se eliminará. El objetivo es partir de cero con Vitest: configurar la infraestructura y escribir specs nuevos para los tres servicios con más lógica de negocio.

`@angular/build@20.3.25` incluye el builder experimental `unit-test` con `runner: "vitest"` nativo, lo que evita configuración externa compleja.

---

## Scope

| Tarea | Fichero(s) | Descripción |
|---|---|---|
| 1 | `package.json`, `angular.json`, `tsconfig.spec.json` | Setup Vitest + borrar spec Jasmine |
| 2 | `ai.service.spec.ts` | Nuevo spec (AiService + ProjectService.closeProject) |
| 3 | `project.service.spec.ts` | Funciones puras del árbol + señales del servicio |
| 4 | `app-config.service.spec.ts` | load, persist, mutaciones de config |

---

## Tarea 1 — Setup de infraestructura

### 1a. Instalar Vitest
```bash
pnpm add -D vitest@^3.1.1
```

### 1b. `tsconfig.spec.json`
Cambiar `types: ["jasmine"]` → `types: ["vitest/globals"]`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

### 1c. `angular.json`
Añadir target `"test"` en `projects.inkwell.architect`:
```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "runner": "vitest",
    "tsConfig": "tsconfig.spec.json"
  }
}
```

### 1d. `package.json`
Añadir scripts:
```json
"test": "ng test",
"test:ci": "ng test --watch=false"
```

### 1e. Borrar spec Jasmine existente
```bash
rm src/app/core/services/ai.service.spec.ts
```

### 1f. Verificación de infraestructura
```bash
pnpm test --watch=false
```
Debe arrancar Vitest sin errores (sin specs todavía). Si `describe`/`it`/`expect` no se resuelven como globales, crear un `vitest.config.ts` mínimo en la raíz:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true } });
```

---

## Patrón de mocks en Vitest

En todos los specs, el mock de `TauriBridgeService` sigue este patrón:
```typescript
const mockBridge = {
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn().mockResolvedValue(undefined),
  folderExists: vi.fn().mockResolvedValue(true),
  createFolder: vi.fn().mockResolvedValue(undefined),
} as unknown as TauriBridgeService;

TestBed.configureTestingModule({
  providers: [
    ServiceBajoPrueba,
    { provide: TauriBridgeService, useValue: mockBridge },
  ],
});
```
Sin `provideZonelessChangeDetection()` en TestBed (no es necesario con Angular 20 + Vitest).

---

## Tarea 2 — `ai.service.spec.ts` (nuevo)

**Fichero a crear**: `src/app/core/services/ai.service.spec.ts`

Mock: `TauriBridgeService` con `readJsonFile`, `writeJsonFile`, `folderExists`, `createFolder`.
Providers: `AiService` + `ProjectService` (requerido por la dependencia circular via Injector).

| Test | Qué verifica |
|---|---|
| `loadSession()` restaura mensajes | Mock devuelve sesión JSON con projectId correcto → `messages()` y `currentMode()` se restauran |
| `loadSession()` sin fichero no lanza | Mock rechaza con error → `messages()` queda vacío, `currentMode()` = `'analyze'` |
| `loadSession()` ignora projectId diferente | Sesión con otro projectId → estado queda en defaults |
| `clearSession()` vacía messages | Setear messages, llamar `clearSession` → `messages()` = `[]` |
| `clearSession()` persiste | `writeJsonFile` llamado con la ruta `ai_session.json` |
| `closeProject()` limpia AiService | Setear messages, llamar `projectService.closeProject()` → `aiService.messages()` = `[]` |

---

## Tarea 3 — `project.service.spec.ts` (nuevo)

**Fichero a crear**: `src/app/core/services/project.service.spec.ts`

### Bloque A: funciones puras del árbol (sin TestBed, sin mocks)

```typescript
import { insertNode, deleteNode, findNode, insertAfter, isDescendant } from './project.service';
```

| Test | Función | Qué verifica |
|---|---|---|
| inserta en raíz | `insertNode` | Nodo añadido al array raíz cuando parentId es el id de un nodo raíz |
| inserta en carpeta anidada | `insertNode` | Nodo añadido como hijo de carpeta en profundidad 2 |
| lanza al insertar en documento | `insertNode` | `throw Error` al añadir hijo a nodo tipo `document` |
| elimina en raíz | `deleteNode` | Nodo de nivel 0 desaparece del array |
| elimina en profundidad 2 | `deleteNode` | Nodo anidado eliminado sin afectar hermanos |
| encuentra nodo | `findNode` | Retorna el nodo con el id buscado |
| devuelve null si no existe | `findNode` | Retorna `null` |
| isDescendant true | `isDescendant` | Nodo dentro de carpeta ancestro → `true` |
| isDescendant false | `isDescendant` | Nodo hermano o raíz → `false` |

### Bloque B: ProjectService — señales (con TestBed)

Mock: `TauriBridgeService` + `AppConfigService`. Incluir `AiService` en providers.

| Test | Qué verifica |
|---|---|
| `isLoaded()` false al inicio | `project()` = null → `isLoaded()` = false |
| `isLoaded()` true tras `openProject` | `readJsonFile` devuelve Project JSON → `isLoaded()` = true |
| `totalWordCount()` suma correctamente | `project.wordCountCache = {a: 100, b: 200}` → `totalWordCount()` = 300 |
| `closeProject()` limpia señales | `project()` y `basePath()` quedan en null |

---

## Tarea 4 — `app-config.service.spec.ts` (nuevo)

**Fichero a crear**: `src/app/core/services/app-config.service.spec.ts`

Mock: `TauriBridgeService` con `readAppConfig` y `writeAppConfig`.
```typescript
const mockBridge = {
  readAppConfig: vi.fn(),
  writeAppConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as TauriBridgeService;
```

| Test | Qué verifica |
|---|---|
| `load()` con JSON válido | Parsea y setea `config()` con los valores correctos |
| `load()` con string vacío | Usa `DEFAULT_APP_CONFIG`; llama `writeAppConfig` (persiste en primer arranque) |
| `load()` con error de I/O | No lanza; `config()` queda con defaults |
| `setApiKey()` actualiza signal | `config().apiKey` refleja el nuevo valor |
| `setApiKey()` llama writeAppConfig | `mockBridge.writeAppConfig` llamado con JSON que contiene la key |
| `addRecentProject()` añade al frente | Proyecto nuevo en `config().recentProjects[0]` |
| `addRecentProject()` deduplica | Mismo `basePath` dos veces → solo aparece una vez |
| `addLtDisabledRule()` deduplica | Mismo ruleId dos veces → solo aparece una vez en la lista |

---

## Ficheros a modificar / crear / borrar

| Acción | Fichero |
|---|---|
| Instalar | `vitest@^3.1.1` (devDependency) |
| Modificar | `tsconfig.spec.json` |
| Modificar | `angular.json` |
| Modificar | `package.json` |
| Borrar | `src/app/core/services/ai.service.spec.ts` (Jasmine) |
| Crear | `src/app/core/services/ai.service.spec.ts` (nuevo, Vitest) |
| Crear | `src/app/core/services/project.service.spec.ts` |
| Crear | `src/app/core/services/app-config.service.spec.ts` |

---

## Verificación final

```bash
pnpm test --watch=false
```

- Total esperado: ~23 tests (6 AiService + 9 ProjectService + 8 AppConfig), 0 fallos
- Sin errores TypeScript (`vitest/globals` resuelve `describe`/`it`/`vi`/`expect`)
- Ningún test accede a disco ni red real
