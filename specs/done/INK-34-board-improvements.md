# INK-34 — Mejoras de tableros: contraste, expansión de tarjetas y conexiones animadas

## Objetivo

Tres mejoras independientes sobre la vista de tableros (`boards`):

1. **Contraste adaptativo**: el color de texto de cada tarjeta se calcula dinámicamente en función del color de fondo elegido por el usuario, garantizando legibilidad en modo oscuro y claro.
2. **Tarjeta expandida**: las tarjetas tienen un modo compacto (actual) y un modo expandido que muestra toda la información disponible sin abrir la modal de edición.
3. **Conexiones entre tarjetas**: el usuario puede crear conexiones direccionales entre tarjetas, con etiqueta personalizada, color a elegir, y animación de flujo (A→B).

Estas tres mejoras comparten el mismo ciclo de implementación pero son independientes entre sí. El Planner debe tratarlas como subtareas y puede completarlas en paralelo salvo dependencias explícitas indicadas más abajo.

---

## Dependencias

- INK-07 (estructura base de tableros y `BoardCanvasComponent`)
- INK-14 (modelo `Card`, `CharacterData`, tipos de tarjeta)

---

## Parte 1 — Contraste adaptativo de texto

### Problema

El color de fondo de la tarjeta es elegido libremente por el usuario. El texto y los badges usan un color fijo que puede tener ratio de contraste insuficiente sobre ciertos colores (verde oscuro en modo claro, colores saturados en general).

### Solución

Calcular la luminancia relativa del color de fondo según WCAG 2.1 y derivar el color de texto más legible (`#0f0f0f` o `#f5f5f5`).

### Implementación

#### `board-card.utils.ts` (nuevo fichero en `features/boards/utils/`)

```typescript
/**
 * Calcula la luminancia relativa de un color hex según WCAG 2.1.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Devuelve el color de texto más legible para un fondo dado.
 * Resultado: '#0f0f0f' (oscuro) o '#f5f5f5' (claro).
 */
export function contrastTextColor(bgHex: string): string {
  const lum = relativeLuminance(bgHex);
  // Umbral 0.179 según WCAG (contraste 4.5:1 con ambos extremos)
  return lum > 0.179 ? '#0f0f0f' : '#f5f5f5';
}
```

#### `BoardCardComponent`

- Importar `contrastTextColor` desde el utils anterior.
- Añadir una signal computada:

```typescript
protected readonly textColor = computed(() =>
  contrastTextColor(this.card().color)
);
```

- Aplicar `[style.color]="textColor()"` al elemento raíz de la tarjeta.
- Eliminar cualquier clase Tailwind de color de texto hardcodeada (`text-white`, `text-gray-*`, etc.) del template de la tarjeta.
- El badge de capítulos y el icono de tipo también deben heredar este color (no tener color propio fijo).

#### Hover state

El hover actualmente oscurece la tarjeta. Cambiar el efecto de hover para que use `filter: brightness(0.85)` en lugar de modificar el color de fondo, así el color de texto calculado sigue siendo válido sin recalcular.

```css
/* Antes — INCORRECTO (cambia bg-color y rompe el cálculo de contraste) */
&:hover { background-color: darken(...) }

/* Después — CORRECTO */
&:hover { filter: brightness(0.85); }
```

### Criterios de aceptación — Parte 1

- [ ] Una tarjeta con fondo verde oscuro (`#2d6a4f`) muestra texto `#f5f5f5` en modo oscuro y en modo claro.
- [ ] Una tarjeta con fondo amarillo claro (`#f9e07a`) muestra texto `#0f0f0f` en ambos modos.
- [ ] El hover no hace que el texto desaparezca ni pierda contraste.
- [ ] No quedan clases de color de texto hardcodeadas en `board-card.component.html`.

---

## Parte 2 — Tarjeta expandida

### Descripción

