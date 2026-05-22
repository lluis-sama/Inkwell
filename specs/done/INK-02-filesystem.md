# INK-02 — Filesystem (Tauri commands + TauriBridgeService)

## Objetivo

Implementar todos los comandos Rust de acceso a filesystem que usará la app, y el servicio Angular `TauriBridgeService` que los envuelve. Al finalizar esta spec, la app puede crear, leer, escribir, listar y eliminar los archivos JSON de un proyecto desde Angular, sin que ningún otro servicio o componente interactúe con Tauri directamente.

---

## Regla fundamental

**`TauriBridgeService` es el único lugar de toda la app que importa `@tauri-apps/api`.**
Cualquier otro servicio o componente que necesite acceso a disco lo hace a través de este servicio.

---

## Parte 1: Rust

### `src-tauri/Cargo.toml` — dependencias finales

```toml
[package]
name = "inkwell"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri            = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs     = "2"
serde            = { version = "1", features = ["derive"] }
serde_json       = "1"
tokio            = { version = "1", features = ["sync"] }
```

---

### `src-tauri/src/commands/fs_commands.rs`

Crear el archivo `src-tauri/src/commands/fs_commands.rs` con el siguiente contenido:

```rust
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::sync::oneshot;

// ─── Diálogos de selección de carpeta ───────────────────────────────────────

/// Abre un diálogo para que el usuario seleccione una carpeta existente.
/// Retorna la ruta absoluta como String, o None si el usuario cancela.
#[tauri::command]
pub async fn open_folder_dialog(app: AppHandle) -> Option<String> {
    let (tx, rx) = oneshot::channel::<Option<FilePath>>();

    app.dialog().file().pick_folder(move |result| {
        let _ = tx.send(result);
    });

    match rx.await {
        Ok(Some(FilePath::Path(path))) => Some(path.to_string_lossy().to_string()),
        _ => None,
    }
}

/// Abre un diálogo para que el usuario elija dónde crear un proyecto nuevo.
/// Funcionalmente igual a open_folder_dialog; se expone como comando separado
/// para que el frontend pueda distinguir la intención.
#[tauri::command]
pub async fn select_new_project_folder(app: AppHandle) -> Option<String> {
    let (tx, rx) = oneshot::channel::<Option<FilePath>>();

    app.dialog().file().pick_folder(move |result| {
        let _ = tx.send(result);
    });

    match rx.await {
        Ok(Some(FilePath::Path(path))) => Some(path.to_string_lossy().to_string()),
        _ => None,
    }
}

// ─── Operaciones de archivo ──────────────────────────────────────────────────

/// Lee el contenido de un archivo y lo retorna como String.
/// Retorna error si el archivo no existe o no se puede leer.
#[tauri::command]
pub fn read_json_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo {}: {}", path, e))
}

/// Escribe contenido en un archivo. Crea el archivo si no existe.
/// Crea los directorios intermedios si no existen.
#[tauri::command]
pub fn write_json_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Error creando directorios para {}: {}", path, e))?;
    }
    fs::write(&path, content)
        .map_err(|e| format!("Error escribiendo {}: {}", path, e))
}

/// Lista los nombres de archivo (sin extensión .json) dentro de una carpeta.
/// Solo lista archivos directos, no recursivo.
/// Retorna lista vacía si la carpeta no existe o está vacía.
#[tauri::command]
pub fn list_json_files(folder_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&folder_path);

    if !path.exists() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(path)
        .map_err(|e| format!("Error leyendo directorio {}: {}", folder_path, e))?;

    let mut ids = Vec::new();
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        if name.ends_with(".json") {
            ids.push(name.trim_end_matches(".json").to_string());
        }
    }

    Ok(ids)
}

/// Elimina un archivo JSON.
/// No retorna error si el archivo no existe (operación idempotente).
#[tauri::command]
pub fn delete_json_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        fs::remove_file(p)
            .map_err(|e| format!("Error eliminando {}: {}", path, e))?;
    }
    Ok(())
}

/// Crea la estructura de carpetas de un proyecto nuevo.
/// Crea: {base_path}/documents/ y {base_path}/boards/
/// Idempotente: no falla si las carpetas ya existen.
#[tauri::command]
pub fn create_project_structure(base_path: String) -> Result<(), String> {
    let base = Path::new(&base_path);

    fs::create_dir_all(base.join("documents"))
        .map_err(|e| format!("Error creando documents/: {}", e))?;

    fs::create_dir_all(base.join("boards"))
        .map_err(|e| format!("Error creando boards/: {}", e))?;

    Ok(())
}
```

