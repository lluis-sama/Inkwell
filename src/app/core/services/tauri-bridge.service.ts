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
}
