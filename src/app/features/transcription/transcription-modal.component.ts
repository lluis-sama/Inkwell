import { Component, inject, signal, output } from '@angular/core';
import { FormsModule }              from '@angular/forms';
import { Router }                   from '@angular/router';
import { TranscriptionService }     from '../../core/services/transcription.service';
import { TauriBridgeService }       from '../../core/services/tauri-bridge.service';
import { ProjectService }           from '../../core/services/project.service';
import { ToastService }             from '../../shared/services/toast.service';
import { InkModalComponent }        from '../../shared/components/ink-modal.component';
import { InkButtonComponent }       from '../../shared/components/ink-button.component';

const AUDIO_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'webm', 'flac'];
const MAX_SIZE_MB = 25;

@Component({
  selector:    'app-transcription-modal',
  standalone:  true,
  imports:     [InkModalComponent, InkButtonComponent, FormsModule],
  templateUrl: './transcription-modal.component.html',
  styleUrl:    './transcription-modal.component.css',
})
export class TranscriptionModalComponent {
  protected svc     = inject(TranscriptionService);
  protected bridge  = inject(TauriBridgeService);
  protected project = inject(ProjectService);
  protected toast   = inject(ToastService);
  protected router  = inject(Router);

  closed = output<void>();

  selectedFile     = signal<string | null>(null);
  selectedLanguage = '';
  fileSizeWarning  = signal(false);
  error            = signal<string | null>(null);

  readonly MAX_SIZE_MB      = MAX_SIZE_MB;
  readonly supportedFormats = AUDIO_EXTENSIONS.join(', ');

  canTranscribe(): boolean {
    return !!(this.selectedFile() && this.svc.isConfigured() && !this.svc.isTranscribing());
  }

  async selectFile(): Promise<void> {
    const paths = await this.bridge.openFilesDialog(AUDIO_EXTENSIONS, false);
    if (!paths.length) return;
    this.selectedFile.set(paths[0]);
    this.error.set(null);
    this.fileSizeWarning.set(false);
  }

  async transcribe(): Promise<void> {
    const filePath = this.selectedFile();
    if (!filePath) return;

    this.error.set(null);

    if (this.selectedLanguage) {
      await this.project.updateSettings({
        transcriptionLanguage: this.selectedLanguage || undefined,
      });
    }

    try {
      const result = await this.svc.transcribe(filePath);
      const node   = await this.svc.saveTranscriptionToProject(result);

      this.toast.success(`Transcripción completada y guardada en la carpeta "Transcriptions".`);
      this.closed.emit();
      this.router.navigate(['/editor'], { queryParams: { doc: node.id } });

    } catch (e) {
      this.error.set(`Error al transcribir: ${e}`);
    }
  }
}