---

### `src-tauri/src/commands/mod.rs`

```rust
pub mod fs_commands;
```

---

### `src-tauri/src/main.rs`

```rust
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
use commands::fs_commands::*;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            open_folder_dialog,
            select_new_project_folder,
            read_json_file,
            write_json_file,
            list_json_files,
            delete_json_file,
            create_project_structure,
        ])
        .run(tauri::generate_context!())
        .expect("Error al arrancar Inkwell");
}
```

---

### `src-tauri/capabilities/default.json`

Añadir los permisos necesarios para los plugins:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability por defecto de Inkwell",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-dir",
    "fs:allow-remove-file",
    "fs:allow-create-dir",
    "fs:allow-exists"
  ]
}
```

---

## Parte 2: Angular

### `src/app/core/services/tauri-bridge.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

@Injectable({ providedIn: 'root' })
export class TauriBridgeService {

  /**
   * Abre un diálogo para seleccionar una carpeta existente.
   * Retorna la ruta absoluta, o null si el usuario cancela.
   */
  openFolderDialog(): Promise<string | null> {
    return invoke<string | null>('open_folder_dialog');
  }

  /**
   * Abre un diálogo para seleccionar dónde crear un proyecto nuevo.
   * Retorna la ruta absoluta, o null si el usuario cancela.
   */
  selectNewProjectFolder(): Promise<string | null> {
    return invoke<string | null>('select_new_project_folder');
  }

  /**
   * Lee el contenido de un archivo JSON.
   * Lanza error si el archivo no existe.
   */
  readJsonFile(path: string): Promise<string> {
    return invoke<string>('read_json_file', { path });
  }

  /**
   * Escribe contenido en un archivo JSON.
   * Crea el archivo y los directorios intermedios si no existen.
   */
  writeJsonFile(path: string, content: string): Promise<void> {
    return invoke<void>('write_json_file', { path, content });
  }

  /**
   * Lista los IDs (nombres de archivo sin .json) en una subcarpeta del proyecto.
   * Retorna array vacío si la carpeta no existe o está vacía.
   */
  listJsonFiles(folderPath: string): Promise<string[]> {
    return invoke<string[]>('list_json_files', { folderPath });
  }

  /**
   * Elimina un archivo JSON.
   * Operación idempotente: no lanza error si el archivo no existe.
   */
  deleteJsonFile(path: string): Promise<void> {
    return invoke<void>('delete_json_file', { path });
  }

  /**
   * Crea la estructura de carpetas de un proyecto nuevo.
   * Crea {basePath}/documents/ y {basePath}/boards/
   * Idempotente: no falla si las carpetas ya existen.
   */
  createProjectStructure(basePath: string): Promise<void> {
    return invoke<void>('create_project_structure', { basePath });
  }
}
```

---

## Parte 3: Componente de prueba temporal

Para validar los comandos sin esperar a la spec INK-04, añadir un bloque de prueba en `ProjectManagerComponent`. **Este bloque se elimina al comenzar INK-04.**

```typescript
import { Component, inject, signal } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';

