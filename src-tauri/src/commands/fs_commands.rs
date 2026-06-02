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
    use base64::{Engine as _, engine::general_purpose};

    let encoded = general_purpose::STANDARD.encode(html);
    let url = format!("data:text/html;base64,{}", encoded);

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

#[tauri::command]
pub fn create_folder(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn folder_exists(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
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

// ─── Configuración de la aplicación ─────────────────────────────────────────

fn read_config_from_path(config_path: &std::path::Path) -> Result<String, String> {
    if !config_path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(config_path)
        .map_err(|e| format!("Error leyendo config.json: {}", e))
}

fn write_config_to_path(config_path: &std::path::Path, content: &str) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Error creando directorio de datos: {}", e))?;
    }
    std::fs::write(config_path, content)
        .map_err(|e| format!("Error escribiendo config.json: {}", e))
}

#[tauri::command]
pub async fn read_app_config(app: AppHandle) -> Result<String, String> {
    let config_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("config.json");
    read_config_from_path(&config_path)
}

#[tauri::command]
pub async fn write_app_config(app: AppHandle, content: String) -> Result<(), String> {
    let config_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("config.json");
    write_config_to_path(&config_path, &content)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn write_and_read_json_roundtrip() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test.json").to_string_lossy().to_string();
        let content = r#"{"key": "value"}"#.to_string();

        write_json_file(path.clone(), content.clone()).unwrap();
        let result = read_json_file(path).unwrap();

        assert_eq!(result, content);
    }

    #[test]
    fn write_json_creates_parent_dirs() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("a/b/c/test.json").to_string_lossy().to_string();

        write_json_file(path.clone(), "{}".to_string()).unwrap();

        assert!(std::path::Path::new(&path).exists());
    }

    #[test]
    fn read_json_missing_file_returns_err() {
        let result = read_json_file("/nonexistent/path/file.json".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn list_json_files_returns_ids() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("abc.json"), "{}").unwrap();
        std::fs::write(dir.path().join("def.json"), "{}").unwrap();
        std::fs::write(dir.path().join("notes.txt"), "hello").unwrap();

        let mut ids = list_json_files(dir.path().to_string_lossy().to_string()).unwrap();
        ids.sort();

        assert_eq!(ids, vec!["abc", "def"]);
    }

    #[test]
    fn list_json_files_empty_dir() {
        let dir = TempDir::new().unwrap();
        let ids = list_json_files(dir.path().to_string_lossy().to_string()).unwrap();
        assert!(ids.is_empty());
    }

    #[test]
    fn list_json_files_nonexistent_dir_returns_empty() {
        let result = list_json_files("/nonexistent/dir/that/does/not/exist".to_string()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn delete_json_file_removes_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("to_delete.json");
        std::fs::write(&path, "{}").unwrap();

        delete_json_file(path.to_string_lossy().to_string()).unwrap();

        assert!(!path.exists());
    }

    #[test]
    fn delete_json_file_nonexistent_is_ok() {
        let result = delete_json_file("/nonexistent/file.json".to_string());
        assert!(result.is_ok());
    }

    #[test]
    fn create_project_structure_creates_subdirs() {
        let dir = TempDir::new().unwrap();

        create_project_structure(dir.path().to_string_lossy().to_string()).unwrap();

        assert!(dir.path().join("documents").is_dir());
        assert!(dir.path().join("boards").is_dir());
    }

    #[test]
    fn create_folder_nested() {
        let dir = TempDir::new().unwrap();
        let nested = dir.path().join("a/b/c");

        create_folder(nested.to_string_lossy().to_string()).unwrap();

        assert!(nested.is_dir());
    }

    #[test]
    fn folder_exists_true_for_dir() {
        let dir = TempDir::new().unwrap();
        assert!(folder_exists(dir.path().to_string_lossy().to_string()));
    }

    #[test]
    fn folder_exists_false_for_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("file.txt");
        std::fs::write(&file, "").unwrap();

        assert!(!folder_exists(file.to_string_lossy().to_string()));
    }

    #[test]
    fn folder_exists_false_for_missing() {
        assert!(!folder_exists("/nonexistent/path/that/does/not/exist".to_string()));
    }

    #[test]
    fn write_and_read_binary_roundtrip() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("data.bin").to_string_lossy().to_string();
        let data: Vec<u8> = vec![0x00, 0xFF, 0x42, 0x13, 0x37];

        write_binary_file(path.clone(), data.clone()).unwrap();
        let result = read_file_bytes(path).unwrap();

        assert_eq!(result, data);
    }

    #[test]
    fn read_config_returns_empty_when_missing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");

        let result = read_config_from_path(&path).unwrap();

        assert_eq!(result, "");
    }

    #[test]
    fn read_config_reads_existing_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, r#"{"theme":"dark"}"#).unwrap();

        let result = read_config_from_path(&path).unwrap();

        assert_eq!(result, r#"{"theme":"dark"}"#);
    }

    #[test]
    fn write_and_read_config_roundtrip() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let content = r#"{"aiModel":"claude-sonnet-4-6"}"#;

        write_config_to_path(&path, content).unwrap();
        let result = read_config_from_path(&path).unwrap();

        assert_eq!(result, content);
    }

    #[test]
    fn write_config_creates_parent_dirs() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("app/data/config.json");

        write_config_to_path(&path, "{}").unwrap();

        assert!(path.exists());
    }

    #[test]
    fn write_config_overwrites_existing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "old content").unwrap();

        write_config_to_path(&path, "new content").unwrap();
        let result = read_config_from_path(&path).unwrap();

        assert_eq!(result, "new content");
    }
}

// ─── Conversión ODT ───────────────────────────────────────────────────────────

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