Las tarjetas tienen dos modos visuales:
- **Modo compacto** (estado por defecto): muestra icono de tipo, título, descripción corta (máximo 2 líneas con ellipsis) y el badge de capítulos.
- **Modo expandido**: la tarjeta crece verticalmente para mostrar el cuerpo completo, la lista de capítulos con nombres reales (no solo el conteo), y para las tarjetas de tipo `character`, los aliases.

### Interacción

- **Doble clic** sobre la tarjeta: alterna entre modo compacto y expandido.
- El botón de expansión (chevron `▾`/`▴`) aparece en la esquina inferior derecha de la tarjeta al hacer hover, como alternativa accesible al doble clic.
- La expansión es local a esa tarjeta: no afecta a ninguna otra tarjeta del canvas.
- La posición `(x, y)` de la tarjeta no cambia al expandirse; la tarjeta crece hacia abajo.
- El modo expandido no se persiste en el JSON del proyecto. Al cerrar y reabrir el proyecto todas las tarjetas empiezan en modo compacto.

### Modelo de datos — ningún cambio

El modo expandido es puramente estado de UI; no requiere cambios en `Card` ni en `BoardFile`.

### Cambios en `BoardCardComponent`

```typescript
protected readonly isExpanded = signal(false);

protected toggleExpanded(event: MouseEvent): void {
  // Evitar que el doble clic inicie un drag
  event.stopPropagation();
  this.isExpanded.update(v => !v);
}
```

En el template, la sección expandida se muestra condicionalmente:

```html
<!-- Sección expandida — solo visible cuando isExpanded() === true -->
@if (isExpanded()) {
  <div class="card-expanded-body">
    <!-- Cuerpo completo del campo body -->
    <p class="card-body-full">{{ card().body }}</p>

    <!-- Lista de capítulos con nombre real -->
    @if (card().characterData?.appearsInChapters?.length) {
      <div class="card-chapters-list">
        <span class="card-section-label">Aparece en:</span>
        @for (docId of card().characterData!.appearsInChapters; track docId) {
          <span class="card-chapter-pill">{{ getDocumentTitle(docId) }}</span>
        }
      </div>
    }

    <!-- Aliases — solo para personajes -->
    @if (card().type === 'character' && card().characterData?.aliases?.length) {
      <div class="card-aliases">
        <span class="card-section-label">También conocido como:</span>
        <span>{{ card().characterData!.aliases!.join(', ') }}</span>
      </div>
    }
  </div>
}
```

El método `getDocumentTitle(docId: string): string` llama al `DocumentService` para obtener el nombre real del documento en lugar de mostrar el UUID.

### Dimensiones

- **Modo compacto**: altura fija de `160px` (comportamiento actual).
- **Modo expandido**: altura `auto`, mínimo `220px`, máximo `480px` con `overflow-y: auto` interno.
- La transición de altura usa `transition: height 200ms ease-out` (no `max-height`, que genera lentitud perceptible).

> **Nota para el Implementer**: La transición de `height: auto` requiere calcular la altura real del contenido expandido y aplicarla como valor numérico antes de transicionar. Ver el patrón de Angular con `@if` + `@keyframes` o usar `ResizeObserver`. No usar `max-height` para la animación.

### Criterios de aceptación — Parte 2

- [ ] Doble clic en una tarjeta la expande; doble clic de nuevo la colapsa.
- [ ] El chevron ▾/▴ aparece en hover y alterna correctamente.
- [ ] En modo expandido, las tarjetas de personaje muestran los nombres reales de los capítulos (no UUIDs).
- [ ] En modo expandido, los aliases son visibles si existen.
- [ ] El drag sigue funcionando correctamente desde la tarjeta en modo expandido (el drag se inicia desde la cabecera de la tarjeta, no desde el cuerpo expandido).
- [ ] El estado expandido se resetea al recargar el proyecto.

---

## Parte 3 — Conexiones entre tarjetas

### Descripción general

