import { describe, it, expect } from 'vitest';
import { tiptapToText } from './tiptap-to-text';

describe('tiptapToText', () => {
  it('devuelve string vacío para documento vacío', () => {
    const emptyDoc = {
      type: 'doc',
      content: [],
    };
    expect(tiptapToText(emptyDoc)).toBe('');
  });

  it('extrae texto plano de un párrafo simple', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hola mundo' }],
        },
      ],
    };
    expect(tiptapToText(doc)).toBe('Hola mundo');
  });

  it('maneja nodos anidados (texto dentro de bold/italic)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Texto normal ' },
            {
              type: 'text',
              marks: [{ type: 'bold' }],
              text: 'negrita',
            },
            { type: 'text', text: ' e ' },
            {
              type: 'text',
              marks: [{ type: 'italic' }],
              text: 'cursiva',
            },
          ],
        },
      ],
    };
    expect(tiptapToText(doc)).toBe('Texto normal negrita e cursiva');
  });

  it('concatena múltiples párrafos con saltos de línea', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Primer párrafo' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Segundo párrafo' }],
        },
      ],
    };
    expect(tiptapToText(doc)).toBe('Primer párrafo\nSegundo párrafo');
  });

  it('ignora horizontalRule pero respeta bloques (salto de línea sin texto)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Antes' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Después' }],
        },
      ],
    };
    expect(tiptapToText(doc)).toBe('Antes\n\nDespués');
  });
});
