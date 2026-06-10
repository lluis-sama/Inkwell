# INK-35 — Atajos de Puntuación Literaria Española

## 1. Motivación

Los escritores que usan Inkwell para prosa en español necesitan acceso ágil a las comillas españolas («»)
y la raya (—). Los flujos actuales (copiar/pegar, mapa de caracteres) interrumpen la escritura. Esta
feature introduce atajos de teclado configurables con lógica contextual para no romper el ritmo del autor.

---

## 2. Comportamiento Nuevo

### 2.1 Comillas españolas

| Condición | Carácter insertado |
|---|---|
| No hay `«` sin cerrar en la ventana de contexto antes del cursor | `«` (apertura, U+00AB) |
| Hay un `«` sin cierre en la ventana de contexto antes del cursor | `»` (cierre, U+00BB) |

- El atajo por defecto es **Left Ctrl + Shift + tecla `<`/`>`** en Windows/Linux, y **Cmd + Shift + tecla `<`/`>`** en macOS (`code: 'IntlBackslash'` — tecla ISO entre Left Shift y Z en teclado español). En teclados ANSI (US) esta tecla no existe y el usuario debe configurar un atajo alternativo.
- La detección escanea hacia atrás desde el cursor hasta un máximo de `quoteLookbackChars` caracteres (default: 800).
- Si hay selección activa, se reemplaza por el carácter resultante.

### 2.2 Raya de diálogo

- Siempre inserta `—` (U+2014).
- El atajo por defecto es **Left Ctrl + Shift + tecla `-`** en Windows/Linux, y **Cmd + Shift + tecla `-`** en macOS (`code: 'Minus'`).
- Si hay selección activa, se reemplaza.

### 2.3 Habilitación

- La feature está **activa por defecto** (opt-out).
- Cuando está deshabilitada, los eventos se pasan a través sin interceptación.

---

## 3. Arquitectura

La feature **no usa el sistema de shortcuts de TipTap/ProseMirror** (`addKeyboardShortcuts`) porque ese
sistema no distingue Ctrl izquierdo/derecho ni trabaja con `event.code`. En su lugar se usa un listener
nativo sobre el DOM del editor.

```
LiteraryPunctuationSettingsService   (Angular, injectable)
        │  proporciona config como Signal
        ▼
LiteraryPunctuationExtension         (TipTap Extension)
        │  registra/elimina listener nativo en onCreate/onDestroy
        │  listener sobre editor.view.dom (no global)
        ▼
  smartQuoteDirection()              (función pura, sin side-effects)
  insertSmartQuote()
  insertEmDash()                     (helpers de ProseMirror transaction)
```

El listener se adjunta a `editor.view.dom` y no al `document`, por lo que **sólo actúa cuando el editor
tiene el foco**, sin contaminar otros inputs de la app (títulos, El Cajón, etc.). Cada instancia del editor
recibe su propia instancia de la extensión con su propio listener.

---

## 4. Interfaces TypeScript

```typescript
// src/app/features/editor/literary-punctuation/literary-punctuation.types.ts

export type CtrlRequirement =
  | 'left'    // sólo Left Ctrl  (DOM_KEY_LOCATION_LEFT  = 1)
  | 'right'   // sólo Right Ctrl (DOM_KEY_LOCATION_RIGHT = 2)
  | 'any';    // cualquier Ctrl

export interface LiteraryShortcutTrigger {
  /** KeyboardEvent.code — independiente del layout de teclado */
  code: string;
  ctrl: CtrlRequirement;
  /** Tecla Cmd en macOS (event.metaKey). Cuando es true, ctrl se ignora. */
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

export interface LiteraryPunctuationConfig {
  enabled: boolean;
  quoteShortcut: LiteraryShortcutTrigger;
  dashShortcut: LiteraryShortcutTrigger;
  /**
   * Caracteres hacia atrás desde el cursor que se escanean para detectar
   * comillas sin cerrar. Cubre varios párrafos de diálogo sin coste
   * apreciable de rendimiento. Min: 100, Max: 5000. Default: 800.
   */
  quoteLookbackChars: number;
}

/**
 * Defaults conscientes de la plataforma.
 * - macOS: Cmd (Meta) + Shift, ya que Ctrl no es el modificador primario.
 * - Windows / Linux: Left Ctrl + Shift.
 * Si la tecla IntlBackslash no existe (teclado ANSI), el atajo simplemente
 * no disparará hasta que el usuario lo configure manualmente en Settings.
 */
export function getLiteraryPunctuationDefaults(): LiteraryPunctuationConfig {
  const isMac =
    navigator.platform.startsWith('Mac') ||
    navigator.userAgent.includes('Macintosh');

  const shortcut = (code: string): LiteraryShortcutTrigger => ({
    code,
    ctrl: isMac ? 'any' : 'left',
    meta: isMac,
    shift: true,
    alt: false,
  });

  return {
    enabled: true,
    quoteShortcut: shortcut('IntlBackslash'),
    dashShortcut:  shortcut('Minus'),
    quoteLookbackChars: 800,
  };
}
```

