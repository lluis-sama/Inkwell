use std::io::Cursor;
use tauri::Emitter;
use tauri::Manager;

const LT_PORT: u16 = 8081;
const LT_VERSION: &str = "6.6";
const JRE_VERSION: u16 = 21;

pub static LT_PROCESS: std::sync::Mutex<Option<std::process::Child>> =
    std::sync::Mutex::new(None);

#[derive(Clone, serde::Serialize)]
pub struct LtProgressPayload {
    pub phase: &'static str, // "jre" | "lt"
    pub percent: u8,
    pub message: String,
}

fn detect_platform() -> Result<(&'static str, &'static str), String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => Ok(("linux", "x64")),
        ("linux", "aarch64") => Ok(("linux", "aarch64")),
        ("windows", _) => Ok(("windows", "x64")),
        ("macos", "x86_64") => Ok(("mac", "x64")),
        ("macos", "aarch64") => Ok(("mac", "aarch64")),
        _ => Err("Plataforma no soportada".to_string()),
    }
}

fn find_java_bin(jre_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let entries = std::fs::read_dir(jre_dir)
        .map_err(|e| format!("No se puede leer el directorio JRE: {}", e))?;

    for entry in entries.flatten() {
        let subdir = entry.path();
        if !subdir.is_dir() {
            continue;
        }

        let candidate = match std::env::consts::OS {
            "macos" => subdir.join("Contents").join("Home").join("bin").join("java"),
            "windows" => subdir.join("bin").join("java.exe"),
            _ => subdir.join("bin").join("java"),
        };

        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("No se encontró el binario de Java".to_string())
}

fn find_lt_jar(lt_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let entries = std::fs::read_dir(lt_dir)
        .map_err(|e| format!("No se puede leer el directorio LT: {}", e))?;

    for entry in entries.flatten() {
        let subdir = entry.path();
        if !subdir.is_dir() {
            continue;
        }

        let candidate = subdir.join("languagetool-server.jar");
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("No se encontró languagetool-server.jar".to_string())
}

fn port_in_use(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_err()
}

async fn download_and_extract(
    app: &tauri::AppHandle,
    url: &str,
    dest: &std::path::Path,
    phase: &'static str,
    format: &str,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Error HTTP {}: {}",
            response.status(),
            url
        ));
    }

    let content_length = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    let message = if phase == "jre" {
        "LT.DOWNLOADING_JRE"
    } else {
        "LT.DOWNLOADING_LT"
    };

    app.emit(
        "lt-progress",
        LtProgressPayload {
            phase,
            percent: 0,
            message: message.to_string(),
        },
    )
    .ok();

    // Descargar todo de golpe para compatibilidad con la API de reqwest
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let total = content_length.unwrap_or(bytes.len() as u64);
    let _ = total; // ya tenemos los bytes completos

    app.emit(
        "lt-progress",
        LtProgressPayload {
            phase,
            percent: 50,
            message: "LT.EXTRACTING".to_string(),
        },
    )
    .ok();

    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    if format == "zip" {
        let cursor = Cursor::new(bytes.as_ref());
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let outpath = dest.join(file.name());

            if file.name().ends_with('/') {
                std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(parent) = outpath.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;

                // Preservar permisos en Unix
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Some(mode) = file.unix_mode() {
                        std::fs::set_permissions(&outpath, std::fs::Permissions::from_mode(mode))
                            .ok();
                    }
                }
            }
        }
    } else {
        // tar.gz
        let cursor = Cursor::new(bytes.as_ref());
        let gz = flate2::read::GzDecoder::new(cursor);
        let mut archive = tar::Archive::new(gz);
        archive.unpack(dest).map_err(|e| e.to_string())?;
    }

    app.emit(
        "lt-progress",
        LtProgressPayload {
            phase,
            percent: 100,
            message: "LT.COMPLETED".to_string(),
        },
    )
    .ok();

    Ok(())
}

#[tauri::command]
pub fn lt_is_installed(app: tauri::AppHandle) -> bool {
    let base = app.path().app_data_dir().unwrap().join("languagetool");
    base.join("installed").exists()
}

#[tauri::command]
pub async fn lt_download_and_install(app: tauri::AppHandle) -> Result<(), String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("languagetool");

    // CRÍTICO-6: Limpiar descarga parcial anterior
    if base.exists() && !base.join("installed").exists() {
        std::fs::remove_dir_all(&base).map_err(|e| e.to_string())?;
    }

    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let (os, arch) = detect_platform()?;

    // Descargar JRE
    let jre_format = if os == "windows" { "zip" } else { "tar.gz" };
    let jre_url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jre/hotspot/normal/eclipse",
        JRE_VERSION, os, arch
    );
    download_and_extract(&app, &jre_url, &base.join("jre"), "jre", jre_format).await?;

    // Descargar LanguageTool
    let lt_url = format!(
        "https://languagetool.org/download/LanguageTool-{}.zip",
        LT_VERSION
    );
    download_and_extract(&app, &lt_url, &base.join("lt"), "lt", "zip").await?;

    // Marcar como instalado
    std::fs::write(base.join("installed"), "").map_err(|e| e.to_string())?;

    app.emit("lt-install-complete", ()).ok();
    Ok(())
}

#[tauri::command]
pub fn lt_start_server(app: tauri::AppHandle) -> Result<(), String> {
    // CRÍTICO-2: comprobar si el puerto ya está en uso
    if port_in_use(LT_PORT) {
        return Ok(());
    }

    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("languagetool");

    let java_bin = find_java_bin(&base.join("jre"))?;
    let lt_jar = find_lt_jar(&base.join("lt"))?;

    let child = std::process::Command::new(&java_bin)
        .args([
            "-Xmx512m",
            "-jar",
            lt_jar.to_str().unwrap(),
            "--port",
            &LT_PORT.to_string(),
            "--allow-origin",
            "*", // CRÍTICO-5
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    *LT_PROCESS.lock().unwrap() = Some(child);
    Ok(())
}

#[tauri::command]
pub fn lt_stop_server() {
    if let Ok(mut guard) = LT_PROCESS.lock() {
        if let Some(mut child) = guard.take() {
            child.kill().ok();
            child.wait().ok(); // evitar zombies
        }
    }
}

#[tauri::command]
pub async fn lt_server_ready() -> bool {
    let url = format!("http://localhost:{}/v2/languages", LT_PORT);
    reqwest::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .is_ok()
}

#[tauri::command]
pub fn lt_uninstall(app: tauri::AppHandle) -> Result<(), String> {
    lt_stop_server();
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("languagetool");
    if base.exists() {
        std::fs::remove_dir_all(&base).map_err(|e| e.to_string())?;
    }
    Ok(())
}
