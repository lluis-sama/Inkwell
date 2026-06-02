import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';

import { ImageService } from './image.service';
import { ProjectService } from './project.service';
import { Project, ProjectSettings } from '../models/project.model';

function createProject(settings: Partial<ProjectSettings> = {}): Project {
  return {
    id: 'test-project-id',
    name: 'Test Project',
    description: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tree: [],
    settings: {
      autosaveInterval: 30,
      maxSnapshots: 10,
      aiModel: 'claude-sonnet-4-20250514',
      spellcheck: true,
      aiProvider: 'anthropic',
      ...settings,
    },
    wordCountCache: {},
  };
}

describe('ImageService', () => {
  let service: ImageService;
  let mockProjectService: ProjectService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();

    mockProjectService = {
      project: signal<Project | null>(createProject()),
    } as unknown as ProjectService;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ImageService,
        { provide: ProjectService, useValue: mockProjectService },
      ],
    });

    service = TestBed.inject(ImageService);
    (service as any)._fetch = mockFetch;
  });

  describe('isConfigured', () => {
    it('false cuando no hay imageProvider', () => {
      mockProjectService.project.set(createProject({ imageProvider: undefined }));
      expect(service.isConfigured()).toBe(false);
    });

    it('true para dalle con apiKey', () => {
      mockProjectService.project.set(createProject({ imageProvider: 'dalle', imageApiKey: 'sk-test' }));
      expect(service.isConfigured()).toBe(true);
    });

    it('false para dalle sin apiKey', () => {
      mockProjectService.project.set(createProject({ imageProvider: 'dalle', imageApiKey: '' }));
      expect(service.isConfigured()).toBe(false);
    });

    it('true para openai-compatible con endpoint', () => {
      mockProjectService.project.set(createProject({ imageProvider: 'openai-compatible-image', imageEndpoint: 'http://localhost:7860' }));
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('providerStatusMessage', () => {
    it('refleja cada estado', () => {
      mockProjectService.project.set(createProject({ imageProvider: undefined }));
      expect(service.providerStatusMessage()).toBe('Proveedor de imágenes no configurado');

      mockProjectService.project.set(createProject({ imageProvider: 'dalle', imageApiKey: 'sk-test' }));
      expect(service.providerStatusMessage()).toBe('✓ DALL-E configurado');

      mockProjectService.project.set(createProject({ imageProvider: 'dalle', imageApiKey: '' }));
      expect(service.providerStatusMessage()).toBe('API key de OpenAI no configurada');

      mockProjectService.project.set(createProject({ imageProvider: 'openai-compatible-image', imageEndpoint: 'http://localhost:7860' }));
      expect(service.providerStatusMessage()).toBe('✓ Servidor: http://localhost:7860');

      mockProjectService.project.set(createProject({ imageProvider: 'openai-compatible-image', imageEndpoint: '' }));
      expect(service.providerStatusMessage()).toBe('URL del servidor no configurada');
    });
  });

  describe('generate', () => {
    it('lanza error si no está configurado', async () => {
      mockProjectService.project.set(createProject({ imageProvider: undefined }));
      await expect(service.generate({ prompt: 'test' })).rejects.toThrow('El proveedor de imágenes no está configurado.');
    });

    it('setea isGenerating(true) durante llamada y false después', async () => {
      mockProjectService.project.set(createProject({ imageProvider: 'dalle', imageApiKey: 'sk-test' }));

      let resolveFetch!: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => { resolveFetch = resolve; });
      mockFetch.mockReturnValue(fetchPromise);

      const generatePromise = service.generate({ prompt: 'test' });

      expect(service.isGenerating()).toBe(true);

      resolveFetch({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ b64_json: 'abc123' }] }),
      } as unknown as Response);

      await generatePromise;

      expect(service.isGenerating()).toBe(false);
    });

    it('con dalle llama fetch con modelo dall-e-3', async () => {
      mockProjectService.project.set(createProject({ imageProvider: 'dalle', imageApiKey: 'sk-test' }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ b64_json: 'abc123' }] }),
      });

      await service.generate({ prompt: 'test prompt' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/images/generations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test',
          }),
          body: expect.stringContaining('"model":"dall-e-3"'),
        }),
      );
    });

    it('con dalle parsea b64_json y devuelve data URL', async () => {
      mockProjectService.project.set(createProject({ imageProvider: 'dalle', imageApiKey: 'sk-test' }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ b64_json: 'abc123' }] }),
      });

      const result = await service.generate({ prompt: 'test' });

      expect(result).toBe('data:image/png;base64,abc123');
    });

    it('con openai-compatible usa endpoint custom', async () => {
      mockProjectService.project.set(createProject({
        imageProvider: 'openai-compatible-image',
        imageEndpoint: 'http://localhost:7860/',
        imageApiKey: 'custom-key',
        imageModel: 'custom-model',
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ b64_json: 'xyz789' }] }),
      });

      await service.generate({ prompt: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7860/v1/images/generations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer custom-key',
          }),
          body: expect.stringContaining('"model":"custom-model"'),
        }),
      );
    });

    it('maneja error HTTP de API', async () => {
      mockProjectService.project.set(createProject({ imageProvider: 'dalle', imageApiKey: 'sk-test' }));

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: { message: 'Internal Server Error' } }),
      });

      await expect(service.generate({ prompt: 'test' })).rejects.toThrow('Internal Server Error');
    });
  });

  describe('buildAutoPrompt', () => {
    it('genera prompt con título + body truncado', () => {
      const longBody = 'a'.repeat(300);
      const prompt = service.buildAutoPrompt('My Title', longBody);
      expect(prompt).toBe(`My Title. ${'a'.repeat(200)}. Concept art, moodboard reference, atmospheric, cinematic lighting, detailed illustration.`);
    });

    it('funciona con body vacío', () => {
      const prompt = service.buildAutoPrompt('My Title', '');
      expect(prompt).toBe('My Title. Concept art, moodboard reference, atmospheric, cinematic lighting, detailed illustration.');
    });
  });
});