---

## 5. Servicio de configuración

```typescript
// src/app/features/editor/literary-punctuation/literary-punctuation-settings.service.ts

@Injectable({ providedIn: 'root' })
export class LiteraryPunctuationSettingsService {
  private readonly _config = signal<LiteraryPunctuationConfig>(
    getLiteraryPunctuationDefaults()
  );

  readonly config = this._config.asReadonly();

  /** Carga la config desde el almacén de settings de la app al arrancar */
  load(stored: Partial<LiteraryPunctuationConfig>): void {
    this._config.set({ ...getLiteraryPunctuationDefaults(), ...stored });
  }

  update(patch: Partial<LiteraryPunctuationConfig>): void {
    this._config.update(current => ({ ...current, ...patch }));
    // persistir en el almacén de settings de Inkwell
  }

  updateShortcut(
    key: 'quoteShortcut' | 'dashShortcut',
    trigger: Partial<LiteraryShortcutTrigger>
  ): void {
    this._config.update(current => ({
      ...current,
      [key]: { ...current[key], ...trigger },
    }));
    // persistir
  }
}
```

---

## 6. TipTap Extension

```typescript
// src/app/features/editor/literary-punctuation/literary-punctuation.extension.ts

import { Extension } from '@tiptap/core';
import { matchesTrigger, insertSmartQuote, insertEmDash } from './literary-punctuation.helpers';
import type { LiteraryPunctuationConfig } from './literary-punctuation.types';

export interface LiteraryPunctuationExtensionOptions {
  config: LiteraryPunctuationConfig;
}

export const LiteraryPunctuationExtension =
  Extension.create<LiteraryPunctuationExtensionOptions>({
    name: 'literaryPunctuation',

    onCreate() {
      const handler = (event: KeyboardEvent) => {
        if (!this.options.config.enabled) return;

        const { quoteShortcut, dashShortcut } = this.options.config;

        if (matchesTrigger(event, quoteShortcut)) {
          event.preventDefault();
          event.stopPropagation();
          insertSmartQuote(this.editor);
          return;
        }

        if (matchesTrigger(event, dashShortcut)) {
          event.preventDefault();
          event.stopPropagation();
          insertEmDash(this.editor);
        }
      };

      this.editor.view.dom.addEventListener('keydown', handler);
      (this as any)._literaryHandler = handler;
    },

    onDestroy() {
      const handler = (this as any)._literaryHandler;
      if (handler) {
        this.editor.view.dom.removeEventListener('keydown', handler);
      }
    },
  });
```

---

## 7. Funciones auxiliares

