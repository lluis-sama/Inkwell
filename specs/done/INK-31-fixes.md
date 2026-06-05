# INK-31 — Arreglos y mejoras menores

Spec de correcciones puntuales y mejoras de UX. Ningún cambio afecta a la arquitectura existente.

---

## FIX-1 — Iconos de importar/exportar invertidos

**Problema:** el implementer asignó los iconos de importar y exportar al revés.

**Corrección:** intercambiar los iconos en los dos botones afectados. El icono de importar representa entrada de datos hacia la app (flecha hacia adentro / hacia abajo), el de exportar representa salida (flecha hacia afuera / hacia arriba). Buscar en el código los dos componentes o botones con estos iconos y swappearlos. No hay cambio de lógica ni de handlers, solo los iconos SVG o las referencias a los mismos.

---

## FIX-2 — Ancho máximo de la ventana de Settings

**Problema:** la ventana de Settings no tiene ancho máximo definido y en pantallas anchas el contenido queda muy estirado y difícil de leer.

**Corrección:** limitar el contenedor principal de Settings a `max-w-[720px]` con centrado horizontal (`mx-auto`). Aplicar sobre el wrapper interior del contenido, no sobre la ventana/modal en sí, para que el fondo siga cubriendo toda la pantalla si Settings es una vista de página completa.

```html
<!-- Wrapper interior de Settings -->
<div class="w-full max-w-[720px] mx-auto px-6 py-8">
  <!-- contenido actual -->
</div>
```

---

## FIX-3 — Autofocus en el input de rename del binder

**Problema:** al iniciar un rename de un documento o carpeta en el binder, el input de texto aparece pero el usuario tiene que hacer clic manualmente para empezar a escribir.

**Corrección:** cuando el input de rename se renderiza, debe recibir foco automáticamente y seleccionar todo el texto existente para que el usuario pueda sobreescribir el nombre directamente.

Implementar con una directiva o con `ViewChild` + `setTimeout`:

```typescript
// Opción A — con ElementRef en el propio componente de rename
ngAfterViewInit(): void {
  this.renameInput.nativeElement.focus();
  this.renameInput.nativeElement.select();
}

// Opción B — directiva reutilizable (preferida si ya existe alguna similar en el proyecto)
@Directive({ selector: '[inkAutoFocus]', standalone: true })
export class AutoFocusDirective implements AfterViewInit {
  private el = inject(ElementRef);
  ngAfterViewInit(): void {
    setTimeout(() => {
      this.el.nativeElement.focus();
      this.el.nativeElement.select();
    }, 0);
  }
}
```

El `setTimeout(0)` es necesario para que Angular haya terminado de renderizar el DOM antes de intentar hacer focus.

Aplicar tanto en rename de **documentos** como de **carpetas** en el binder principal.

---

## FIX-4 — Soporte de carpetas en el binder del cajón (INK-24)

**Problema:** el binder del cajón solo permite crear documentos sueltos. No admite la creación de carpetas para organizar el contenido, a diferencia del binder principal de documentos.

**Corrección:** equiparar el comportamiento del binder del cajón al del binder principal en lo que respecta a la gestión de carpetas:

- Añadir botón "Nueva carpeta" en el toolbar del binder del cajón (igual que existe en el binder principal)
- Las carpetas son colapsables/expandibles
- Los documentos del cajón se pueden arrastrar dentro de carpetas
- El rename de carpetas sigue el mismo patrón que FIX-3 (autofocus)
- El borrado de una carpeta mueve sus documentos al nivel raíz del cajón (no borrado en cascada), igual que en el binder principal

**Nota para el implementer:** reutilizar los componentes existentes del binder principal si están suficientemente desacoplados. Si `BinderNodeComponent` o similar es genérico, simplemente instanciarlo en el cajón con el contexto correcto. No duplicar lógica.

---

## FIX-5 — Filtrado de estado mediante desplegable en el binder

**Problema actual:** el filtro de estado de los documentos en el binder está expuesto de forma plana, ocupando espacio visual permanente en una zona donde se crean documentos y carpetas.

