# INK-04 — Project Manager

## Objetivo

Implementar la pantalla de inicio de Inkwell. Desde aquí el usuario puede crear un proyecto nuevo, abrir uno existente y acceder a proyectos recientes. Al abrir o crear un proyecto, la app navega a `/editor`.

Esta spec también establece los dos componentes de UI compartidos que se usarán en el resto de la app: `InkButtonComponent` y `InkModalComponent`.

---

## Componentes a crear

```
src/app/
  features/
    project-manager/
      project-manager.component.ts
      new-project-modal.component.ts
  shared/
    components/
      ink-button.component.ts
      ink-modal.component.ts
```

---

## Parte 1: Componentes compartidos

### `src/app/shared/components/ink-button.component.ts`

Botón reutilizable con variantes y estados de carga.

```typescript
import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

@Component({
  selector: 'ink-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [disabled]="disabled() || loading()"
      [class]="buttonClasses()"
      (click)="clicked.emit()">

      @if (loading()) {
        <span class="inline-block w-4 h-4 border-2 border-current border-t-transparent
                     rounded-full animate-spin mr-2"></span>
      }

      <ng-content />
    </button>
  `,
})
export class InkButtonComponent {
  variant  = input<ButtonVariant>('primary');
  disabled = input<boolean>(false);
  loading  = input<boolean>(false);
  fullWidth = input<boolean>(false);

  clicked = output<void>();

  buttonClasses(): string {
    const base = `
      inline-flex items-center justify-center
      px-4 py-2 rounded text-sm font-medium
      transition-all duration-150 cursor-pointer
      disabled:opacity-40 disabled:cursor-not-allowed
      focus:outline-none focus:ring-2 focus:ring-ink-accent focus:ring-offset-1
      focus:ring-offset-ink-bg
    `;

    const variants: Record<ButtonVariant, string> = {
      primary:   'bg-ink-accent text-ink-panel hover:opacity-90 active:opacity-80',
      secondary: 'bg-ink-surface text-ink-text border border-ink-border hover:border-ink-accent',
      ghost:     'text-ink-subtle hover:text-ink-text hover:bg-ink-surface',
      danger:    'bg-ink-danger text-ink-panel hover:opacity-90',
    };

    const width = this.fullWidth() ? 'w-full' : '';

    return `${base} ${variants[this.variant()]} ${width}`;
  }
}
```

---

### `src/app/shared/components/ink-modal.component.ts`

Modal genérico con overlay, título y slot para contenido y acciones.

```typescript
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'ink-modal',
  standalone: true,
  template: `
    <!-- Overlay -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      (click)="onOverlayClick($event)">

      <!-- Fondo semitransparente -->
      <div class="absolute inset-0 bg-ink-panel opacity-70"></div>

      <!-- Panel del modal -->
      <div
        class="relative z-10 w-full max-w-md mx-4 rounded-lg border border-ink-border
               bg-ink-surface shadow-2xl"
        (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-ink-border">
          <h2 class="text-ink-text font-medium text-base">{{ title() }}</h2>
          <button
            (click)="closed.emit()"
            class="text-ink-subtle hover:text-ink-text transition-colors p-1 rounded
                   hover:bg-ink-border">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586 5.207 2.793a1 1 0 0
                       0-1.414 1.414L6.586 7l-2.793 2.793a1 1 0 1 0 1.414 1.414L8
                       8.414l2.793 2.793a1 1 0 0 0 1.414-1.414L9.414 7l2.793-2.793z"/>
            </svg>
          </button>
        </div>

        <!-- Contenido -->
        <div class="px-6 py-5">
          <ng-content />
        </div>

        <!-- Acciones -->
        @if (hasActions()) {
          <div class="px-6 py-4 border-t border-ink-border flex justify-end gap-3">
            <ng-content select="[slot=actions]" />
          </div>
        }
      </div>
    </div>
  `,
})
export class InkModalComponent {
  title      = input<string>('');
  hasActions = input<boolean>(true);
  closeOnOverlay = input<boolean>(true);

  closed = output<void>();