```typescript
// src/app/features/editor/literary-punctuation/literary-punctuation.helpers.ts

import type { Editor } from '@tiptap/core';
import {
  getLiteraryPunctuationDefaults,
  type LiteraryPunctuationConfig,
  type LiteraryShortcutTrigger,
} from './literary-punctuation.types';

const DOM_KEY_LOCATION_LEFT  = 1;
const DOM_KEY_LOCATION_RIGHT = 2;

export function matchesTrigger(
  event: KeyboardEvent,
  trigger: LiteraryShortcutTrigger
): boolean {
  if (event.code !== trigger.code)       return false;
  if (event.shiftKey !== trigger.shift)  return false;
  if (event.altKey   !== trigger.alt)    return false;
  if (event.metaKey  !== trigger.meta)   return false;

  // En macOS el modificador es Meta (Cmd); Ctrl no es necesario
  if (trigger.meta) return true;

  if (!event.ctrlKey) return false;

  switch (trigger.ctrl) {
    case 'left':  return event.location === DOM_KEY_LOCATION_LEFT;
    case 'right': return event.location === DOM_KEY_LOCATION_RIGHT;
    case 'any':   return true;
  }
}

/**
 * Escanea hacia atrás desde el cursor hasta quoteLookbackChars caracteres.
 * Si hay más «» abiertas que cerradas → insertar cierre; si no → apertura.
 */
export function smartQuoteDirection(editor: Editor): 'open' | 'close' {
  const { doc, selection } = editor.state;

  const config = editor.extensionManager.extensions
    .find(e => e.name === 'literaryPunctuation')
    ?.options?.config as LiteraryPunctuationConfig | undefined;

  const lookback = config?.quoteLookbackChars
    ?? getLiteraryPunctuationDefaults().quoteLookbackChars;

  const scanFrom   = Math.max(0, selection.from - lookback);
  const textWindow = doc.textBetween(scanFrom, selection.from, '\n', ' ');

  const openCount  = (textWindow.match(/«/g) ?? []).length;
  const closeCount = (textWindow.match(/»/g) ?? []).length;

  return openCount > closeCount ? 'close' : 'open';
}

export function insertSmartQuote(editor: Editor): void {
  const char = smartQuoteDirection(editor) === 'open' ? '«' : '»';
  editor.commands.insertContent(char);
}

export function insertEmDash(editor: Editor): void {
  editor.commands.insertContent('—');
}

// ---------------------------------------------------------------------------
// Helpers de presentación (usados por toolbar y Settings)
// ---------------------------------------------------------------------------

export function formatShortcutLabel(trigger: LiteraryShortcutTrigger): string {
  const parts: string[] = [];
  if (trigger.meta)                    parts.push('⌘');
  if (!trigger.meta && trigger.ctrl)   parts.push('Ctrl');
  if (trigger.shift)                   parts.push('Shift');
  if (trigger.alt)                     parts.push('Alt');
  parts.push(friendlyKeyName(trigger.code));
  return parts.join('+');
}

function friendlyKeyName(code: string): string {
  const map: Record<string, string> = {
    IntlBackslash: '<>',
    Minus: '-',
  };
  return map[code] ?? code;
}
```

---

## 8. Integración en el componente de editor

Inyectar `LiteraryPunctuationSettingsService` y pasar la config a la extensión. Un `effect` observa
cambios en la config y actualiza las opciones de la extensión en caliente:

```typescript
// Fragmento del componente Angular que instancia TipTap

readonly #literarySettings = inject(LiteraryPunctuationSettingsService);

// En el effect que construye/reconfigura el editor:
effect(() => {
  const config = this.#literarySettings.config();
  if (this.editor) {
    this.editor.setOptions({
      extensions: this.buildExtensions(config),
    });
  }
});

private buildExtensions(config: LiteraryPunctuationConfig): Extensions {
  return [
    // ...extensiones existentes...
    LiteraryPunctuationExtension.configure({ config }),
  ];
}
```

> **Nota:** Si la actualización en caliente de extensiones resulta problemática con la versión de TipTap
> en uso, la alternativa válida es destruir y recrear el editor cuando cambie la config de shortcuts.
> Esta acción es infrecuente y el coste para el usuario es imperceptible.

---

## 9. Persistencia en Settings

Añadir el campo al esquema de configuración de la app:

```typescript
// Añadir al tipo/interfaz de AppSettings existente:
literaryPunctuation?: Partial<LiteraryPunctuationConfig>;
```

Al cargar la app, pasar el valor almacenado a `LiteraryPunctuationSettingsService.load()`.
Al modificar desde Settings, llamar a `update()` o `updateShortcut()`.

El campo es opcional con `?`: si no existe (instalaciones previas) se aplican los defaults sin ninguna
migración necesaria.

---

## 10. UI de Configuración

Nueva sección en **Ajustes › Editor › Puntuación literaria**:

| Control | Descripción |
|---|---|
| Toggle *Activar atajos de puntuación literaria* | Mapea a `config.enabled` |
| Capturador de atajo — Comillas españolas | Muestra atajo actual; permite grabar nuevo (`code` + modificadores, incluido Left/Right Ctrl) |
| Capturador de atajo — Raya de diálogo | Ídem |
| Número *Ventana de detección (caracteres)* | Mapea a `quoteLookbackChars`; min 100, max 5000 |
| Botón *Restaurar por defecto* | Llama a `getLiteraryPunctuationDefaults()` y aplica el resultado |

