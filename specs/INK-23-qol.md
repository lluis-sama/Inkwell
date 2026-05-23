# INK-23 — Quality of Life: tipografía y sidebar redimensionable

## Objetivo

Tres mejoras de calidad de vida independientes pero relacionadas con la legibilidad y el aprovechamiento del espacio en pantalla:

1. **Fuente del editor** — el usuario puede elegir familia tipográfica y tamaño de fuente del área de escritura Tiptap.
2. **Escala de UI** — el usuario puede aumentar el tamaño de fuente general de la interfaz desde Ajustes. No afecta al editor.
3. **Sidebar IA redimensionable** — el panel del asistente IA puede redimensionarse en anchura arrastrando su borde izquierdo.

---

## Scope

**Incluido:**
- Nuevos campos en `AppSettings`: `editor.fontFamily`, `editor.fontSize`, `appearance.uiFontScale`, `aiPanel.width`
- Selector de fuente + stepper de tamaño en la toolbar del editor
- Selector de escala UI en la sección Apariencia del modal de Settings
- Resize handle interactivo en el panel IA con `interactjs` (ya instalado)
- Persistencia de todos los valores vía `SettingsService`

**Excluido:**
- Formato de fuente per-selection en Tiptap
- Fuentes de exportación

---

## Parte 1: AppSettings — campos nuevos

```typescript
// Añadir a EditorSettings (ya existente)
export interface EditorSettings {
  // ...campos actuales...
  fontFamily: string;  // default: 'Georgia, serif'
  fontSize: number;    // px · default: 18 · min: 12 · max: 32
}

// Añadir a AppearanceSettings (ya existente)
export type UiFontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface AppearanceSettings {
  theme: 'light' | 'dark';  // ya existente
  uiFontScale: UiFontScale; // nuevo · default: 'md'
}

// Añadir nueva sección
export interface AiPanelSettings {
  width: number; // px · default: 320 · min: 240 · max: 600
}

export interface AppSettings {
  // ...secciones actuales...
  aiPanel: AiPanelSettings; // nueva
}
```

Defaults en `DEFAULT_SETTINGS`:

```typescript
editor: {
  // ...
  fontFamily: 'Georgia, serif',
  fontSize: 18,
},
appearance: {
  theme: 'light',
  uiFontScale: 'md',
},
aiPanel: {
  width: 320,
},
```

Nuevos métodos en `SettingsService`:

```typescript
setEditorFontFamily(fontFamily: string): void {
  this.updateSettings({ editor: { ...this.settings().editor, fontFamily } });
}

setEditorFontSize(fontSize: number): void {
  const clamped = Math.min(Math.max(fontSize, 12), 32);
  this.updateSettings({ editor: { ...this.settings().editor, fontSize: clamped } });
}

setUiFontScale(uiFontScale: UiFontScale): void {
  this.updateSettings({ appearance: { ...this.settings().appearance, uiFontScale } });
}

setAiPanelWidth(width: number): void {
  const clamped = Math.min(Math.max(width, 240), 600);
  this.updateSettings({ aiPanel: { width: clamped } });
}
```

---

## Parte 2: Fuente del editor

### Familias disponibles

Definir como constante en `editor-toolbar.component.ts`:

```typescript
export interface FontOption {
  label: string;
  value: string;
}

export const EDITOR_FONT_OPTIONS: FontOption[] = [
  { label: 'Georgia',         value: 'Georgia, serif' },
  { label: 'Palatino',        value: '"Palatino Linotype", Palatino, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Inter',           value: '"Inter", system-ui, sans-serif' },
  { label: 'Helvetica',       value: '"Helvetica Neue", Arial, sans-serif' },
  { label: 'Courier Prime',   value: '"Courier New", Courier, monospace' },
];
```

> Fuentes del sistema / stack genérico. Sin Google Fonts ni assets adicionales.

### Binding CSS en `TiptapEditorComponent`

