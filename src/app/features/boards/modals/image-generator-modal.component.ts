import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Card } from '../../../core/models/board.model';
import { ImageService } from '../../../core/services/image.service';
import { InkModalComponent }  from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-image-generator-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule, TranslocoPipe],
  templateUrl: './image-generator-modal.component.html',
  styleUrl:    './image-generator-modal.component.css',
})
export class ImageGeneratorModalComponent implements OnInit {
  imageService = inject(ImageService);

  card = input.required<Card>();

  applied   = output<{ imageData: string; imagePrompt: string } | null>();
  cancelled = output<void>();

  prompt       = '';
  previewImage = signal<string | null>(null);
  error        = signal<string | null>(null);

  ngOnInit(): void {
    if (this.card().imageData) {
      this.previewImage.set(this.card().imageData!);
      this.prompt = this.card().imagePrompt ?? this.buildPrompt();
    } else {
      this.prompt = this.buildPrompt();
    }
  }

  private buildPrompt(): string {
    return this.imageService.buildAutoPrompt(this.card().title, this.card().body);
  }

  async generate(): Promise<void> {
    if (!this.prompt.trim()) return;
    this.error.set(null);
    try {
      const imageData = await this.imageService.generate({ prompt: this.prompt });
      this.previewImage.set(imageData);
    } catch (e) {
      this.error.set(`Error al generar: ${e}`);
    }
  }

  apply(): void {
    const image = this.previewImage();
    if (!image) { this.cancelled.emit(); return; }
    this.applied.emit({ imageData: image, imagePrompt: this.prompt });
  }

  removeImage(): void {
    this.applied.emit(null);
  }
}