El usuario puede conectar dos tarjetas con una línea visual que:
- Es **direccional** (A→B), indicada por una flecha en el extremo B.
- Tiene una **etiqueta** de texto libre (opcional) que aparece centrada en la línea.
- Tiene un **color** elegido por el usuario.
- Tiene una **animación de flujo**: el trazo de la línea tiene guiones (`stroke-dasharray`) que se desplazan continuamente en la dirección A→B, dando sensación de movimiento.

Las conexiones se renderizan en un `<svg>` overlay que cubre todo el canvas y está posicionado debajo de las tarjetas (`z-index` menor).

### Modelo de datos — `board.model.ts`

Añadir la interfaz `CardConnection` y el campo `connections` en `BoardFile`:

```typescript
export interface CardConnection {
  id: string;            // UUID generado al crear la conexión
  fromCardId: string;    // ID de la tarjeta origen (A)
  toCardId: string;      // ID de la tarjeta destino (B)
  label?: string;        // Etiqueta visible en la línea (opcional)
  color: string;         // Color hex, p.ej. '#a78bfa'
}

// En BoardFile, añadir:
export interface BoardFile {
  // ... campos existentes ...
  connections: CardConnection[];  // NUEVO — array vacío por defecto
}
```

Al leer un `BoardFile` existente sin el campo `connections`, el servicio lo inicializa como `[]` (retrocompatibilidad).

### Flujo de creación de una conexión

1. El usuario hace hover sobre una tarjeta origen: aparecen **cuatro puntos de anclaje** (N, S, E, O) en los bordes de la tarjeta.
2. El usuario hace **clic y arrastra** desde uno de los puntos de anclaje.
3. Mientras arrastra, se renderiza una línea provisional punteada desde el anclaje hasta la posición del cursor.
4. Si el usuario **suelta sobre otra tarjeta**, se crea la conexión con valores por defecto (`color: '#a78bfa'`, `label: ''`).
5. Si el usuario suelta fuera de una tarjeta, la línea provisional desaparece (conexión cancelada).
6. Inmediatamente después de crear la conexión, se abre el **ConnectionEditorPopover** para que el usuario personalice etiqueta y color.

> **Nota para el Implementer**: El drag de creación de conexión debe ignorar el sistema de drag de `interact.js` de las tarjetas. Capturar los eventos `mousedown` en los puntos de anclaje con `stopPropagation()` para evitar interferencia.

### Puntos de anclaje

Los puntos de anclaje son elementos `<div>` posicionados en los bordes de la tarjeta:

```html
<!-- Solo visibles con hover en la tarjeta -->
@if (showAnchors()) {
  <div class="anchor anchor-n" (mousedown)="startConnection('n', $event)"></div>
  <div class="anchor anchor-s" (mousedown)="startConnection('s', $event)"></div>
  <div class="anchor anchor-e" (mousedown)="startConnection('e', $event)"></div>
  <div class="anchor anchor-w" (mousedown)="startConnection('w', $event)"></div>
}
```

Estilos de los anchors:

```scss
.anchor {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ctp-blue);
  border: 2px solid var(--ctp-base);
  cursor: crosshair;
  opacity: 0;
  transition: opacity 150ms;
  z-index: 10;
}
.card-wrapper:hover .anchor { opacity: 1; }
.anchor-n { top: -5px; left: 50%; transform: translateX(-50%); }
.anchor-s { bottom: -5px; left: 50%; transform: translateX(-50%); }
.anchor-e { right: -5px; top: 50%; transform: translateY(-50%); }
.anchor-w { left: -5px; top: 50%; transform: translateY(-50%); }
```

### Cálculo de coordenadas para el SVG

El `BoardCanvasComponent` mantiene un `signal` con el listado de conexiones activas. Para cada conexión, necesita calcular las coordenadas de inicio y fin en el espacio del canvas (no de la ventana).

