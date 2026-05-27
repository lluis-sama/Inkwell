## Plan de implementación — INK-32

### Resumen

Enriquecer los paquetes `.deb` y `.rpm` de Inkwell con metadatos AppStream completos (XML metainfo, iconos hicolor multi-tamaño, capturas placeholder y licencia MIT), y actualizar `tauri.conf.json` para que el bundler los incluya. No se modifica la arquitectura de la app ni se toca el pipeline CI/CD.

---

### Decisiones previas

1. **Identifier de Tauri**: se mantiene `net.neocodelabs.inkwell` (sin cambiar). El AppStream ID `org.codeberg.frozenfangkb.inkwell` se usa **solo** en el XML y en `<developer id>`.
2. **Licencia del proyecto**: MIT. Se crea el archivo `LICENSE` en la raíz.
3. **Bloque `<releases>`**: actualización manual (Opción A). **NO** se implementa la automatización CI de la Opción B.
4. **Capturas de pantalla**: son placeholders en esta spec. Se generarán como PNGs de dimensiones correctas (1248×702) pero sin contenido real de la app.
5. **Nombre del `.desktop`**: Tauri v2 genera el archivo `.desktop` para los paquetes Linux a partir del `identifier`. Por tanto, el `<launchable>` del XML debe apuntar a `net.neocodelabs.inkwell.desktop`. El Implementer debe verificar esto en T7.

---

### Tareas

#### Tarea 1: Crear estructura de directorios Linux
- **Ficheros**: crear directorios (sin archivos todavía)
  - `src-tauri/assets/linux/metainfo/`
  - `src-tauri/assets/linux/icons/`
  - `src-tauri/assets/linux/screenshots/`
- **Qué hace**: Prepara la jerarquía donde residirán el XML metainfo, los iconos hicolor y las capturas de pantalla.
- **Depende de**: ninguna dependencia previa
- **Criterio de aceptación**: `ls src-tauri/assets/linux/` muestra `metainfo/`, `icons/` y `screenshots/`.

#### Tarea 2: Generar iconos en múltiples tamaños
- **Ficheros**: crear en `src-tauri/assets/linux/icons/`
  - `16x16.png`
  - `32x32.png`
  - `64x64.png`
  - `128x128.png`
  - `256x256.png`
  - `512x512.png`
- **Qué hace**:
  - Copiar `src-tauri/icons/32x32.png` → `assets/linux/icons/32x32.png`.
  - Copiar `src-tauri/icons/128x128.png` → `assets/linux/icons/128x128.png`.
  - Copiar `src-tauri/icons/128x128@2x.png` → `assets/linux/icons/256x256.png`.
  - Generar `16x16.png`, `64x64.png` y `512x512.png` escalando desde `src-tauri/icons/icon.png` (1024×1024) con ImageMagick:
    ```bash
    convert src-tauri/icons/icon.png -resize 16x16 src-tauri/assets/linux/icons/16x16.png
    convert src-tauri/icons/icon.png -resize 64x64 src-tauri/assets/linux/icons/64x64.png
    convert src-tauri/icons/icon.png -resize 512x512 src-tauri/assets/linux/icons/512x512.png
    ```
- **Depende de**: Tarea 1
- **Riesgo**: ImageMagick (`convert`) debe estar disponible en el entorno del Implementer. Si no lo está, usar cualquier herramienta de escalado de PNG (ffmpeg, GIMP CLI, etc.) pero preservar el canal alpha.
- **Criterio de aceptación**: Los 6 archivos PNG existen, son imágenes válidas, y `file` (o `identify`) reporta las dimensiones exactas esperadas.

#### Tarea 3: Crear placeholders de screenshots
- **Ficheros**: crear en `src-tauri/assets/linux/screenshots/`
  - `01-editor.png`
  - `02-binder.png`
  - `03-ai-assistant.png`
- **Qué hace**: Generar tres PNGs de 1248×702 px (formato recomendado por AppStream, 16:9) con un color sólido o texto simple (p. ej. "Inkwell — Screenshot Placeholder"). Esto evita errores de validación por archivos inexistentes o tamaños incorrectos.
  ```bash
  convert -size 1248x702 xc:"#1e1e2e" -pointsize 30 -fill "#cdd6f4" -gravity center -annotate +0+0 "Placeholder" src-tauri/assets/linux/screenshots/01-editor.png
  ```
  Repetir para `02-binder.png` y `03-ai-assistant.png`.
