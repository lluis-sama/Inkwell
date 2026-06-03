# INK-33 — Addendum A: Waypoints en conexiones y posición de tarjetas

Este addendum complementa la spec INK-33. Se debe aplicar junto con ella; no es una spec independiente.

---

## Clarificación: persistencia de posición de tarjetas

**La posición `(x, y)` de cada tarjeta ya se persiste desde INK-07** (`"su posición se persiste inmediatamente al soltar"`). INK-33 no altera ese comportamiento. Se documenta aquí para evitar ambigüedad: el Implementer no debe tocar la lógica de persistencia de posición de tarjetas al implementar las conexiones.

---

## Extensión de Parte 3: Waypoints

### Descripción

El usuario puede añadir **puntos intermedios (waypoints)** a una conexión para guiar manualmente el recorrido visual de la línea. La línea pasa por todos los waypoints en orden, generando una curva suave mediante interpolación **Catmull-Rom convertida a Bézier cúbica** para el SVG.

Ejemplo visual:

```
[Tarjeta A] ──(waypoint 1)──(waypoint 2)──▶ [Tarjeta B]
```

### Cambios en el modelo de datos

#### `board.model.ts`

```typescript
export interface ConnectionWaypoint {
  x: number;
  y: number;
}

export interface CardConnection {
  id: string;
  fromCardId: string;
  toCardId: string;
  label?: string;
  color: string;
  waypoints?: ConnectionWaypoint[];  // NUEVO — undefined o [] = sin waypoints
}
```

`waypoints` es opcional. Las conexiones existentes sin este campo se tratan como `[]` (sin waypoints, comportamiento original de Bézier cúbica simple).

---

### Cálculo de la línea con waypoints

Cuando `connection.waypoints` tiene uno o más puntos, sustituir la Bézier cúbica simple de la spec original por una **Catmull-Rom spline** que interpola todos los puntos en orden: `[anchorFrom, ...waypoints, anchorTo]`.

#### Conversión Catmull-Rom → Bézier cúbica SVG

```typescript
/**
 * Convierte una secuencia de puntos en un path SVG usando interpolación
 * Catmull-Rom → Bézier cúbica.
 * alpha = 0.5 (Centripetal Catmull-Rom, evita bucles en ángulos agudos)
 */
export function catmullRomToBezierPath(
  points: { x: number; y: number }[],
  alpha = 0.5
): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    // Solo dos puntos: Bézier cúbica simple con handles horizontales
    const dx = Math.abs(points[1].x - points[0].x) * 0.5;
    return `M ${points[0].x} ${points[0].y} C ${points[0].x + dx} ${points[0].y}, ${points[1].x - dx} ${points[1].y}, ${points[1].x} ${points[1].y}`;
  }

  // Añadir puntos fantasma en los extremos para que los extremos reales
  // sean también puntos de paso (no solo de control)
  const extended = [
    { x: 2 * points[0].x - points[1].x, y: 2 * points[0].y - points[1].y },
    ...points,
    { x: 2 * points[points.length - 1].x - points[points.length - 2].x,
      y: 2 * points[points.length - 1].y - points[points.length - 2].y },
  ];

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = extended[i];
    const p1 = extended[i + 1];
    const p2 = extended[i + 2];
    const p3 = extended[i + 3];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}
```

#### Integración en `getPathD`

```typescript
getPathD(conn: CardConnection): string {
  const from = this.getAnchorPoint(conn.fromCardId, conn.waypoints);
  const to   = this.getAnchorPoint(conn.toCardId, conn.waypoints, true /* isTarget */);

  const allPoints = [from, ...(conn.waypoints ?? []), to];
  return catmullRomToBezierPath(allPoints);
}
```

#### Impacto en `getAnchorPoint` — dirección con waypoints

Cuando existen waypoints, el punto de referencia para elegir el lado del anclaje ya no es el centro de la tarjeta opuesta, sino el primer o último waypoint:

```typescript
function getAnchorPoint(
  cardId: string,
  waypoints: ConnectionWaypoint[] | undefined,
  isTarget = false
): { x: number; y: number } {
  const card = this.getCardById(cardId);
  // El "objetivo de dirección" es el waypoint más cercano al extremo,
  // o el centro de la tarjeta opuesta si no hay waypoints.
  const reference = isTarget
    ? (waypoints?.length ? waypoints[waypoints.length - 1] : this.getOtherCardCenter(cardId))
    : (waypoints?.length ? waypoints[0] : this.getOtherCardCenter(cardId));

  return closestCardEdgePoint(card, reference);
}
```

---

### Interacciones con waypoints

