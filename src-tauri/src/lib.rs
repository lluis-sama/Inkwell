use tauri::Manager;

mod commands;
mod languagetool;
mod updater;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // CRÍTICO-6: limpiar descargas parciales de sesiones anteriores
                let base = handle.path().app_data_dir().unwrap().join("languagetool");
                if base.exists() && !base.join("installed").exists() {
                    let _ = std::fs::remove_dir_all(&base);
                }
            });
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                languagetool::lt_stop_server();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs_commands::open_folder_dialog,
            commands::fs_commands::select_new_project_folder,
            commands::fs_commands::read_json_file,
            commands::fs_commands::write_json_file,
            commands::fs_commands::list_json_files,
            commands::fs_commands::delete_json_file,
            commands::fs_commands::create_project_structure,
            commands::fs_commands::set_window_title,
            commands::fs_commands::open_print_window,
            commands::fs_commands::save_file_dialog,
            commands::fs_commands::write_binary_file,
            commands::fs_commands::open_files_dialog,
            commands::fs_commands::read_file_bytes,
            commands::fs_commands::convert_odt_to_docx,
            commands::fs_commands::create_folder,
            commands::fs_commands::folder_exists,
            commands::fs_commands::read_app_config,
            commands::fs_commands::write_app_config,
            updater::check_for_update,
            updater::open_releases_page,
            languagetool::lt_is_installed,
            languagetool::lt_download_and_install,
            languagetool::lt_start_server,
            languagetool::lt_stop_server,
            languagetool::lt_server_ready,
            languagetool::lt_uninstall,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
