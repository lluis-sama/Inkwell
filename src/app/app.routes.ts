import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/project-manager/project-manager.component')
        .then(m => m.ProjectManagerComponent),
  },
  {
    path: 'editor',
    loadComponent: () =>
      import('./features/editor/editor-layout.component')
        .then(m => m.EditorLayoutComponent),
  },
  {
    path: 'boards',
    loadComponent: () =>
      import('./features/boards/boards-layout.component')
        .then(m => m.BoardsLayoutComponent),
  },
  {
    path: 'narrative',
    loadComponent: () =>
      import('./features/narrative/narrative-layout.component')
        .then(m => m.NarrativeLayoutComponent),
  },
];
