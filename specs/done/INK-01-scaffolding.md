# INK-01 — Scaffolding e infraestructura

## Objetivo

Crear el proyecto Inkwell con Tauri 2 + Angular 19 zoneless + TailwindCSS. El resultado debe ser una aplicación de escritorio funcional que arranque en Linux, muestre una pantalla mínima y compile sin errores. Incluye sistema de theming oscuro/claro basado en Catppuccin (Mocha / Latte).

---

## Comandos de creación del proyecto

```bash
npm create tauri-app@latest inkwell -- --template angular
cd inkwell
npm install
```

---

## Configuración Angular: zoneless

En `src/app/app.config.ts`:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideRouter(routes),
  ],
};
```

Eliminar `zone.js` de `polyfills` en `angular.json` si aparece listado.

---

## Instalación de dependencias

```bash
# Frontend
npm install @tiptap/core @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/extension-character-count
npm install @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
npm install interactjs
npm install -D tailwindcss postcss autoprefixer

npx tailwindcss init
```

En `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

---

## Sistema de theming: Catppuccin Mocha (oscuro) + Latte (claro)

El tema se aplica mediante el atributo `data-theme` en el elemento `<html>`. Por defecto respeta `prefers-color-scheme` del sistema.

### `src/styles.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Lora:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap');

/* ─── Catppuccin Mocha (dark) ─── */
:root,
[data-theme="dark"] {
  --ctp-base:      #1e1e2e;
  --ctp-mantle:    #181825;
  --ctp-crust:     #11111b;
  --ctp-surface0:  #313244;
  --ctp-surface1:  #45475a;
  --ctp-surface2:  #585b70;
  --ctp-overlay0:  #6c7086;
  --ctp-overlay1:  #7f849c;
  --ctp-text:      #cdd6f4;
  --ctp-subtext0:  #a6adc8;
  --ctp-subtext1:  #bac2de;
  --ctp-mauve:     #cba6f7;
  --ctp-lavender:  #b4befe;
  --ctp-blue:      #89b4fa;
  --ctp-teal:      #94e2d5;
  --ctp-green:     #a6e3a1;
  --ctp-yellow:    #f9e2af;
  --ctp-red:       #f38ba8;
  --ctp-pink:      #f5c2e7;
}

/* ─── Catppuccin Latte (light) ─── */
[data-theme="light"] {
  --ctp-base:      #eff1f5;
  --ctp-mantle:    #e6e9ef;
  --ctp-crust:     #dce0e8;
  --ctp-surface0:  #ccd0da;
  --ctp-surface1:  #bcc0cc;
  --ctp-surface2:  #acb0be;
  --ctp-overlay0:  #9ca0b0;
  --ctp-overlay1:  #8c8fa1;
  --ctp-text:      #4c4f69;
  --ctp-subtext0:  #6c6f85;
  --ctp-subtext1:  #5c5f77;
  --ctp-mauve:     #8839ef;
  --ctp-lavender:  #7287fd;
  --ctp-blue:      #1e66f5;
  --ctp-teal:      #179299;
  --ctp-green:     #40a02b;
  --ctp-yellow:    #df8e1d;
  --ctp-red:       #d20f39;
  --ctp-pink:      #ea76cb;
}

/* ─── Tokens semánticos ─── */
/* Estos son los que usan los componentes. Nunca usar variables --ctp-* directamente en componentes. */
:root {
  --ink-bg:       var(--ctp-base);
  --ink-surface:  var(--ctp-mantle);
  --ink-panel:    var(--ctp-crust);
  --ink-border:   var(--ctp-surface0);
  --ink-muted:    var(--ctp-surface1);
  --ink-text:     var(--ctp-text);
  --ink-subtle:   var(--ctp-subtext0);
  --ink-accent:   var(--ctp-mauve);
  --ink-info:     var(--ctp-blue);
  --ink-success:  var(--ctp-green);
  --ink-warning:  var(--ctp-yellow);
  --ink-danger:   var(--ctp-red);
}

/* ─── Base ─── */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  background-color: var(--ink-bg);
  color: var(--ink-text);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* ─── Scrollbar ─── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--ink-bg); }
