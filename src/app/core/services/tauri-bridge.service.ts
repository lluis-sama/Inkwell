import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

@Injectable({ providedIn: 'root' })
export class TauriBridgeService {

  openFolderDialog(): Promise<string | null> {
    return invoke<string | null>('open_folder_dialog');
  }

  selectNewProjectFolder(): Promise<string | null> {
    return invoke<string | null>('select_new_project_folder');
  }

  readJsonFile(path: string): Promise<string> {
    return invoke<string>('read_json_file', { path });
  }

  writeJsonFile(path: string, content: string): Promise<void> {
    return invoke<void>('write_json_file', { path, content });
  }

  listJsonFiles(folderPath: string): Promise<string[]> {
    return invoke<string[]>('list_json_files', { folderPath });
  }

  deleteJsonFile(path: string): Promise<void> {
    return invoke<void>('delete_json_file', { path });
  }

  createProjectStructure(basePath: string): Promise<void> {
    return invoke<void>('create_project_structure', { basePath });
  }

  setWindowTitle(title: string): Promise<void> {
    return invoke<void>('set_window_title', { title });
  }

  openPrintWindow(html: string): Promise<void> {
    return invoke<void>('open_print_window', { html });
  }

  saveFileDialog(defaultName: string, extension: string): Promise<string | null> {
    return invoke<string | null>('save_file_dialog', { defaultName, extension });
  }

  writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    return invoke<void>('write_binary_file', {
      path,
      data: Array.from(new Uint8Array(data)),
    });
  }

  openFilesDialog(extensions: string[], multiple = false): Promise<string[]> {
    return invoke<string[]>('open_files_dialog', { extensions, multiple });
  }

  readFileBytes(path: string): Promise<number[]> {
    return invoke<number[]>('read_file_bytes', { path });
  }

  convertOdtToDocx(path: string): Promise<string> {
    return invoke<string>('convert_odt_to_docx', { path });
  }

  async createFolder(path: string): Promise<void> {
    return invoke('create_folder', { path });
  }

  async folderExists(path: string): Promise<boolean> {
    return invoke('folder_exists', { path });
  }

  readAppConfig(): Promise<string> {
    return invoke<string>('read_app_config');
  }

  writeAppConfig(content: string): Promise<void> {
    return invoke<void>('write_app_config', { content });
  }
}
