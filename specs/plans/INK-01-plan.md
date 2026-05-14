# INK-01 — Plan de implementación

## Resumen

Configurar la infraestructura base del proyecto Inkwell sobre el scaffolding Tauri+Angular ya existente. El trabajo consiste en: eliminar zone.js, instalar y configurar TailwindCSS, definir el sistema de tokens Catppuccin, crear el ThemeService y los tres componentes placeholder, registrar las rutas con lazy loading, y ajustar la configuración de ventana en Tauri. Al finalizar, `pnpm tauri dev` debe arrancar mostrando ProjectManagerComponent con toggle de tema funcional.

---

## Tareas

### Tarea 1: Instalar dependencias de frontend
**Ficheros**: `package.json`, `pnpm-lock.yaml` (modificados por pnpm)
**Qué hacer**: Ejecutar `pnpm add -D tailwindcss postcss autoprefixer` para añadir las dependencias de build de TailwindCSS. No instalar TipTap ni interact.js en esta spec.
**Criterio de completado**: `tailwindcss`, `postcss` y `autoprefixer` aparecen en `devDependencies` de `package.json`.

---

### Tarea 2: Crear `tailwind.config.js`
**Ficheros**: `tailwind.config.js` (crear)
**Qué hacer**: Crear el fichero de configuración de Tailwind en la raíz del proyecto. El `content` debe apuntar a `./src/**/*.{html,ts}`. Definir una extensión de paleta en `theme.extend.colors` con los tokens semánticos `ink.*` (ink-bg, ink-surface, ink-overlay, ink-text, ink-subtext, ink-accent, ink-red, ink-green) mapeados cada uno a una variable CSS `var(--ink-*)`. No usar valores de color hardcodeados en el config; todo debe apuntar a variables CSS.
**Criterio de completado**: El fichero existe en la raíz y exporta un objeto con `content`, `theme.extend.colors` y `plugins: []`.

---

### Tarea 3: Crear `postcss.config.js`
**Ficheros**: `postcss.config.js` (crear)
**Qué hacer**: Crear el fichero de configuración PostCSS mínimo en la raíz que registre `tailwindcss` y `autoprefixer` como plugins. Este fichero es necesario para que el builder de Angular resuelva la cadena PostCSS.
**Criterio de completado**: El fichero existe en la raíz con los dos plugins registrados.

---

### Tarea 4: Rellenar `src/styles.css` con variables Catppuccin y directivas Tailwind
**Ficheros**: `src/styles.css` (modificar — actualmente vacío)
**Qué hacer**: Añadir al fichero las tres directivas Tailwind (`@tailwind base`, `@tailwind components`, `@tailwind utilities`) seguidas de dos bloques de variables CSS: uno en `:root` con los valores Catppuccin Latte para cada token `--ink-*`, y otro en `.dark` (o `[data-theme="dark"]`) con los valores Catppuccin Mocha. Añadir también la regla `html { transition: background-color 0.3s ease, color 0.3s ease; }` para la transición suave al cambiar de tema. Los valores hexadecimales exactos de Catppuccin están documentados en la spec original.
**Criterio de completado**: El fichero tiene las directivas Tailwind y las dos definiciones de variables CSS para ambos temas.
**Riesgo**: El selector que activa el tema oscuro (`.dark` vs `[data-theme="dark"]`) debe coincidir exactamente con el que ThemeService escribirá sobre el elemento `<html>`. Decidir aquí y ser consistente en la Tarea 6.

---

### Tarea 5: Eliminar `zone.js` de `angular.json` y `package.json`
**Ficheros**: `angular.json` (modificar), `package.json` (modificar)
**Qué hacer**:
- En `angular.json`, bajo `projects.inkwell.architect.build.options`, eliminar la entrada `"zone.js"` del array `polyfills`. Si el array queda vacío, eliminarlo o dejarlo como `[]`.
- En `package.json`, eliminar `zone.js` de `dependencies`.
- Ejecutar `pnpm install` para sincronizar el lockfile.
**Criterio de completado**: `zone.js` no aparece en `angular.json` ni en `dependencies` de `package.json`. `pnpm install` completa sin errores.
**Riesgo**: Angular 20 puede tener zona habilitada por defecto mediante `provideBrowserGlobalErrorListeners`; comprobar que no hay otra referencia a zone en `main.ts` o `app.config.ts`.

---

### Tarea 6: Actualizar `src/app/app.config.ts` a zoneless
**Ficheros**: `src/app/app.config.ts` (modificar)
**Qué hacer**: Reemplazar el contenido completo del fichero. Eliminar `provideZoneChangeDetection` y `provideBrowserGlobalErrorListeners`. Añadir `provideExperimentalZonelessChangeDetection()` como único provider de detección de cambios. Mantener `provideRouter(routes)`. El import de `provideExperimentalZonelessChangeDetection` viene de `@angular/core`.
**Criterio de completado**: El fichero solo tiene dos providers: `provideExperimentalZonelessChangeDetection()` y `provideRouter(routes)`. Sin referencias a `zone` ni a `BrowserGlobalErrorListeners`.