No se usa ninguna extensión de Tiptap. La fuente se aplica directamente en el contenedor del editor:

```typescript
readonly editorFontFamily = computed(() => this.settings.settings().editor.fontFamily);
readonly editorFontSize   = computed(() => this.settings.settings().editor.fontSize);
```

```html
<div
  #editorEl
  class="flex-1 overflow-y-auto px-16 py-12 focus:outline-none"
  [style.font-family]="editorFontFamily()"
  [style.font-size.px]="editorFontSize()"
>
</div>
```

### Controles en `EditorToolbarComponent`

Añadir a la derecha del grupo de formato, separados por un divider:

```html
<!-- Divider -->
<div class="w-px h-5 bg-ink-border mx-1"></div>

<!-- Font family -->
<select
  class="text-xs bg-ink-surface border border-ink-border rounded px-2 py-1
         text-ink-text-primary focus:outline-none focus:border-ink-accent max-w-[130px]"
  [value]="settings.settings().editor.fontFamily"
  (change)="settings.setEditorFontFamily($any($event.target).value)"
  title="Familia tipográfica"
>
  @for (font of fontOptions; track font.value) {
    <option [value]="font.value">{{ font.label }}</option>
  }
</select>

<!-- Divider -->
<div class="w-px h-5 bg-ink-border mx-1"></div>

<!-- Font size stepper -->
<div class="flex items-center gap-1">
  <button
    class="w-6 h-6 flex items-center justify-center rounded text-ink-text-secondary
           hover:bg-ink-hover disabled:opacity-40"
    (click)="settings.setEditorFontSize(settings.settings().editor.fontSize - 1)"
    [disabled]="settings.settings().editor.fontSize <= 12"
    title="Reducir tamaño"
  >−</button>
  <span class="text-xs text-ink-text-primary min-w-[28px] text-center tabular-nums select-none">
    {{ settings.settings().editor.fontSize }}px
  </span>
  <button
    class="w-6 h-6 flex items-center justify-center rounded text-ink-text-secondary
           hover:bg-ink-hover disabled:opacity-40"
    (click)="settings.setEditorFontSize(settings.settings().editor.fontSize + 1)"
    [disabled]="settings.settings().editor.fontSize >= 32"
    title="Aumentar tamaño"
  >+</button>
</div>
```

---

## Parte 3: Escala de fuente de la UI

### Mecanismo

Tailwind usa `rem`. Los `rem` son relativos al `font-size` de `<html>`. Cambiando ese valor, toda la UI escala proporcionalmente sin tocar clases CSS. El editor **no se ve afectado** porque su `font-size` está en `px` absolutos (Parte 2).

| Scale | html font-size | Resultado `text-sm` (0.875rem) |
|-------|---------------|-------------------------------|
| `sm`  | 14px          | 12.25px                       |
| `md`  | 16px          | 14px ← default                |
| `lg`  | 18px          | 15.75px                       |
| `xl`  | 20px          | 17.5px                        |

### Aplicación en `ThemeService` (o `AppearanceService`)

```typescript
private readonly FONT_SCALE_MAP: Record<UiFontScale, string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
  xl: '20px',
};

// Llamar en el constructor (effect) y en setUiFontScale:
private applyFontScale(scale: UiFontScale): void {
  document.documentElement.style.fontSize = this.FONT_SCALE_MAP[scale];
}
```

Añadir un `effect` en el constructor para que reaccione a cambios:

```typescript
effect(() => {
  this.applyFontScale(this.settings.settings().appearance.uiFontScale);
});
```

### Control en el modal de Settings (sección Apariencia)

