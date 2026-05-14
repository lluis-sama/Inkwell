use std::fs;
use std::path::Path;
use tauri::AppHandle;
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