**Nuevo comportamiento:** mover el filtrado a un desplegable accionado por un botón "Filtros" en el toolbar del binder (la misma zona donde están los botones de crear documento y crear carpeta).

### Estados del botón

**Sin filtro activo:**
```
[ Filtros ▾ ]
```

**Con filtro activo** — el botón muestra la etiqueta de color y el nombre del estado filtrado:
```
[ 🟡 En progreso ▾ ]     ← color del estado + nombre + chevron
```

El color se renderiza como un punto o badge pequeño con el color asociado al estado, no como emoji. Usar el mismo sistema de colores de estado que ya existe en la app.

### El desplegable

Al hacer clic en el botón, se abre un dropdown con la lista de estados disponibles:

```
┌──────────────────┐
│ ○  Sin filtro    │  ← opción para limpiar el filtro activo
│ ●  Sin estado    │
│ 🟡 En progreso   │
│ 🟢 Listo         │
│ 🔴 Necesita rev. │
│  ...             │
└──────────────────┘
```

- Al seleccionar un estado → el dropdown se cierra, el binder filtra, el botón muestra el estado activo
- "Sin filtro" → limpia el filtro, el botón vuelve a mostrar "Filtros ▾"
- Solo se puede tener un estado filtrado a la vez
- El estado del filtro es de sesión (no se persiste al cerrar la app)

### Implementación

El estado del filtro vive como un signal en el componente del binder (o en el servicio correspondiente si el estado ya estaba ahí). El dropdown puede implementarse con el componente de dropdown/popover que ya exista en `shared/components`, o crearse como uno nuevo si no hay ninguno reutilizable.

```typescript
readonly activeFilter = signal<DocumentStatus | null>(null);

readonly filteredDocuments = computed(() => {
  const filter = this.activeFilter();
  if (!filter) return this.allDocuments();
  return this.allDocuments().filter(doc => doc.status === filter);
});

selectFilter(status: DocumentStatus | null): void {
  this.activeFilter.set(status);
  this.dropdownOpen.set(false);
}
```

---

## Tests de criterio de aceptación

**FIX-1**
- [ ] El botón de importar muestra un icono de flecha hacia adentro/abajo
- [ ] El botón de exportar muestra un icono de flecha hacia afuera/arriba
- [ ] La funcionalidad de ambos botones no ha cambiado

**FIX-2**
- [ ] En una pantalla de 1920px de ancho, el contenido de Settings no supera los 720px
- [ ] El contenido está centrado horizontalmente
- [ ] En pantallas menores de 720px el layout se adapta correctamente sin overflow

**FIX-3**
- [ ] Al hacer clic en "Renombrar" en un documento del binder, el input aparece con foco y el texto seleccionado
- [ ] Al hacer clic en "Renombrar" en una carpeta del binder, ídem
- [ ] El usuario puede empezar a escribir el nuevo nombre inmediatamente sin clic adicional
- [ ] Pulsar Escape cancela el rename (comportamiento previo, verificar que no se ha roto)

**FIX-4**
- [ ] El binder del cajón tiene un botón "Nueva carpeta"
- [ ] Las carpetas del cajón son colapsables y expandibles
- [ ] Se pueden arrastrar documentos del cajón dentro de carpetas del cajón
- [ ] El rename de carpetas del cajón aplica el autofocus de FIX-3
- [ ] Borrar una carpeta del cajón mueve sus documentos al nivel raíz, no los elimina

**FIX-5**
- [ ] El botón "Filtros ▾" aparece en el toolbar del binder junto a los botones de crear
- [ ] Al hacer clic abre un dropdown con todos los estados disponibles más "Sin filtro"
- [ ] Al seleccionar un estado, el binder muestra solo los documentos con ese estado
- [ ] El botón cambia para mostrar el color y nombre del estado filtrado
- [ ] "Sin filtro" limpia el filtro y el botón vuelve a mostrar "Filtros ▾"
- [ ] El filtro no persiste entre sesiones
