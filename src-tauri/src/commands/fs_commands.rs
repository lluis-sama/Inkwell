use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::sync::oneshot;

// ─── Diálogos de selección de carpeta ───────────────────────────────────────

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

#[tauri::command]
pub fn read_json_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo {}: {}", path, e))
}

#[tauri::command]
pub fn write_json_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Error creando directorios para {}: {}", path, e))?;
    }
    fs::write(&path, content)
        .map_err(|e| format!("Error escribiendo {}: {}", path, e))
}

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

#[tauri::command]
pub fn delete_json_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        fs::remove_file(p)
            .map_err(|e| format!("Error eliminando {}: {}", path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_project_structure(base_path: String) -> Result<(), String> {
    let base = Path::new(&base_path);

    fs::create_dir_all(base.join("documents"))
        .map_err(|e| format!("Error creando documents/: {}", e))?;

    fs::create_dir_all(base.join("boards"))
        .map_err(|e| format!("Error creando boards/: {}", e))?;

    Ok(())
}

// ─── Ventana ─────────────────────────────────────────────────────────────────

/// Actualiza el título de la ventana principal.
#[tauri::command]
pub fn set_window_title(app: AppHandle, title: String) -> Result<(), String> {
    app.get_webview_window("main")
       .ok_or("Ventana no encontrada".to_string())?
       .set_title(&title)
       .map_err(|e| e.to_string())
}

// ─── Exportación ─────────────────────────────────────────────────────────────

/// Abre una ventana WebView con el HTML del manuscrito para imprimir como PDF.
#[tauri::command]
pub async fn open_print_window(app: tauri::AppHandle, html: String) -> Result<(), String> {
    let temp_path = std::env::temp_dir().join("inkwell_manuscript_print.html");
    std::fs::write(&temp_path, html)
        .map_err(|e| e.to_string())?;

    let url = format!("file://{}", temp_path.to_string_lossy());
    tauri::WebviewWindowBuilder::new(&app, "print", tauri::WebviewUrl::External(url.parse().unwrap()))
        .title("Inkwell — Exportar manuscrito")
        .inner_size(900.0, 1200.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Abre un diálogo de guardar archivo y retorna la ruta elegida.
#[tauri::command]
pub async fn save_file_dialog(
    app: tauri::AppHandle,
    default_name: String,
    extension: String,
) -> Option<String> {
    let (tx, rx) = oneshot::channel::<Option<FilePath>>();

    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Archivo", &[extension.as_str()])
        .save_file(move |result| { let _ = tx.send(result); });

    match rx.await {
        Ok(Some(FilePath::Path(path))) => Some(path.to_string_lossy().to_string()),
        _ => None,
    }
}

/// Escribe datos binarios en un fichero (para el EPUB).
#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("Error creando {}: {}", path, e))?;
    file.write_all(&data)
        .map_err(|e| format!("Error escribiendo {}: {}", path, e))
}