  onOverlayClick(event: MouseEvent): void {
    if (this.closeOnOverlay()) this.closed.emit();
  }
}
```

---

## Parte 2: NewProjectModalComponent

### `src/app/features/project-manager/new-project-modal.component.ts`

```typescript
import { Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InkModalComponent } from '../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../shared/components/ink-button.component';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { ProjectService } from '../../core/services/project.service';

@Component({
  selector: 'app-new-project-modal',
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule],
  template: `
    <ink-modal title="Nuevo proyecto" (closed)="cancelled.emit()">

      <div class="flex flex-col gap-4">

        <!-- Nombre -->
        <div class="flex flex-col gap-1.5">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Nombre del proyecto *
          </label>
          <input
            [(ngModel)]="name"
            placeholder="Mi novela"
            maxlength="80"
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-sm placeholder:text-ink-muted
                   focus:outline-none focus:border-ink-accent transition-colors"/>
        </div>

        <!-- Descripción -->
        <div class="flex flex-col gap-1.5">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Descripción <span class="normal-case">(opcional)</span>
          </label>
          <textarea
            [(ngModel)]="description"
            placeholder="Una breve descripción de tu proyecto..."
            rows="3"
            maxlength="300"
            class="w-full px-3 py-2 rounded bg-ink-bg border border-ink-border
                   text-ink-text text-sm placeholder:text-ink-muted resize-none
                   focus:outline-none focus:border-ink-accent transition-colors">
          </textarea>
        </div>

        <!-- Carpeta elegida -->
        <div class="flex flex-col gap-1.5">
          <label class="text-ink-subtle text-xs font-medium uppercase tracking-wide">
            Carpeta del proyecto *
          </label>
          <div class="flex gap-2">
            <div class="flex-1 px-3 py-2 rounded bg-ink-bg border border-ink-border
                        text-sm truncate"
                 [class]="folderPath() ? 'text-ink-text' : 'text-ink-muted'">
              {{ folderPath() || 'Ninguna carpeta seleccionada' }}
            </div>
            <ink-button variant="secondary" (clicked)="selectFolder()">
              Elegir
            </ink-button>
          </div>
        </div>

        <!-- Error -->
        @if (error()) {
          <p class="text-ink-danger text-xs">{{ error() }}</p>
        }
      </div>

      <!-- Acciones -->
      <ng-container slot="actions">
        <ink-button variant="ghost" (clicked)="cancelled.emit()">
          Cancelar
        </ink-button>
        <ink-button
          variant="primary"
          [disabled]="!canCreate()"
          [loading]="creating()"
          (clicked)="create()">
          Crear proyecto
        </ink-button>
      </ng-container>

    </ink-modal>
  `,
})
export class NewProjectModalComponent {
  private bridge  = inject(TauriBridgeService);
  private projectService = inject(ProjectService);

  created   = output<void>();
  cancelled = output<void>();

  name        = '';
  description = '';
  folderPath  = signal<string | null>(null);
  creating    = signal(false);
  error       = signal<string | null>(null);

  canCreate(): boolean {
    return this.name.trim().length > 0 && this.folderPath() !== null;
  }

  async selectFolder(): Promise<void> {
    const path = await this.bridge.selectNewProjectFolder();
    if (path) this.folderPath.set(path);
  }

  async create(): Promise<void> {
    if (!this.canCreate()) return;
    this.creating.set(true);
    this.error.set(null);

    try {
      await this.projectService.createProject(
        this.folderPath()!,
        this.name.trim(),
        this.description.trim(),
      );
      this.projectService.addRecentProject(this.name.trim(), this.folderPath()!);
      this.created.emit();
    } catch (e) {
      this.error.set(`Error al crear el proyecto: ${e}`);
    } finally {
      this.creating.set(false);
    }
  }
}
```

---

## Parte 3: ProjectManagerComponent

### `src/app/features/project-manager/project-manager.component.ts`

```typescript
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { ProjectService } from '../../core/services/project.service';
import { TauriBridgeService } from '../../core/services/tauri-bridge.service';
import { NewProjectModalComponent } from './new-project-modal.component';
import { InkButtonComponent } from '../../shared/components/ink-button.component';

interface RecentProject {
  name: string;
  basePath: string;
  openedAt: string;
}