- **Depende de**: Tarea 1
- **Riesgo**: Ninguno; son placeholders intencionales.
- **Criterio de aceptación**: Los 3 PNGs existen, son válidos, y sus dimensiones son 1248×702.

#### Tarea 4: Crear archivo LICENSE MIT en raíz
- **Fichero**: `LICENSE` (crear en raíz del proyecto)
- **Qué hace**: Escribir el texto estándar de la licencia MIT con:
  - Copyright (c) 2026 David Rodriguez Miranda
- **Depende de**: ninguna dependencia previa
- **Criterio de aceptación**: El archivo `LICENSE` existe en `/home/david/dev/inkwell/LICENSE` y contiene las palabras "MIT License" y el copyright correcto.

#### Tarea 5: Crear XML metainfo AppStream
- **Fichero**: `src-tauri/assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml` (crear)
- **Qué hace**: Copiar el contenido de la spec INK-32 y aplicar los siguientes ajustes obligatorios:
  - `<id>org.codeberg.frozenfangkb.inkwell</id>`
  - `<project_license>MIT</project_license>`
  - `<launchable type="desktop-id">net.neocodelabs.inkwell.desktop</launchable>`
    - *Nota*: este valor asume que Tauri v2 genera el `.desktop` usando el `identifier`. Si en T7 se comprueba que usa otro nombre, se corregirá aquí.
  - `<developer id="org.codeberg.frozenfangkb">`
  - `<releases>`: dejar la entrada dummy `<release version="1.0.0" date="2026-01-01">`.
  - URLs de `<image>` deben apuntar al raw de Codeberg (`https://codeberg.org/frozenfangkb/inkwell/raw/branch/main/src-tauri/assets/linux/screenshots/...`).
- **Depende de**: Tarea 1, Tarea 2, Tarea 3
- **Riesgo**: Si el nombre del `.desktop` generado por Tauri no coincide con `net.neocodelabs.inkwell.desktop`, el XML será inválido para AppStream. Se resolverá en T7.
- **Criterio de aceptación**: El XML está bien formado (`xmllint` no devuelve errores), contiene los valores ajustados, y todas las rutas referenciadas existen en el repo.

#### Tarea 6: Actualizar `tauri.conf.json` con bundle metadata y linux files
- **Fichero**: `src-tauri/tauri.conf.json` (modificar)
- **Qué hace**: Dentro del objeto `bundle` (actualmente solo tiene `active`, `targets` e `icon`), añadir:
  - `identifier`: mantener `net.neocodelabs.inkwell` (sin cambiar).
  - `publisher`: `"David Rodriguez Miranda"`
  - `homepage`: `"https://codeberg.org/frozenfangkb/inkwell"`
  - `shortDescription`: `"Entorno de escritura creativa para escritores serios"`
  - `longDescription`: `"Inkwell es una alternativa open source a Scrivener para Linux, Windows y macOS. Editor de texto, binder, tableros de corcho, asistente de IA y más."`
  - `category`: `"Office"`
  - `license`: `"MIT"`
  - `linux.deb`:
    - `files`: mapear el XML metainfo y **todos** los iconos hicolor generados:
      ```json
      {
        "/usr/share/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml": "assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml",
        "/usr/share/icons/hicolor/16x16/apps/inkwell.png": "assets/linux/icons/16x16.png",
        "/usr/share/icons/hicolor/32x32/apps/inkwell.png": "assets/linux/icons/32x32.png",
        "/usr/share/icons/hicolor/64x64/apps/inkwell.png": "assets/linux/icons/64x64.png",
        "/usr/share/icons/hicolor/128x128/apps/inkwell.png": "assets/linux/icons/128x128.png",
        "/usr/share/icons/hicolor/256x256/apps/inkwell.png": "assets/linux/icons/256x256.png",
        "/usr/share/icons/hicolor/512x512/apps/inkwell.png": "assets/linux/icons/512x512.png"
      }
      ```
    - `section`: `"editors"`
    - `priority`: `"optional"`
  - `linux.rpm`:
    - `files`: mismo mapeo que deb.
    - `license`: `"MIT"`
    - `group`: `"Applications/Editors"`
- **Depende de**: Tarea 2, Tarea 5
- **Riesgo**: JSON malformado (faltan comas, cierran mal las llaves). Revisar con `python -m json.tool` o similar después de editar.
- **Criterio de aceptación**: El JSON es sintácticamente válido, preserva el `identifier` original, y contiene todos los campos y mapeos de archivos indicados.