```html
<div class="flex flex-col gap-2">
  <label class="text-xs font-medium text-ink-text-secondary">Tamaño de fuente de la interfaz</label>
  <div class="flex gap-2">
    @for (opt of fontScaleOptions; track opt.value) {
      <button
        class="flex-1 py-1.5 text-xs rounded border transition-colors"
        [class]="settings.settings().appearance.uiFontScale === opt.value
          ? 'border-ink-accent bg-ink-accent/10 text-ink-accent'
          : 'border-ink-border text-ink-text-secondary hover:bg-ink-hover'"
        (click)="settings.setUiFontScale(opt.value)"
      >{{ opt.label }}</button>
    }
  </div>
  <p class="text-xs text-ink-text-muted">No afecta al área de escritura.</p>
</div>
```

```typescript
readonly fontScaleOptions = [
  { value: 'sm' as UiFontScale, label: 'Pequeño' },
  { value: 'md' as UiFontScale, label: 'Normal' },
  { value: 'lg' as UiFontScale, label: 'Grande' },
  { value: 'xl' as UiFontScale, label: 'Muy grande' },
];
```

---

## Parte 4: Sidebar IA redimensionable

### Layout actual vs. nuevo

Actualmente el panel IA tiene un ancho fijo (clase Tailwind `w-80` o similar). Pasa a tener ancho dinámico via `style.width` con un resize handle en su borde izquierdo.

### `AiAssistantPanelComponent` — cambios

```typescript
private readonly settings = inject(SettingsService);
private readonly resizeHandleEl = viewChild<ElementRef>('resizeHandle');

readonly panelWidth = computed(() => this.settings.settings().aiPanel.width);

ngAfterViewInit(): void {
  this.initResize();
}

private initResize(): void {
  const handle = this.resizeHandleEl()?.nativeElement;
  if (!handle) return;

  interact(handle).draggable({
    axis: 'x',
    listeners: {
      move: (event: DragEvent) => {
        // El handle está en el borde izquierdo: arrastrar a la izquierda agranda el panel
        const newWidth = this.settings.settings().aiPanel.width - event.dx;
        this.settings.setAiPanelWidth(newWidth);
      },
    },
  });
}
```

> Se usa `interact(handle).draggable()` sobre el handle en lugar de `interact(panel).resizable()` para tener control total sobre la dirección y evitar conflictos con el scroll del panel.

### Template

```html
<div
  class="flex flex-col h-full bg-ink-surface border-l border-ink-border relative"
  [style.width.px]="panelWidth()"
>
  <!-- Resize handle -->
  <div
    #resizeHandle
    class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize
           hover:bg-ink-accent/40 transition-colors z-10"
    title="Arrastrar para redimensionar"
  ></div>

  <!-- Contenido existente del panel sin cambios -->
  <div class="flex flex-col h-full pl-1"> <!-- pl-1 para no solapar el handle -->
    <!-- ... cabecera, mensajes, input ... -->
  </div>
</div>
```

### Eliminar ancho fijo en `EditorLayoutComponent`

En `editor-layout.component.html`, el panel IA ya no lleva clase `w-80` ni similar. El ancho lo controla el propio componente via `style.width.px`. El editor principal usa `flex-1` y se adapta automáticamente.

---

## Tests

- `SettingsService.setEditorFontSize(10)` → clampea a 12; `setEditorFontSize(99)` → clampea a 32.
- `SettingsService.setAiPanelWidth(100)` → clampea a 240; `setAiPanelWidth(9999)` → clampea a 600.
- `TiptapEditorComponent`: el `#editorEl` tiene `font-family` e `font-size` correctos cuando los signals cambian.
- `ThemeService`: cambiar `uiFontScale` a `'lg'` aplica `font-size: 18px` en `document.documentElement`.

---

## Dependencias

Ninguna nueva. `interactjs` ya está instalado desde INK-07.

## Orden de implementación sugerido

1. Actualizar `AppSettings` y `SettingsService` (base para todo lo demás)
2. Fuente del editor (Parte 2) — aislado, sin riesgo
3. Escala de UI (Parte 3) — añadir al modal ya existente
4. Sidebar redimensionable (Parte 4) — el más complejo, dejarlo para el final

## Spec anterior

INK-22 (Transcripción de audio)
