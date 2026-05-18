import { fetch } from '@tauri-apps/plugin-http';
import { Injectable, inject, signal } from '@angular/core';
import { ProjectService } from './project.service';
import { ImageProvider, ImageSize } from '../models/project.model';

export interface ImageGenerationOptions {
  prompt:  string;
  size?:   string;
  n?:      number;
}

@Injectable({ providedIn: 'root' })
export class ImageService {
  private project = inject(ProjectService);

  isGenerating = signal(false);

  isConfigured(): boolean {
    const settings = this.project.project()?.settings;
    if (!settings?.imageProvider) return false;
    switch (settings.imageProvider) {
      case 'dalle':
        return !!(settings.imageApiKey?.trim());
      case 'openai-compatible-image':
        return !!(settings.imageEndpoint?.trim());
    }
  }

  providerStatusMessage(): string {
    const settings = this.project.project()?.settings;
    if (!settings?.imageProvider) return 'Proveedor de imágenes no configurado';
    switch (settings.imageProvider) {
      case 'dalle':
        return settings.imageApiKey ? '✓ DALL-E configurado' : 'API key de OpenAI no configurada';
      case 'openai-compatible-image':
        return settings.imageEndpoint
          ? `✓ Servidor: ${settings.imageEndpoint}`
          : 'URL del servidor no configurada';
    }
  }

  async generate(options: ImageGenerationOptions): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('El proveedor de imágenes no está configurado.');
    }

    const settings = this.project.project()!.settings;
    this.isGenerating.set(true);

    try {
      switch (settings.imageProvider) {
        case 'dalle':
          return await this.generateDalle(options, settings.imageApiKey!, settings.imageSize);
        case 'openai-compatible-image':
          return await this.generateOpenAICompatible(
            options, settings.imageEndpoint!, settings.imageApiKey,
            settings.imageModel, settings.imageSize,
          );
        default:
          throw new Error('Proveedor no reconocido');
      }
    } finally {
      this.isGenerating.set(false);
    }
  }

  private async generateDalle(
    options: ImageGenerationOptions,
    apiKey: string,
    size?: ImageSize,
  ): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           'dall-e-3',
        prompt:          options.prompt,
        n:               1,
        size:            size ?? '1024x1024',
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { error?: { message?: string } }).error?.message
        ?? `Error DALL-E ${response.status}`
      );
    }

    const data = await response.json();
    const b64  = (data as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
    if (!b64) throw new Error('La respuesta de DALL-E no contiene imagen.');

    return `data:image/png;base64,${b64}`;
  }

  private async generateOpenAICompatible(
    options: ImageGenerationOptions,
    endpoint: string,
    apiKey:   string | undefined,
    model:    string | undefined,
    size?:    ImageSize,
  ): Promise<string> {
    const url     = `${endpoint.replace(/\/$/, '')}/v1/images/generations`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt:          options.prompt,
        n:               1,
        size:            size ?? '512x512',
        model:           model ?? 'stable-diffusion',
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Error del servidor (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const b64  = (data as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
    if (!b64) throw new Error('La respuesta del servidor no contiene imagen.');

    return `data:image/png;base64,${b64}`;
  }

  buildAutoPrompt(title: string, body: string): string {
    const base = body.trim()
      ? `${title}. ${body.slice(0, 200)}`
      : title;

    return `${base}. Concept art, moodboard reference, atmospheric, cinematic lighting, detailed illustration.`;
  }
}