@Component({
  selector: 'app-project-manager',
  standalone: true,
  imports: [NewProjectModalComponent, InkButtonComponent],
  template: `
    <div class="flex flex-col h-screen bg-ink-bg">

      <!-- Barra superior -->
      <header class="flex items-center justify-end px-6 py-3 border-b border-ink-border">
        <button
          (click)="theme.toggle()"
          title="Cambiar tema"
          class="p-2 rounded text-ink-subtle hover:text-ink-text hover:bg-ink-surface
                 transition-colors">
          @if (theme.theme() === 'dark') {
            <!-- Icono sol -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          } @else {
            <!-- Icono luna -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          }
        </button>
      </header>

      <!-- Contenido central -->
      <main class="flex flex-1 overflow-hidden">

        <!-- Panel izquierdo: hero + acciones -->
        <div class="flex flex-col items-center justify-center w-96 px-10
                    border-r border-ink-border gap-8">

          <!-- Logo / wordmark -->
          <div class="flex flex-col items-center gap-2">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M24 4 L40 40 L24 34 L8 40 Z"
                    fill="var(--ink-accent)" opacity="0.9"/>
              <path d="M24 4 L24 34" stroke="var(--ink-panel)" stroke-width="1.5"/>
            </svg>
            <h1 class="text-ink-text text-2xl font-serif tracking-widest">Inkwell</h1>
            <p class="text-ink-subtle text-xs tracking-wide">Tu entorno de escritura</p>
          </div>

          <!-- Acciones principales -->
          <div class="flex flex-col gap-3 w-full">
            <ink-button
              variant="primary"
              [fullWidth]="true"
              (clicked)="showNewProjectModal.set(true)">
              Nuevo proyecto
            </ink-button>

            <ink-button
              variant="secondary"
              [fullWidth]="true"
              [loading]="opening()"
              (clicked)="openProject()">
              Abrir proyecto
            </ink-button>
          </div>

          <!-- Error de apertura -->
          @if (openError()) {
            <p class="text-ink-danger text-xs text-center">{{ openError() }}</p>
          }
        </div>

        <!-- Panel derecho: proyectos recientes -->
        <div class="flex flex-col flex-1 overflow-hidden">

          <div class="px-8 py-6 border-b border-ink-border">
            <h2 class="text-ink-subtle text-xs font-medium uppercase tracking-widest">
              Proyectos recientes
            </h2>
          </div>

          <div class="flex-1 overflow-y-auto px-8 py-4">
            @if (recentProjects().length === 0) {
              <div class="flex flex-col items-center justify-center h-full gap-3 opacity-40">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="1.5" class="text-ink-subtle">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0
                           0 2-2V8z"/>
                  <polyline points="14,2 14,8 20,8"/>
                </svg>
                <p class="text-ink-subtle text-sm">No hay proyectos recientes</p>
              </div>
            } @else {
              <ul class="flex flex-col gap-1">
                @for (project of recentProjects(); track project.basePath) {
                  <li class="group flex items-center gap-3 px-4 py-3 rounded
                             hover:bg-ink-surface transition-colors cursor-pointer"
                      (click)="openRecentProject(project)">

                    <!-- Icono -->
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="var(--ink-accent)" stroke-width="2" class="shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0
                               0 0 2-2V8z"/>
                      <polyline points="14,2 14,8 20,8"/>
                    </svg>

                    <!-- Info -->
                    <div class="flex flex-col flex-1 min-w-0 gap-0.5">
                      <span class="text-ink-text text-sm font-medium truncate">
                        {{ project.name }}
                      </span>
                      <span class="text-ink-subtle text-xs truncate">
                        {{ project.basePath }}
                      </span>
                    </div>

                    <!-- Fecha -->
                    <span class="text-ink-subtle text-xs shrink-0 opacity-0
                                 group-hover:opacity-100 transition-opacity">
                      {{ formatDate(project.openedAt) }}
                    </span>

                    <!-- Botón eliminar de recientes -->
                    <button
                      (click)="removeFromRecents($event, project.basePath)"
                      title="Eliminar de recientes"
                      class="shrink-0 p-1 rounded text-ink-subtle opacity-0
                             group-hover:opacity-100 hover:text-ink-danger
                             transition-all">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586
                                 5.207 2.793a1 1 0 0 0-1.414 1.414L6.586 7
                                 l-2.793 2.793a1 1 0 1 0 1.414 1.414L8
                                 8.414l2.793 2.793a1 1 0 0 0 1.414-1.414
                                 L9.414 7l2.793-2.793z"/>
                      </svg>
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      </main>
    </div>

    <!-- Modal nuevo proyecto -->
    @if (showNewProjectModal()) {
      <app-new-project-modal
        (created)="onProjectCreated()"
        (cancelled)="showNewProjectModal.set(false)"/>
    }
  `,
})
export class ProjectManagerComponent implements OnInit {
  theme          = inject(ThemeService);
  private projectService = inject(ProjectService);
  private bridge         = inject(TauriBridgeService);
  private router         = inject(Router);

