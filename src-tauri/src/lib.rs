mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
