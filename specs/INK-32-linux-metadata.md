# INK-32 — Metadatos de paquetes Linux (.deb y .rpm)

## Objetivo

Enriquecer los paquetes `.deb` y `.rpm` generados por el pipeline de CI/CD con metadatos completos: descripción, categorías, capturas de pantalla, iconos en múltiples tamaños y notas de versión. El resultado es que Inkwell aparecerá correctamente en los centros de software de Linux (GNOME Software, KDE Discover, Ubuntu Software Center) con toda su información visible.

---

## Contexto técnico

Los centros de software de Linux leen metadatos en formato **AppStream** (estándar freedesktop.org). El fichero es un XML con extensión `.metainfo.xml` que se instala en `/usr/share/metainfo/`. Tauri no lo genera automáticamente pero permite incluir ficheros extra en el bundle mediante configuración.

Lo que se mejora con esta spec:
- Sin esta spec: el paquete instala la app y poco más. En un centro de software aparece sin descripción, sin capturas, sin categorías.
- Con esta spec: aparece con descripción completa, capturas, icono correcto, categorías y changelog de versiones.

---

## Estructura de ficheros nuevos

```
src-tauri/
  assets/
    linux/
      metainfo/
        org.codeberg.frozenfangkb.inkwell.metainfo.xml
      icons/
        16x16.png     ← ya existen probablemente desde el scaffolding de Tauri
        32x32.png
        64x64.png
        128x128.png
        256x256.png
        512x512.png
      screenshots/
        01-editor.png
        02-binder.png
        03-ai-assistant.png
```

El ID de AppStream sigue la convención de reverse-domain: `org.codeberg.frozenfangkb.inkwell`.

---

## El fichero metainfo XML

`src-tauri/assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>org.codeberg.frozenfangkb.inkwell</id>

  <name>Inkwell</name>
  <summary>Entorno de escritura creativa para escritores serios</summary>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>  <!-- ajustar a la licencia real del proyecto -->

  <description>
    <p>
      Inkwell es una alternativa open source a Scrivener, diseñada para Linux,
      Windows y macOS. Ofrece un entorno completo para escritores de novelas,
      guiones y proyectos de escritura larga.
    </p>
    <p>Características principales:</p>
    <ul>
      <li>Editor de texto enriquecido con modo máquina de escribir y modo foco</li>
      <li>Binder para organizar documentos, carpetas y escenas</li>
      <li>Tableros de corcho para visualizar la estructura narrativa</li>
      <li>Snapshots para guardar versiones de cada documento</li>
      <li>Asistente de IA integrado con soporte para Anthropic, Ollama y proveedores compatibles con OpenAI</li>
      <li>Transcripción de audio</li>
      <li>Exportación a DOCX, PDF, Markdown y otros formatos</li>
      <li>Objetivos de escritura y estadísticas de sesión</li>
      <li>Corrector gramatical avanzado con LanguageTool (descarga opcional)</li>
      <li>Temas claro y oscuro basados en Catppuccin</li>
      <li>Interfaz completamente en español e inglés</li>
    </ul>
  </description>

  <launchable type="desktop-id">inkwell.desktop</launchable>

  <url type="homepage">https://codeberg.org/frozenfangkb/inkwell</url>
  <url type="bugtracker">https://codeberg.org/frozenfangkb/inkwell/issues</url>
  <url type="vcs-browser">https://codeberg.org/frozenfangkb/inkwell</url>

  <developer id="org.codeberg.frozenfangkb">
    <name>David Rodriguez Miranda</name>
  </developer>

  <categories>
    <category>Office</category>
    <category>WordProcessor</category>
  </categories>

  <keywords>
    <keyword>escritura</keyword>
    <keyword>novela</keyword>
    <keyword>scrivener</keyword>
    <keyword>editor</keyword>
    <keyword>writing</keyword>
    <keyword>novel</keyword>
    <keyword>markdown</keyword>
    <keyword>creative writing</keyword>
  </keywords>

  <screenshots>
    <screenshot type="default">
      <caption>Editor principal con tema oscuro Catppuccin Mocha</caption>
      <image type="source">https://codeberg.org/frozenfangkb/inkwell/raw/branch/main/src-tauri/assets/linux/screenshots/01-editor.png</image>
    </screenshot>
    <screenshot>
      <caption>Binder de documentos y estructura del proyecto</caption>
      <image type="source">https://codeberg.org/frozenfangkb/inkwell/raw/branch/main/src-tauri/assets/linux/screenshots/02-binder.png</image>
    </screenshot>
    <screenshot>
      <caption>Asistente de IA integrado</caption>
      <image type="source">https://codeberg.org/frozenfangkb/inkwell/raw/branch/main/src-tauri/assets/linux/screenshots/03-ai-assistant.png</image>
    </screenshot>
  </screenshots>

  <content_rating type="oars-1.1" />

  <releases>
    <!-- Actualizar con cada release. El pipeline de CI puede automatizar esto. -->
    <release version="1.0.0" date="2026-01-01">
      <description>
        <p>Primera versión estable de Inkwell.</p>
      </description>
    </release>
  </releases>

  <supports>
    <control>pointing</control>
    <control>keyboard</control>
  </supports>
</component>
```