```typescript
// Función auxiliar — calcula el punto de anclaje de una tarjeta dado su centro y dimensiones
function getAnchorPoint(
  card: Card,
  preferredSide: 'auto' | 'n' | 's' | 'e' | 'w',
  targetX: number,  // coords del extremo opuesto
  targetY: number
): { x: number; y: number } {
  // Si preferredSide === 'auto', calcular el lado más cercano al target
  // Devolver el punto en el borde de la tarjeta
}
```

En modo `auto` (las conexiones guardadas no recuerdan el anclaje exacto, solo los IDs de las tarjetas), el sistema elige el lado cuyo punto cardinal esté más cerca del centro de la tarjeta destino. Esto significa que al mover las tarjetas, las líneas se reconectan automáticamente al lado más lógico.

### Renderizado SVG de las conexiones

El SVG de overlay está posicionado de forma absoluta sobre el canvas, con las mismas dimensiones, `pointer-events: none` excepto en los elementos interactivos de las conexiones.

Para cada conexión, se renderiza:

```svg
<g class="connection" [attr.data-id]="conn.id">
  <!-- Línea base (semi-transparente, para dar grosor visual) -->
  <path
    [attr.d]="getPathD(conn)"
    [attr.stroke]="conn.color"
    stroke-width="2"
    stroke-opacity="0.35"
    fill="none"
  />

  <!-- Línea animada de flujo (stroke-dasharray + animación) -->
  <path
    [attr.d]="getPathD(conn)"
    [attr.stroke]="conn.color"
    stroke-width="2"
    fill="none"
    stroke-dasharray="8 6"
    class="connection-flow"
  />

  <!-- Flecha en el extremo B -->
  <polygon
    [attr.points]="getArrowPoints(conn)"
    [attr.fill]="conn.color"
  />

  <!-- Etiqueta (fondo + texto) — solo si label no está vacío -->
  @if (conn.label) {
    <g class="connection-label" [attr.transform]="getLabelTransform(conn)">
      <rect ... />
      <text>{{ conn.label }}</text>
    </g>
  }

  <!-- Área de click invisible para seleccionar la conexión -->
  <path
    [attr.d]="getPathD(conn)"
    stroke="transparent"
    stroke-width="16"
    fill="none"
    style="pointer-events: stroke; cursor: pointer;"
    (click)="selectConnection(conn, $event)"
  />
</g>
```

#### Forma de la línea (`getPathD`)

Usar **curvas cúbicas de Bézier** (`C`) en lugar de líneas rectas, con los puntos de control desplazados horizontalmente. Esto evita el aspecto de "cable de red" y da un estilo más orgánico.

```typescript
getPathD(conn: CardConnection): string {
  const from = this.getAnchorPoint(conn.fromCardId, 'auto', toCenter.x, toCenter.y);
  const to   = this.getAnchorPoint(conn.toCardId, 'auto', fromCenter.x, fromCenter.y);
  const dx = Math.abs(to.x - from.x) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}
```

#### Animación de flujo

```scss
.connection-flow {
  animation: connectionFlow 1.2s linear infinite;
}

@keyframes connectionFlow {
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: -28; } /* -(dasharray[0] + dasharray[1]) * 2 */
}
```

La velocidad de la animación (`1.2s`) es fija para todas las conexiones. No hacer que varíe por longitud de línea; es más complejo y el beneficio visual es mínimo.

### `ConnectionEditorPopover` (nuevo componente)

Popover pequeño anclado a la línea de la conexión seleccionada. Se abre al:
- Crear una nueva conexión (inmediatamente tras soltarla).
- Hacer clic sobre una conexión existente.

Contenido del popover:

```
┌──────────────────────────────┐
│  Etiqueta de la conexión     │
│  [ input text ____________ ] │
│                              │
│  Color                       │
│  [ ● ] [ ● ] [ ● ] [ ● ] [+]│
│                              │
│              [ Eliminar ×  ] │
└──────────────────────────────┘
```

