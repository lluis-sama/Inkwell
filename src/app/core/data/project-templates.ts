import { ProjectTemplate } from '../models/project.model';

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id:          'blank',
    name:        'Proyecto en blanco',
    description: 'Sin estructura. Empieza desde cero.',
    icon:        '📄',
    structure:   [],
  },
  {
    id:          'novel-3act',
    name:        'Novela (3 actos)',
    description: 'Estructura clásica en tres actos con capítulos.',
    icon:        '📖',
    structure: [
      {
        title: 'Acto I — El detonante', type: 'folder', children: [
          { title: 'Capítulo 1', type: 'document', children: [] },
          { title: 'Capítulo 2', type: 'document', children: [] },
          { title: 'Capítulo 3', type: 'document', children: [] },
        ],
      },
      {
        title: 'Acto II — La confrontación', type: 'folder', children: [
          { title: 'Capítulo 4', type: 'document', children: [] },
          { title: 'Capítulo 5', type: 'document', children: [] },
          { title: 'Capítulo 6', type: 'document', children: [] },
          { title: 'Capítulo 7', type: 'document', children: [] },
          { title: 'Capítulo 8', type: 'document', children: [] },
        ],
      },
      {
        title: 'Acto III — La resolución', type: 'folder', children: [
          { title: 'Capítulo 9',  type: 'document', children: [] },
          { title: 'Capítulo 10', type: 'document', children: [] },
          { title: 'Capítulo 11', type: 'document', children: [] },
        ],
      },
      {
        title: 'Material de apoyo', type: 'folder', children: [
          { title: 'Notas generales', type: 'document', children: [] },
          { title: 'Línea temporal',  type: 'document', children: [] },
        ],
      },
    ],
  },
  {
    id:          'novel-parts',
    name:        'Novela (partes y capítulos)',
    description: '3 partes con 5 capítulos cada una.',
    icon:        '📚',
    structure: Array.from({ length: 3 }, (_, i) => ({
      title:    `Parte ${['I', 'II', 'III'][i]}`,
      type:     'folder' as const,
      children: Array.from({ length: 5 }, (_, j) => ({
        title:    `Capítulo ${i * 5 + j + 1}`,
        type:     'document' as const,
        children: [],
      })),
    })),
  },
  {
    id:          'short-story',
    name:        'Relato corto',
    description: 'Estructura mínima para un relato.',
    icon:        '✍️',
    structure: [
      { title: 'Planteamiento', type: 'document', children: [] },
      { title: 'Nudo',          type: 'document', children: [] },
      { title: 'Desenlace',     type: 'document', children: [] },
      {
        title: 'Notas', type: 'folder', children: [
          { title: 'Personajes', type: 'document', children: [] },
        ],
      },
    ],
  },
  {
    id:          'essay',
    name:        'Ensayo',
    description: 'Introducción, cuerpo por secciones y conclusión.',
    icon:        '📝',
    structure: [
      { title: 'Introducción', type: 'document', children: [] },
      {
        title: 'Desarrollo', type: 'folder', children: [
          { title: 'Sección 1', type: 'document', children: [] },
          { title: 'Sección 2', type: 'document', children: [] },
          { title: 'Sección 3', type: 'document', children: [] },
        ],
      },
      { title: 'Conclusión',   type: 'document', children: [] },
      { title: 'Bibliografía', type: 'document', children: [] },
    ],
  },
  {
    id:          'custom',
    name:        'Personalizado',
    description: 'Define tú mismo el número de partes y capítulos.',
    icon:        '⚙️',
    structure:   [],
  },
];