**Notas sobre el XML:**
- `metadata_license`: siempre `CC0-1.0` — es la licencia del fichero de metadatos en sí, no de la app.
- `project_license`: ajustar a la licencia real de Inkwell (MIT, GPL, etc.).
- Las URLs de screenshots apuntan al fichero raw en Codeberg. Deben ser URLs públicas y estables. Alternativa: alojarlas en Codeberg Pages si existe el site de Inkwell.
- El bloque `<releases>` idealmente se actualiza con cada release. Ver sección de CI más abajo.

---

## Configuración de Tauri

En `src-tauri/tauri.conf.json`, dentro de `bundle`:

```json
{
  "bundle": {
    "identifier": "org.codeberg.frozenfangkb.inkwell",
    "publisher": "David Rodriguez Miranda",
    "homepage": "https://codeberg.org/frozenfangkb/inkwell",
    "shortDescription": "Entorno de escritura creativa para escritores serios",
    "longDescription": "Inkwell es una alternativa open source a Scrivener para Linux, Windows y macOS. Editor de texto, binder, tableros de corcho, asistente de IA y más.",
    "category": "Office",
    "linux": {
      "deb": {
        "files": {
          "/usr/share/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml": "assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml",
          "/usr/share/icons/hicolor/256x256/apps/inkwell.png": "assets/linux/icons/256x256.png",
          "/usr/share/icons/hicolor/512x512/apps/inkwell.png": "assets/linux/icons/512x512.png"
        },
        "section": "editors",
        "priority": "optional",
        "depends": []
      },
      "rpm": {
        "files": {
          "/usr/share/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml": "assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml",
          "/usr/share/icons/hicolor/256x256/apps/inkwell.png": "assets/linux/icons/256x256.png",
          "/usr/share/icons/hicolor/512x512/apps/inkwell.png": "assets/linux/icons/512x512.png"
        },
        "license": "MIT",
        "group": "Applications/Editors"
      }
    }
  }
}
```

**Nota:** los iconos en `/usr/share/icons/hicolor/` son adicionales al icono que Tauri ya instala por defecto. La doble entrada garantiza que el icono aparece correctamente tanto en el centro de software como en el lanzador del sistema.

---

## Capturas de pantalla

Las capturas deben cumplir los requisitos de AppStream:
- Formato: PNG
- Tamaño recomendado: **1248×702px** (16:9, el más común en centros de software)
- La captura `type="default"` es la que aparece destacada

Hacer capturas de:
1. `01-editor.png` — editor abierto con un proyecto de muestra, tema oscuro
2. `02-binder.png` — binder con estructura de carpetas y documentos
3. `03-ai-assistant.png` — panel de asistente de IA en uso

Las capturas se commitean en el repositorio en `src-tauri/assets/linux/screenshots/`. Las URLs en el XML apuntan al raw de Codeberg.

---

## Integración con el pipeline CI/CD

### Opción A — Actualización manual del XML (recomendada por ahora)

Actualizar el bloque `<releases>` del XML manualmente en cada release, igual que las notas de release. Simple y sin complejidad extra.

### Opción B — Actualización automática en el pipeline

Añadir un step en el workflow de Forgejo Actions que actualice la versión y fecha en el XML antes de compilar:

```yaml
- name: Update metainfo release version
  run: |
    VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | grep -oP '"\K[^"]+(?=")')
    DATE=$(date +%Y-%m-%d)
    sed -i "s/<release version=\".*\" date=\".*\">/<release version=\"$VERSION\" date=\"$DATE\">/" \
      src-tauri/assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml
```

La Opción B es más elegante pero añade fragilidad al pipeline. Decidir según el grado de automatización deseado.

---

## Validación del XML

Antes de hacer merge, validar el fichero con `appstreamcli`:

```bash
appstreamcli validate src-tauri/assets/linux/metainfo/org.codeberg.frozenfangkb.inkwell.metainfo.xml
```

En Debian/Ubuntu: `sudo apt install appstream`.

Errores comunes que detecta el validador:
- Screenshots sin URL accesible
- `metadata_license` incorrecto
- Falta de `<content_rating>`
- Formato de fecha incorrecto en `<releases>`

---

## Tests de criterio de aceptación

- [ ] El paquete `.deb` generado contiene el fichero metainfo XML en `/usr/share/metainfo/`
- [ ] El paquete `.rpm` generado contiene el fichero metainfo XML en `/usr/share/metainfo/`
- [ ] `appstreamcli validate` no devuelve errores ni warnings en el XML
- [ ] En GNOME Software o KDE Discover, Inkwell aparece con descripción, categoría y capturas
- [ ] Los iconos de 256x256 y 512x512 aparecen correctamente en el lanzador tras instalar el paquete
- [ ] Las capturas de pantalla son accesibles desde las URLs referenciadas en el XML

---

## Lo que esta spec NO hace

- No genera metadatos para el instalador `.msi` de Windows (eso usa WiX, es una spec separada si se quiere)
- No genera metadatos para el `.dmg` de macOS
- No publica Inkwell en ningún repositorio de paquetes (Flathub, AUR, etc.) — eso es una spec de distribución separada
- No implementa la actualización automática del bloque `<releases>` en CI (queda como mejora opcional)