#### Añadir un waypoint

**Doble clic sobre la línea de la conexión** (sobre el área de click invisible de 16px) inserta un waypoint en la posición del cursor dentro del segmento más cercano.

Implementación:
1. Calcular qué segmento de la curva es el más cercano al punto del clic (aproximación suficiente: buscar el segmento [anchorFrom–wp1], [wp1–wp2], ..., [wpN–anchorTo] cuyo punto medio esté más cerca del clic).
2. Insertar el nuevo waypoint en ese índice del array `waypoints`.
3. Guardar inmediatamente.

> **Nota para el Implementer**: No es necesario calcular el punto exacto sobre la curva Bézier (proyección de curva). Es suficiente insertar el waypoint en la posición del cursor — el usuario lo reubicará arrastrándolo.

#### Mover un waypoint

Los waypoints se renderizan como círculos (`<circle>`) de radio `6px` sobre el SVG:

```svg
@for (wp of conn.waypoints; track $index) {
  <circle
    [attr.cx]="wp.x"
    [attr.cy]="wp.y"
    r="6"
    [attr.fill]="conn.color"
    stroke="var(--ctp-base)"
    stroke-width="2"
    class="connection-waypoint"
    style="pointer-events: all; cursor: grab;"
    (mousedown)="startWaypointDrag(conn, $index, $event)"
  />
}
```

El drag de un waypoint usa los mismos listeners de `mousemove`/`mouseup` a nivel de `document` que el drag de creación de conexión. Mientras se arrastra, actualizar `waypoints[$index]` en el signal local (sin persistir) para que la curva se actualice en tiempo real. Al soltar (`mouseup`), persistir.

#### Eliminar un waypoint

Clic derecho (`contextmenu`) sobre un círculo de waypoint muestra un pequeño menú contextual con una única opción: **"Eliminar punto"**. Al confirmarlo, eliminar el waypoint del array y persistir.

Alternativa accesible: al hacer hover sobre un waypoint, mostrar un pequeño botón `×` flotante junto al círculo (renderizado como elemento SVG `<text>` o como `<foreignObject>` con un div Angular).

Implementar ambas opciones (clic derecho + hover×) para que el usuario tenga dos caminos.

---

### Visibilidad de waypoints

Los círculos de waypoints son visibles **solo cuando la conexión está seleccionada** (el usuario hizo clic sobre la línea y el `ConnectionEditorPopover` está abierto), o cuando el cursor está sobre la línea.

Cuando la conexión no está seleccionada ni hay hover, los waypoints no se muestran para no saturar visualmente el canvas con muchas conexiones.

```scss
.connection-waypoint {
  opacity: 0;
  transition: opacity 150ms;
}
.connection-group:hover .connection-waypoint,
.connection-group.selected .connection-waypoint {
  opacity: 1;
}
```

---

### Persistencia

El campo `waypoints` forma parte del objeto `CardConnection` que ya se persiste en el JSON del proyecto. No requiere cambios en `BoardService` salvo asegurarse de que la inicialización de retrocompatibilidad también cubre waypoints:

```typescript
// Al cargar un BoardFile existente:
board.connections = (board.connections ?? []).map(conn => ({
  ...conn,
  waypoints: conn.waypoints ?? [],
}));
```

---

### Criterios de aceptación — Waypoints

- [ ] Doble clic sobre una línea de conexión añade un waypoint en la posición del cursor.
- [ ] El waypoint es visible (círculo) cuando la conexión está seleccionada o en hover.
- [ ] El waypoint es arrastrable; la curva se actualiza en tiempo real durante el drag.
- [ ] Al soltar el waypoint, la posición se persiste en el JSON del proyecto.
- [ ] Clic derecho sobre un waypoint ofrece la opción de eliminarlo.
- [ ] El hover sobre un waypoint muestra un botón `×` alternativo para eliminarlo.
- [ ] Una conexión con waypoints se recarga correctamente al reabrir el proyecto.
- [ ] El punto de salida del anclaje de la tarjeta se orienta hacia el primer waypoint (no hacia la tarjeta destino) cuando hay waypoints.
- [ ] La animación de flujo recorre correctamente el camino completo incluyendo los waypoints.
- [ ] Conexiones existentes sin `waypoints` en el JSON no se rompen (retrocompatibilidad).

---

## Fuera de alcance (extensión de la lista de INK-33)

- Snapping de waypoints a una rejilla.
- Eliminar todos los waypoints de una conexión a la vez desde el popover (el usuario los elimina uno a uno).
- Importar/exportar el grafo de conexiones como formato externo.