---

### Tarea 7: Crear estructura de carpetas del proyecto Angular
**Ficheros**: directorios a crear (sin ficheros de código todavía)
**Qué hacer**: Crear los directorios vacíos necesarios para las tareas siguientes:
- `src/app/core/services/`
- `src/app/features/project-manager/`
- `src/app/features/editor/`
- `src/app/features/boards/`
**Criterio de completado**: Las cuatro rutas de directorio existen en el sistema de ficheros. Basta con crear un `.gitkeep` en cada una si el directorio está vacío, o esperar a que las tareas siguientes los pueblen.
**Nota**: Esta tarea puede fusionarse con las tareas de creación de ficheros si el Implementer lo prefiere; se lista por separado para claridad.

---

### Tarea 8: Crear `src/app/core/services/theme.service.ts`
**Ficheros**: `src/app/core/services/theme.service.ts` (crear)
**Qué hacer**: Crear el servicio `ThemeService` como `@Injectable({ providedIn: 'root' })`. El servicio debe:
- Declarar un `signal<'light' | 'dark'>` llamado `theme` inicializado leyendo `localStorage.getItem('inkwell-theme')`. Si no hay valor guardado, leer `window.matchMedia('(prefers-color-scheme: dark)').matches` para el valor inicial.
- Exponer un método `setTheme(theme: 'light' | 'dark')` que: aplique o quite la clase (o atributo) en `document.documentElement` que activa el tema oscuro (debe coincidir con el selector definido en Tarea 4), actualice el signal, y persista el valor en `localStorage`.
- Exponer un método `toggleTheme()` que llame a `setTheme` con el valor opuesto al actual.
**Criterio de completado**: El fichero existe, compila sin errores, es standalone y no importa `NgZone`.
**Riesgo**: La clase o atributo que se añade a `document.documentElement` debe coincidir exactamente con el selector CSS de `styles.css` (Tarea 4).

---

### Tarea 9: Reescribir `src/app/app.component.ts`
**Ficheros**: `src/app/app.component.ts` (modificar), `src/app/app.component.html` (modificar o vaciar), `src/app/app.component.css` (dejar vacío o eliminar estilos)
**Qué hacer**: Reemplazar el componente actual (que tiene lógica de `greet` e `invoke`) con la versión mínima descrita en la spec: standalone, imports solo `RouterOutlet`, template con solo `<router-outlet />`, estilos de host con `display: block; height: 100vh`, y `ngOnInit` que llama a `themeService.setTheme(themeService.theme())` para aplicar el tema guardado al arrancar. Eliminar el fichero `app.component.html` externo si se usa template inline, o vaciarlo.
**Criterio de completado**: El componente compila, no tiene referencias a `invoke` ni a Tauri directamente, e inicializa el tema al arrancar.
**Riesgo**: El componente actual importa `invoke` directamente desde `@tauri-apps/api/core`, lo cual viola la convención de `TauriBridgeService`. Esta tarea elimina esa violación.

---

### Tarea 10: Crear `ProjectManagerComponent` (placeholder)
**Ficheros**: `src/app/features/project-manager/project-manager.component.ts` (crear)
**Qué hacer**: Crear un componente standalone con selector `app-project-manager`. El template debe mostrar un contenedor con fondo `bg-ink-bg`, texto `text-ink-text`, un encabezado con el título "Inkwell" y el texto de placeholder "Project Manager — coming in INK-04", y un botón que llame a `themeService.toggleTheme()` mostrando el texto "Toggle theme". Inyectar `ThemeService`. No hay lógica adicional.
**Criterio de completado**: El componente existe, usa clases Tailwind con tokens `ink-*`, y compila sin errores.

---

### Tarea 11: Crear `EditorLayoutComponent` (placeholder)
**Ficheros**: `src/app/features/editor/editor-layout.component.ts` (crear)
**Qué hacer**: Crear un componente standalone con selector `app-editor-layout` con el mismo patrón mínimo que `ProjectManagerComponent`: contenedor, texto de placeholder "Editor Layout — coming in INK-05", y botón de toggle de tema. Inyectar `ThemeService`.
**Criterio de completado**: El componente existe y compila sin errores.

---

### Tarea 12: Crear `BoardsLayoutComponent` (placeholder)
**Ficheros**: `src/app/features/boards/boards-layout.component.ts` (crear)
**Qué hacer**: Crear un componente standalone con selector `app-boards-layout` con el mismo patrón mínimo: contenedor, texto de placeholder "Boards Layout — coming in INK-07", y botón de toggle de tema. Inyectar `ThemeService`.
**Criterio de completado**: El componente existe y compila sin errores.

---