::-webkit-scrollbar-thumb { background: var(--ink-muted); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--ink-subtle); }
```

---

## Configuración TailwindCSS

### `tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        ink: {
          bg:      'var(--ink-bg)',
          surface: 'var(--ink-surface)',
          panel:   'var(--ink-panel)',
          border:  'var(--ink-border)',
          muted:   'var(--ink-muted)',
          text:    'var(--ink-text)',
          subtle:  'var(--ink-subtle)',
          accent:  'var(--ink-accent)',
          info:    'var(--ink-info)',
          success: 'var(--ink-success)',
          warning: 'var(--ink-warning)',
          danger:  'var(--ink-danger)',
        }
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
        mono:  ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
```

> Las clases `bg-ink-bg`, `text-ink-accent`, etc. apuntan a variables CSS. El cambio de tema es automático al cambiar `data-theme` en `<html>`.

---

## ThemeService

### `src/app/core/services/theme.service.ts`

```typescript
import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.getInitialTheme());

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
      localStorage.setItem('inkwell-theme', this.theme());
    });
  }

  toggle(): void {
    this.theme.update(t => t === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
  }

  private getInitialTheme(): Theme {
    const stored = localStorage.getItem('inkwell-theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
```

**Comportamiento:**
- Persiste la preferencia en `localStorage`
- Si no hay preferencia guardada, respeta `prefers-color-scheme` del sistema
- El `effect()` aplica `data-theme` en `<html>` automáticamente al cambiar

---

## AppComponent

### `src/app/app.component.ts`

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [`:host { display: block; height: 100vh; }`]
})
export class AppComponent implements OnInit {
  private themeService = inject(ThemeService);

  ngOnInit(): void {
    this.themeService.setTheme(this.themeService.theme());
  }
}
```

---

## Estructura de carpetas a crear

```
src/app/
  core/
    models/
      .gitkeep
    services/
      theme.service.ts      ← crear en esta spec
  features/
    project-manager/
      project-manager.component.ts
    editor/
      editor-layout.component.ts
    boards/
      boards-layout.component.ts
    ai-assistant/
      .gitkeep
  shared/
    components/
      .gitkeep
    utils/
      .gitkeep
```

---

## Componentes placeholder

Los tres componentes de rutas incluyen toggle de tema para validar que el sistema funciona.

### `project-manager.component.ts`

```typescript
import { Component, inject } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-project-manager',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center h-screen bg-ink-bg gap-6">
      <h1 class="text-ink-text text-3xl font-serif tracking-wide">Inkwell</h1>
      <p class="text-ink-subtle text-sm">Tu entorno de escritura</p>
      <button
        (click)="theme.toggle()"
        class="px-4 py-2 rounded bg-ink-surface text-ink-text text-sm
               border border-ink-border hover:border-ink-accent transition-colors">
        Tema: {{ theme.theme() }}
      </button>
    </div>
  `,
})
export class ProjectManagerComponent {
  theme = inject(ThemeService);
}
```

Replicar el mismo patrón mínimo para `EditorLayoutComponent` y `BoardsLayoutComponent`.

---

## Rutas

### `src/app/app.routes.ts`

```typescript
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
];
```

---

## Configuración Tauri

### `src-tauri/tauri.conf.json`

```json
{
  "productName": "Inkwell",
  "version": "0.1.0",
  "identifier": "com.inkwell.app",
  "app": {
    "windows": [
      {
        "title": "Inkwell",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "decorations": true
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all"
  }
}
```

---

## Criterios de aceptación

- [ ] `npm run tauri dev` arranca sin errores en Linux
- [ ] La ventana abre en 1280×800
- [ ] La ruta `/` muestra el placeholder de `ProjectManagerComponent` con toggle de tema
- [ ] La ruta `/editor` muestra el placeholder de `EditorLayoutComponent`
- [ ] La ruta `/boards` muestra el placeholder de `BoardsLayoutComponent`
- [ ] El toggle cambia entre Catppuccin Mocha (`#1e1e2e`) y Latte (`#eff1f5`) con transición suave
- [ ] La preferencia de tema persiste al recargar
- [ ] Sin preferencia guardada, se respeta `prefers-color-scheme` del sistema
- [ ] `npm run build` completa sin errores de TypeScript
- [ ] No hay `zone.js` en los bundles
- [ ] Las clases Tailwind `bg-ink-bg`, `text-ink-accent`, etc. funcionan en ambos temas

---

## Lo que NO hacer en esta spec

- No implementar lógica de negocio
- No crear servicios más allá de `ThemeService`
- No conectar comandos Tauri todavía
- No instalar ni configurar ninguna base de datos
