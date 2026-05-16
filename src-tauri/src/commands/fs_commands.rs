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

// ─── Importación ─────────────────────────────────────────────────────────────

/// Abre un diálogo de selección de archivos con filtro por extensión.
/// Retorna un Vec vacío si el usuario cancela.
#[tauri::command]
pub async fn open_files_dialog(
    app: tauri::AppHandle,
    extensions: Vec<String>,
    multiple: bool,
) -> Vec<String> {
    let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();

    if multiple {
        let (tx, rx) = oneshot::channel::<Option<Vec<FilePath>>>();
        app.dialog()
            .file()
            .add_filter("Documentos", &ext_refs)
            .pick_files(move |result| { let _ = tx.send(result); });
        match rx.await {
            Ok(Some(paths)) => paths.into_iter().filter_map(|p| {
                if let FilePath::Path(path) = p {
                    Some(path.to_string_lossy().to_string())
                } else {
                    None
                }
            }).collect(),
            _ => vec![],
        }
    } else {
        let (tx, rx) = oneshot::channel::<Option<FilePath>>();
        app.dialog()
            .file()
            .add_filter("Documentos", &ext_refs)
            .pick_file(move |result| { let _ = tx.send(result); });
        match rx.await {
            Ok(Some(FilePath::Path(p))) => vec![p.to_string_lossy().to_string()],
            _ => vec![],
        }
    }
}

/// Lee el contenido binario de un archivo en disco.
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Error leyendo {}: {}", path, e))
}

/// Convierte un archivo ODT a DOCX usando LibreOffice CLI y retorna la ruta del DOCX temporal.
/// Retorna error descriptivo si LibreOffice no está instalado.
#[tauri::command]
pub fn convert_odt_to_docx(path: String) -> Result<String, String> {
    use std::process::Command;

    // Verificar que LibreOffice está disponible antes de intentar la conversión
    let version_check = Command::new("soffice").arg("--version").output();
    match version_check {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(
                "LibreOffice no está instalado o no está en el PATH. \
                 Instala LibreOffice para importar archivos ODT."
                    .to_string(),
            );
        }
        Err(e) => return Err(format!("Error verificando LibreOffice: {}", e)),
        Ok(_) => {}
    }

    let input_path = Path::new(&path);
    let stem = input_path
        .file_stem()
        .ok_or_else(|| "Nombre de archivo inválido".to_string())?
        .to_string_lossy();
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join(format!("{}.docx", stem));

    let result = Command::new("soffice")
        .args([
            "--headless",
            "--convert-to",
            "docx",
            &path,
            "--outdir",
            temp_dir.to_str().unwrap_or("/tmp"),
        ])
        .output()
        .map_err(|e| format!("Error ejecutando LibreOffice: {}", e))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("LibreOffice no pudo convertir el archivo: {}", stderr));
    }

    Ok(output_path.to_string_lossy().to_string())
}