#### Tarea 7: Verificación final y validación AppStream
- **Ficheros**: varios (validación cruzada)
- **Qué hace**:
  1. Verificar que `appstreamcli validate src-tauri/assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml` no devuelva **errores** (warnings por screenshots placeholders son aceptables si se documentan).
  2. Verificar que el `launchable.desktop-id` del XML coincide con el nombre real del `.desktop` que Tauri generaría. Dado que el `identifier` es `net.neocodelabs.inkwell`, el valor esperado es `net.neocodelabs.inkwell.desktop`. Si Tauri usara `inkwell.desktop` (basado en `productName`), corregir el XML en esta tarea.
  3. Comprobar que todos los paths relativos en `tauri.conf.json` (`assets/linux/...`) existen físicamente en disco.
- **Depende de**: Tarea 5, Tarea 6
- **Riesgo**: Si `appstreamcli` no está instalado, la validación no se puede hacer localmente. En ese caso, el Implementer debe al menos ejecutar `xmllint --noout` y documentar que la validación AppStream queda pendiente de ejecución en el entorno CI o en una máquina Debian/Ubuntu.
- **Criterio de aceptación**:
  - `xmllint --noout` sobre el XML no reporta errores.
  - `appstreamcli validate` (si disponible) no reporta errores críticos.
  - Todos los archivos mapeados en `tauri.conf.json` existen en sus rutas relativas.

---

### Orden de ejecución

1. **Tarea 1** — Crear directorios (`src-tauri/assets/linux/...`).
2. **Tarea 2 + Tarea 3 + Tarea 4** (paralelizables) — Generar iconos, screenshots placeholders y LICENSE.
3. **Tarea 5** — Crear XML metainfo (necesita que existan los dirs y los assets).
4. **Tarea 6** — Actualizar `tauri.conf.json` (necesita los paths de T1-T3 y el XML de T5).
5. **Tarea 7** — Validación final y verificación de consistencia.

---

### Puntos de atención para el Implementer

- **NO cambiar el `identifier` de Tauri**. Mantener `net.neocodelabs.inkwell` para no romper rutas de datos de usuario existentes.
- **NO tocar el pipeline CI/CD** (`.forgejo/workflows/release.yml`). No se implementa la Opción B de actualización automática del XML.
- **NO generar metadatos para Windows (.msi) ni macOS (.dmg)**. Esta spec es exclusiva de Linux.
- Los iconos escalados deben preservar el canal alpha si los originales lo tienen (ImageMagick lo hace por defecto con PNG).
- En `tauri.conf.json`, los valores de `files` dentro de `linux.deb` y `linux.rpm` usan **paths de destino absolutos en el paquete → paths de origen relativos a `src-tauri/`**.
- El `productName` en `tauri.conf.json` es `"inkwell"` (minúscula). Esto afecta el nombre del binario, pero **no** necesariamente el del `.desktop`. El `<launchable>` del XML debe coincidir con el nombre del `.desktop` generado por Tauri, que habitualmente deriva del `identifier`.
- Si `convert` (ImageMagick) no está disponible, cualquier herramienta que genere PNGs válidos de las dimensiones exactas sirve. Documentar la herramienta usada.
- El archivo `LICENSE` es nuevo en el repo; asegurarse de que no exista previamente (el Explorer confirmó que no existe).

---

### Criterios de aceptación globales

- [ ] Existe `src-tauri/assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml` con contenido válido y ajustado.
- [ ] Existen los 6 iconos en `src-tauri/assets/linux/icons/` (16, 32, 64, 128, 256, 512) con dimensiones correctas.
- [ ] Existen los 3 placeholders de screenshots en `src-tauri/assets/linux/screenshots/` (1248×702).
- [ ] Existe `LICENSE` MIT en la raíz del proyecto.
- [ ] `src-tauri/tauri.conf.json` incluye `publisher`, `homepage`, `shortDescription`, `longDescription`, `category`, `license`, y las secciones `linux.deb` / `linux.rpm` con los mapeos de archivos.
- [ ] El `identifier` en `tauri.conf.json` sigue siendo `net.neocodelabs.inkwell`.
- [ ] El XML metainfo pasa `xmllint --noout` sin errores, y `appstreamcli validate` (si está disponible) sin errores críticos.
- [ ] Todos los paths referenciados en `tauri.conf.json` existen en el árbol de archivos.