### Tarea 13: Configurar rutas en `src/app/app.routes.ts`
**Ficheros**: `src/app/app.routes.ts` (modificar — actualmente con array vacío)
**Qué hacer**: Definir tres rutas con lazy loading usando `loadComponent`:
- `''` → `ProjectManagerComponent` (ruta raíz)
- `'editor'` → `EditorLayoutComponent`
- `'boards'` → `BoardsLayoutComponent`
Cada `loadComponent` debe apuntar al fichero correspondiente creado en las tareas 10-12.
**Criterio de completado**: Las tres rutas están definidas con lazy loading. No hay rutas wildcard en esta spec.

---

### Tarea 14: Ajustar `src-tauri/tauri.conf.json`
**Ficheros**: `src-tauri/tauri.conf.json` (modificar)
**Qué hacer**: En el objeto `app.windows[0]`, cambiar `width` a `1280` y `height` a `800`. Añadir `minWidth: 900` y `minHeight: 600`.
**Criterio de completado**: La ventana arranca en 1280×800 con mínimos de 900×600.

---

### Tarea 15: Verificación de compilación
**Ficheros**: ninguno (solo verificación)
**Qué hacer**: Ejecutar `pnpm build` y confirmar que termina sin errores de TypeScript. Si hay errores, identificarlos y corregirlos antes de dar la tarea por completada. Verificar que el output en `dist/` no contiene `zone.js` en los bundles generados.
**Criterio de completado**: `pnpm build` termina con código 0 y sin errores ni warnings de TypeScript. Los bundles no contienen `zone.js`.
**Riesgo**: Es posible que el builder de Angular 20 incluya alguna referencia residual a zone si quedó alguna importación en ficheros no modificados. Revisar `main.ts` si el build falla.

---

## Orden de ejecución

1. Tarea 1 — Instalar dependencias TailwindCSS
2. Tarea 2 — Crear `tailwind.config.js`
3. Tarea 3 — Crear `postcss.config.js`
4. Tarea 4 — Rellenar `src/styles.css` (tokens Catppuccin + directivas Tailwind)
5. Tarea 5 — Eliminar `zone.js` de `angular.json` y `package.json`
6. Tarea 6 — Actualizar `app.config.ts` a zoneless
7. Tarea 7 — Crear estructura de carpetas
8. Tarea 8 — Crear `ThemeService`
9. Tarea 9 — Reescribir `AppComponent`
10. Tarea 10 — Crear `ProjectManagerComponent`
11. Tarea 11 — Crear `EditorLayoutComponent`
12. Tarea 12 — Crear `BoardsLayoutComponent`
13. Tarea 13 — Configurar rutas con lazy loading
14. Tarea 14 — Ajustar `tauri.conf.json`
15. Tarea 15 — Verificación de compilación

---

## Puntos de atención para el Implementer

**Restricciones explícitas (de la spec "Lo que NO hacer"):**
- No implementar lógica de negocio en ningún componente ni servicio.
- No crear servicios distintos de `ThemeService`.
- No conectar comandos Tauri (`invoke`) en esta spec. `AppComponent` debe eliminar el `invoke` existente.
- No instalar ni referenciar ninguna base de datos.
- No instalar TipTap ni interact.js todavía.

**Convenciones obligatorias:**
- Todos los componentes son standalone. Sin NgModules.
- Usar `inject()` en lugar de constructor injection para servicios.
- Signals en `ThemeService`: `signal<'light' | 'dark'>`, sin `BehaviorSubject`.
- Las clases Tailwind deben usar tokens `ink-*` (`bg-ink-bg`, `text-ink-text`, etc.), nunca variables `--ctp-*` directamente en templates.
- El gestor de paquetes es `pnpm`. Nunca `npm install` ni `yarn add`.

**Riesgos conocidos:**
- El selector CSS del tema oscuro en `styles.css` (Tarea 4) y el código que manipula el DOM en `ThemeService` (Tarea 8) deben usar exactamente el mismo selector. Una discrepancia hace que el toggle no funcione. Decidir el selector en la Tarea 4 y documentarlo como comentario en ambos ficheros.
- `angular.json` tiene `"polyfills": ["zone.js"]` — eliminarlo completamente en la Tarea 5. Si el array de polyfills queda vacío puede omitirse entero; dejar `[]` también es válido pero generar un warning en algunos builders.
- `app.component.ts` importa `invoke` directamente, violando la convención de `TauriBridgeService`. La Tarea 9 lo elimina por completo; no mover ese `invoke` a ningún otro sitio en esta spec.
- Angular 20 usa `provideBrowserGlobalErrorListeners` en el scaffolding por defecto. Este provider debe eliminarse junto con `provideZoneChangeDetection` en la Tarea 6; no es necesario para el funcionamiento de la app.
- `inlineStyleLanguage: "scss"` está en `angular.json` pero los componentes usan CSS. Esto no es un problema funcional, pero si el Implementer crea componentes con `.scss` en lugar de `.css`, ambos son válidos. Ser consistente.