  showNewProjectModal = signal(false);
  opening             = signal(false);
  openError           = signal<string | null>(null);
  recentProjects      = signal<RecentProject[]>([]);

  ngOnInit(): void {
    this.recentProjects.set(this.projectService.getRecentProjects());
  }

  // ─── Abrir proyecto ───────────────────────────────────────────────────────

  async openProject(): Promise<void> {
    this.openError.set(null);
    const basePath = await this.bridge.openFolderDialog();
    if (!basePath) return;

    this.opening.set(true);
    try {
      await this.projectService.openProject(basePath);
      this.projectService.addRecentProject(
        this.projectService.project()!.name,
        basePath,
      );
      this.router.navigate(['/editor']);
    } catch {
      this.openError.set(
        'No se encontró un proyecto Inkwell en esa carpeta. ¿Quizás quieres crear uno nuevo?'
      );
    } finally {
      this.opening.set(false);
    }
  }

  async openRecentProject(project: RecentProject): Promise<void> {
    this.openError.set(null);
    this.opening.set(true);
    try {
      await this.projectService.openProject(project.basePath);
      this.projectService.addRecentProject(project.name, project.basePath);
      this.recentProjects.set(this.projectService.getRecentProjects());
      this.router.navigate(['/editor']);
    } catch {
      this.openError.set(
        `No se pudo abrir "${project.name}". ¿La carpeta sigue existiendo?`
      );
      this.projectService.removeRecentProject(project.basePath);
      this.recentProjects.set(this.projectService.getRecentProjects());
    } finally {
      this.opening.set(false);
    }
  }

  // ─── Nuevo proyecto ───────────────────────────────────────────────────────

  onProjectCreated(): void {
    this.showNewProjectModal.set(false);
    this.router.navigate(['/editor']);
  }

  // ─── Recientes ────────────────────────────────────────────────────────────

  removeFromRecents(event: MouseEvent, basePath: string): void {
    event.stopPropagation();
    this.projectService.removeRecentProject(basePath);
    this.recentProjects.set(this.projectService.getRecentProjects());
  }

  // ─── Utils ────────────────────────────────────────────────────────────────

  formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now  = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7)  return `Hace ${days} días`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
}
```

---

## Criterios de aceptación

- [ ] La pantalla de inicio muestra logo, botones de acción y panel de recientes
- [ ] El toggle de tema (sol/luna) funciona correctamente en la barra superior
- [ ] "Nuevo proyecto" abre el modal con formulario de nombre, descripción y carpeta
- [ ] El botón "Crear proyecto" está deshabilitado si falta nombre o carpeta
- [ ] Al crear un proyecto, navega a `/editor` y aparece en recientes
- [ ] "Abrir proyecto" abre el diálogo de selección de carpeta
- [ ] Si la carpeta no tiene `project.json`, muestra mensaje de error claro
- [ ] Clicar un proyecto reciente lo abre y navega a `/editor`
- [ ] Si un proyecto reciente ya no existe en disco, muestra error y lo elimina de la lista
- [ ] El botón × de cada reciente lo elimina de la lista sin abrir el proyecto
- [ ] Las fechas de recientes muestran "Hoy", "Ayer" o fecha relativa correctamente
- [ ] El loader en "Abrir proyecto" se muestra durante la carga

---

## Lo que NO hacer en esta spec

- No implementar la vista de editor (`/editor`) todavía; la navegación puede mostrar el placeholder de INK-01
- No implementar settings de la app
- No añadir animaciones de entrada/salida en el modal (se puede hacer en el polish de INK-09)
