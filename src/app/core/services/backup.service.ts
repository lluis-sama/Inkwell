import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import { TauriBridgeService } from './tauri-bridge.service';
import { ProjectService } from './project.service';
import { ToastService } from '../../shared/services/toast.service';
import {
  projectJsonPath,
  documentsFolderPath,
  boardsFolderPath,
  documentPath,
  boardPath,
} from '../../shared/utils/project-paths';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private bridge  = inject(TauriBridgeService);
  private projectService = inject(ProjectService);
  private toast   = inject(ToastService);
  private _JSZip  = JSZip;

  async createBackup(): Promise<void> {
    const proj     = this.projectService.project();
    const basePath = this.projectService.basePath();
    if (!proj || !basePath) return;

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 10);
    const defaultName = `${proj.name}-backup-${timestamp}.zip`;

    const savePath = await this.bridge.saveFileDialog(defaultName, 'zip');
    if (!savePath) return;

    try {
      const zip = new this._JSZip();

      // project.json
      const projectJson = await this.bridge.readJsonFile(projectJsonPath(basePath));
      zip.file('project.json', projectJson);

      // documents/
      const docIds = await this.bridge.listJsonFiles(documentsFolderPath(basePath));
      for (const id of docIds) {
        const content = await this.bridge.readJsonFile(documentPath(basePath, id));
        zip.file(`documents/${id}.json`, content);
      }

      // boards/
      const boardIds = await this.bridge.listJsonFiles(boardsFolderPath(basePath));
      for (const id of boardIds) {
        const content = await this.bridge.readJsonFile(boardPath(basePath, id));
        zip.file(`boards/${id}.json`, content);
      }

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      await this.bridge.writeBinaryFile(savePath, buffer);

      this.toast.success(`Backup guardado: ${defaultName}`);
    } catch (e) {
      this.toast.error(`Error al crear el backup: ${e}`);
    }
  }
}