El capturador de atajo escucha `keydown` en un `<input>` dedicado, lee `event.code` y modificadores
(incluida `event.location` para Left/Right Ctrl) y actualiza la config vía `updateShortcut()`.
La UI de configuración puede especificarse en detalle en una sub-spec separada si la complejidad
del capturador lo requiere.

---

## 11. Consideraciones de Plataforma

| Plataforma | Teclado | `IntlBackslash` | Modificador por defecto | Observaciones |
|---|---|---|---|---|
| Linux | ISO español | ✅ | Left Ctrl | Caso principal. Sin conflictos conocidos en GNOME/KDE. |
| Windows | ISO español/europeo | ✅ | Left Ctrl | `Ctrl+Shift+IntlBackslash` no reservado en Windows. |
| Windows | ANSI (US) | ❌ | Left Ctrl | La tecla no existe físicamente. El atajo no disparará hasta que el usuario configure uno alternativo en Settings. Sin error, sólo feature inactiva. |
| macOS | ISO español/europeo | ✅ | Cmd (Meta) | `Cmd+Shift+\` no es shortcut de sistema conocido. |
| macOS | ANSI (US) | ❌ | Cmd (Meta) | Igual que Windows ANSI: requiere configuración manual. |

- **`DOM_KEY_LOCATION_LEFT`:** Soportado en todos los navegadores modernos y en el WebView de Tauri 2. Verificar que Tauri no normaliza `event.location` a `0` en ninguna plataforma antes de la implementación (un `console.log` en el WebView durante desarrollo es suficiente).
- **Detección de plataforma:** `getLiteraryPunctuationDefaults()` usa `navigator.platform` y `navigator.userAgent`. Ambos están disponibles en el WebView de Tauri 2 en todas las plataformas objetivo.
- **Conflictos con TipTap/StarterKit:** El tachado en StarterKit es `Mod-Shift-S`. `Minus` e `IntlBackslash` no están usados por ninguna extensión del StarterKit puro. Revisar extensiones adicionales activas al integrar.

---

## 12. Retrocompatibilidad

- El campo `literaryPunctuation` en settings es opcional — sin migraciones necesarias.
- Sin cambios en `TreeNode`, `InkwellProject` ni en el formato de documento ProseMirror.
- La extensión es estrictamente aditiva: no modifica ni envuelve ninguna extensión existente.

---

## 13. Botón de Acceso Rápido en la Barra del Editor

Toggle en la barra superior del editor que refleja y modifica `config.enabled` sin necesidad de abrir Settings.

**Ubicación:** al final del grupo de controles de formato existentes, antes del separador de acciones secundarias (si existe).

**Icono sugerido:** glifo `«»` como SVG propio, consistente con el iconset de Inkwell.

**Comportamiento visual:**

| Estado | Apariencia |
|---|---|
| `enabled: true` | Activo — mismo tratamiento visual que otros toggles activos de la barra (tint de acento) |
| `enabled: false` | Inactivo — opacidad reducida o sin tint, igual que otros toggles desactivados |

**Tooltip:**

```
Puntuación literaria española  ({atajo configurado})
Activada / Desactivada
```

El atajo mostrado se construye dinámicamente con `formatShortcutLabel(config.quoteShortcut)` para reflejar siempre la configuración actual del usuario.

**Implementación en el componente de toolbar:**

```typescript
// Fragmento del componente de toolbar del editor

readonly #literarySettings = inject(LiteraryPunctuationSettingsService);

readonly literaryEnabled = computed(
  () => this.#literarySettings.config().enabled
);

readonly literaryTooltip = computed(() => {
  const config = this.#literarySettings.config();
  const label  = formatShortcutLabel(config.quoteShortcut);
  const state  = config.enabled ? 'Activada' : 'Desactivada';
  return `Puntuación literaria española (${label})\n${state}`;
});

toggleLiterary(): void {
  this.#literarySettings.update({ enabled: !this.literaryEnabled() });
}
```

**Template:**

```html
<button
  [class.active]="literaryEnabled()"
  [title]="literaryTooltip()"
  (click)="toggleLiterary()"
  aria-label="Puntuación literaria española"
>
  <!-- SVG del glifo «» -->
</button>
```

El estado persiste a través de `update()`, que escribe en el almacén de settings de la app, por lo que sobrevive al reinicio de la aplicación. El toggle del panel de Settings y este botón están sincronizados automáticamente al leer del mismo Signal.