@Component({
  selector: 'app-project-manager',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center h-screen bg-ink-bg gap-4">
      <h1 class="text-ink-text text-3xl font-serif tracking-wide">Inkwell</h1>

      <div class="flex flex-col gap-2 w-80">

        <button (click)="testCreateStructure()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm border border-ink-border hover:border-ink-accent transition-colors">
          Test: Crear estructura de proyecto
        </button>

        <button (click)="testWriteAndRead()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm border border-ink-border hover:border-ink-accent transition-colors">
          Test: Escribir y leer JSON
        </button>

        <button (click)="testListFiles()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm border border-ink-border hover:border-ink-accent transition-colors">
          Test: Listar archivos
        </button>

        <button (click)="testDeleteFile()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm border border-ink-border hover:border-ink-accent transition-colors">
          Test: Eliminar archivo
        </button>

        <button (click)="theme.toggle()"
          class="px-4 py-2 rounded bg-ink-surface text-ink-subtle text-sm border border-ink-border hover:border-ink-border transition-colors">
          Tema: {{ theme.theme() }}
        </button>
      </div>

      @if (output()) {
        <pre class="mt-4 p-4 rounded bg-ink-surface text-ink-text text-xs w-80 max-h-48 overflow-auto border border-ink-border">{{ output() }}</pre>
      }
    </div>
  `,
})
export class ProjectManagerComponent {
  theme  = inject(ThemeService);
  bridge = inject(TauriBridgeService);
  output = signal('');

  // Ruta de prueba en el home del usuario
  private testPath = '/tmp/inkwell-test';

  async testCreateStructure() {
    try {
      await this.bridge.createProjectStructure(this.testPath);
      this.output.set(`✓ Estructura creada en ${this.testPath}`);
    } catch (e) {
      this.output.set(`✗ Error: ${e}`);
    }
  }

  async testWriteAndRead() {
    try {
      const filePath = `${this.testPath}/documents/test-doc.json`;
      const data = JSON.stringify({ id: 'test-doc', title: 'Prueba', content: {} }, null, 2);
      await this.bridge.writeJsonFile(filePath, data);
      const read = await this.bridge.readJsonFile(filePath);
      this.output.set(`✓ Escrito y leído:\n${read}`);
    } catch (e) {
      this.output.set(`✗ Error: ${e}`);
    }
  }

  async testListFiles() {
    try {
      const ids = await this.bridge.listJsonFiles(`${this.testPath}/documents`);
      this.output.set(`✓ Archivos encontrados: ${JSON.stringify(ids)}`);
    } catch (e) {
      this.output.set(`✗ Error: ${e}`);
    }
  }

  async testDeleteFile() {
    try {
      const filePath = `${this.testPath}/documents/test-doc.json`;
      await this.bridge.deleteJsonFile(filePath);
      this.output.set(`✓ Archivo eliminado`);
    } catch (e) {
      this.output.set(`✗ Error: ${e}`);
    }
  }
}
```

---

## Criterios de aceptación

- [ ] `npm run tauri dev` compila sin errores de Rust ni de TypeScript
- [ ] **Test crear estructura**: crea `/tmp/inkwell-test/documents/` y `/tmp/inkwell-test/boards/` en disco
- [ ] **Test escribir y leer**: escribe un JSON en disco y lo lee correctamente con el mismo contenido
- [ ] **Test listar archivos**: retorna `["test-doc"]` después del test de escritura
- [ ] **Test eliminar**: el archivo desaparece del disco; ejecutar listar después devuelve `[]`
- [ ] Ejecutar "Crear estructura" dos veces no lanza error (idempotente)
- [ ] Ejecutar "Eliminar" sobre un archivo inexistente no lanza error (idempotente)
- [ ] El diálogo de carpeta abre correctamente (se puede probar manualmente desde consola de navegador con `window.__TAURI__.core.invoke('open_folder_dialog')`)
- [ ] Ningún componente fuera de `TauriBridgeService` importa `@tauri-apps/api`

---

## Lo que NO hacer en esta spec

- No crear `ProjectService`, `DocumentService` ni `BoardService` todavía
- No implementar lógica de negocio en los comandos Rust (sin parseo de JSON en Rust; eso es responsabilidad de Angular)
- No añadir persistencia de proyectos recientes
- No eliminar el componente de prueba hasta INK-04
