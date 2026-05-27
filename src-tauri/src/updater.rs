use reqwest::Client;
use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const RELEASES_API: &str =
    "https://codeberg.org/api/v1/repos/frozenfangkb/inkwell/releases/latest";
const RELEASES_PAGE: &str = "https://codeberg.org/frozenfangkb/inkwell/releases";

#[derive(Debug, Deserialize)]
struct ForgejoRelease {
    tag_name: String,
    body: Option<String>,
    html_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub release_notes: String,
    pub url: String,
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current = app.package_info().version.clone();
    let current_semver = Version::new(
        current.major as u64,
        current.minor as u64,
        current.patch as u64,
    );

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("inkwell-updater")
        .build()
        .map_err(|e| e.to_string())?;

    let release: ForgejoRelease = client
        .get(RELEASES_API)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let remote_version_str = release.tag_name.trim_start_matches('v');
    let remote_semver = Version::parse(remote_version_str).map_err(|e| e.to_string())?;

    if remote_semver > current_semver {
        let release_notes = release
            .body
            .as_deref()
            .unwrap_or("")
            .lines()
            .take(20)
            .collect::<Vec<_>>()
            .join("\n");

        Ok(Some(UpdateInfo {
            version: remote_semver.to_string(),
            release_notes,
            url: release.html_url.unwrap_or_else(|| RELEASES_PAGE.to_string()),
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn open_releases_page(url: String, app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