- **Campo de etiqueta**: `<input type="text">` con placeholder `"Describe la relación..."`. Se actualiza en tiempo real (el usuario ve el cambio en la línea mientras escribe).
- **Paleta de colores**: 4 colores predefinidos del tema Catppuccin (`--ctp-mauve`, `--ctp-blue`, `--ctp-green`, `--ctp-red`) más un botón `[+]` que abre un `<input type="color">` nativo.
- **Botón Eliminar**: elimina la conexión, cierra el popover.
- El popover se cierra al hacer clic fuera (click-outside listener).
- El popover se cierra con `Escape`.

### Persistencia

Al modificar cualquier conexión (crear, editar, eliminar), el `BoardService` llama a `saveBoard()` inmediatamente, igual que hace con las tarjetas al moverlas.

### Rendimiento

Si el tablero tiene más de 50 tarjetas y muchas conexiones, la animación CSS puede generar janks. Añadir una clase `reduced-motion` al SVG cuando `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, que desactive la animación de flujo y muestre solo la línea base estática.

### Criterios de aceptación — Parte 3

- [ ] Al hacer hover sobre una tarjeta, aparecen cuatro puntos de anclaje (N, S, E, O).
- [ ] Arrastrando desde un anclaje hasta otra tarjeta se crea una conexión.
- [ ] La conexión se muestra como una curva de Bézier con animación de flujo en la dirección A→B.
- [ ] La flecha está en el extremo B de la conexión.
- [ ] Al hacer clic en una conexión, se abre el `ConnectionEditorPopover`.
- [ ] El usuario puede cambiar la etiqueta y el color de la conexión. Los cambios se ven en tiempo real.
- [ ] El usuario puede eliminar la conexión desde el popover.
- [ ] Las conexiones se persisten en el JSON del proyecto y se recuperan correctamente al reabrir.
- [ ] Al mover una tarjeta, las conexiones se actualizan en tiempo real sin lag visible.
- [ ] Arrastrando desde un anclaje y soltando fuera de una tarjeta, la conexión se cancela y no se crea nada.
- [ ] `prefers-reduced-motion` desactiva la animación de flujo.

---

## Cambios en el modelo de datos — resumen

| Fichero | Cambio |
|---|---|
| `board.model.ts` | Añadir interfaz `CardConnection`. Añadir campo `connections: CardConnection[]` en `BoardFile`. |
| `board.service.ts` | Al leer un `BoardFile`, inicializar `connections` como `[]` si el campo no existe (retrocompatibilidad). |

---

## Nuevos componentes y ficheros

| Fichero | Descripción |
|---|---|
| `features/boards/utils/board-card.utils.ts` | Funciones `relativeLuminance` y `contrastTextColor` |
| `features/boards/canvas/connection-svg-overlay.component.ts` | SVG overlay con todas las conexiones del tablero activo |
| `features/boards/canvas/connection-editor-popover.component.ts` | Popover de edición de conexión |

---

## Orden de implementación recomendado

1. **Parte 1** (contraste): independiente, sin dependencias. Implementar primero, 20–30 líneas.
2. **Parte 2** (expansión): independiente. Implementar segunda.
3. **Parte 3** (conexiones): la más compleja. Implementar al final.
   - Primero el modelo de datos y la persistencia.
   - Luego el SVG overlay estático (sin animación).
   - Luego los puntos de anclaje y el drag de creación.
   - Luego el popover de edición.
   - Finalmente la animación CSS.

---

## Fuera de alcance

- Conexiones entre tarjetas de tableros distintos.
- Autorouting para evitar que las líneas pasen por encima de tarjetas.
- Múltiples conexiones paralelas entre las mismas dos tarjetas (si el usuario intenta crear una segunda conexión A→B, se abre el editor de la existente).
- Exportar el grafo de conexiones como imagen.
