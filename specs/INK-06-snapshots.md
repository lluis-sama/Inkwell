# INK-06 — Snapshots

## Objetivo

Implementar el panel lateral de snapshots. El usuario puede ver el historial de versiones del documento activo, previsualizar cada snapshot, etiquetarlos, restaurarlos y eliminarlos. Esta spec también añade un sistema de toast mínimo reutilizable para feedback de acciones.

---

## Componentes a crear / modificar

```
src/app/
  features/
    editor/
      snapshots/
        snapshots-panel.component.ts    ← nuevo
      editor-layout.component.ts        ← modificar: integrar panel
      top-bar/
        editor-top-bar.component.ts     ← modificar: añadir botón historial
  shared/
    components/
      ink-toast.component.ts            ← nuevo
    services/
      toast.service.ts                  ← nuevo
```

---

## Parte 1: ToastService + InkToastComponent

Sistema de notificaciones ligero. Un toast a la vez, auto-dismiss configurable.

### `src/app/shared/services/toast.service.ts`

```typescript
import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toast = signal<Toast | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(
    message: string,
    type: Toast['type'] = 'info',
    durationMs = 3000,
  ): void {
    if (this.timer) clearTimeout(this.timer);

    this.toast.set({ id: crypto.randomUUID(), message, type, durationMs });

    this.timer = setTimeout(() => this.dismiss(), durationMs);
  }

  success(message: string): void { this.show(message, 'success'); }
  error(message: string, durationMs = 5000): void { this.show(message, 'error', durationMs); }

  dismiss(): void {
    this.toast.set(null);
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
}
```

---

### `src/app/shared/components/ink-toast.component.ts`

```typescript
import { Component, inject } from '@angular/core';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'ink-toast',
  standalone: true,
  template: `
    @if (toastService.toast(); as toast) {
      <div
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]
               flex items-center gap-3 px-5 py-3 rounded-lg shadow-xl
               border text-sm font-medium animate-fade-in"
        [class]="toastClasses(toast.type)"
        (click)="toastService.dismiss()">
        {{ toast.message }}
      </div>
    }
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; transform: translate(-50%, 8px); }
      to   { opacity: 1; transform: translate(-50%, 0); }
    }
    .animate-fade-in { animation: fade-in 0.2s ease; }
  `],
})
export class InkToastComponent {
  toastService = inject(ToastService);

  toastClasses(type: string): string {
    const map: Record<string, string> = {
      success: 'bg-ink-surface border-ink-success text-ink-success',
      info:    'bg-ink-surface border-ink-border  text-ink-text',
      warning: 'bg-ink-surface border-ink-warning text-ink-warning',
      error:   'bg-ink-surface border-ink-danger  text-ink-danger',
    };
    return map[type] ?? map['info'];
  }
}
```

**Añadir `InkToastComponent` al `AppComponent`** para que esté disponible globalmente:

```typescript
// app.component.ts
import { InkToastComponent } from './shared/components/ink-toast.component';

@Component({
  standalone: true,
  imports: [RouterOutlet, InkToastComponent],
  template: `
    <router-outlet />
    <ink-toast />
  `,
  styles: [`:host { display: block; height: 100vh; }`]
})
export class AppComponent implements OnInit { ... }
```

---

## Parte 2: SnapshotsPanelComponent

### `src/app/features/editor/snapshots/snapshots-panel.component.ts`

```typescript
import {
  Component, inject, input, output,
  signal, computed,
} from '@angular/core';
import { DocumentFile, Snapshot } from '../../../core/models/document.model';
import { DocumentService } from '../../../core/services/document.service';
import { ToastService } from '../../../shared/services/toast.service';
import { tiptapToText } from '../../../shared/utils/tiptap-to-text';

@Component({
  selector: 'app-snapshots-panel',
  standalone: true,
  template: `
    <aside class="flex flex-col h-full w-72 border-l border-ink-border
                  bg-ink-panel shrink-0">

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3
                  border-b border-ink-border shrink-0">
        <span class="text-ink-subtle text-xs font-medium uppercase tracking-widest">
          Historial
        </span>
        <button
          (click)="closed.emit()"
          class="p-1 rounded text-ink-subtle hover:text-ink-text
                 hover:bg-ink-border transition-colors">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.207 4.207a1 1 0 0 0-1.414-1.414L8 5.586 5.207
                     2.793a1 1 0 0 0-1.414 1.414L6.586 7l-2.793 2.793a1
                     1 0 1 0 1.414 1.414L8 8.414l2.793 2.793a1 1 0 0 0
                     1.414-1.414L9.414 7l2.793-2.793z"/>
          </svg>
        </button>
      </div>

      <!-- Lista de snapshots -->
      <div class="flex-1 overflow-y-auto">
        @if (!document()) {
          <p class="text-ink-subtle text-xs text-center mt-10 px-4">
            Abre un documento para ver su historial
          </p>
        } @else if (document()!.snapshots.length === 0) {
          <div class="flex flex-col items-center gap-3 mt-10 px-4 opacity-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5" class="text-ink-subtle">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12,6 12,12 16,14"/>
            </svg>
            <p class="text-ink-subtle text-xs text-center">
              Sin snapshots todavía.<br>
              Usa el botón de la barra superior para guardar una versión.
            </p>
          </div>
        } @else {
          <ul class="py-2">
            @for (snapshot of snapshots(); track snapshot.id) {
              <li class="border-b border-ink-border last:border-0">
                <div class="px-4 py-3">

                  <!-- Fila principal -->
                  <div class="flex items-start gap-2">
                    <!-- Dot timeline -->
                    <div class="w-2 h-2 rounded-full bg-ink-accent mt-1.5 shrink-0"></div>

                    <!-- Info -->
                    <div class="flex-1 min-w-0">
                      <!-- Fecha -->
                      <p class="text-ink-subtle text-xs">
                        {{ formatDate(snapshot.createdAt) }}
                      </p>

                      <!-- Etiqueta (editable inline) -->
                      @if (editingLabelId() === snapshot.id) {
                        <input
                          [value]="snapshot.label ?? ''"
                          placeholder="Añadir etiqueta..."
                          maxlength="60"
                          (blur)="commitLabel($event, snapshot.id)"
                          (keydown.enter)="commitLabel($event, snapshot.id)"
                          (keydown.escape)="editingLabelId.set(null)"
                          class="mt-1 w-full bg-ink-bg border border-ink-accent
                                 rounded px-2 py-0.5 text-ink-text text-xs
                                 focus:outline-none"/>
                      } @else {
                        <button
                          (click)="editingLabelId.set(snapshot.id)"
                          class="mt-0.5 text-left text-xs transition-colors"
                          [class]="snapshot.label
                            ? 'text-ink-text hover:text-ink-accent'
                            : 'text-ink-muted hover:text-ink-subtle italic'">
                          {{ snapshot.label ?? 'Añadir etiqueta...' }}
                        </button>
                      }
                    </div>

                    <!-- Acciones -->
                    <div class="flex gap-1 shrink-0">
                      <!-- Restaurar -->
                      <button
                        (click)="restore(snapshot)"
                        title="Restaurar este snapshot"
                        class="p-1 rounded text-ink-subtle hover:text-ink-accent
                               hover:bg-ink-border transition-colors">
                        <svg width="13" height="13" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74"/>
                          <polyline points="3,3 3,9 9,9"/>
                        </svg>
                      </button>
                      <!-- Eliminar -->
                      <button
                        (click)="deleteSnapshot(snapshot.id)"
                        title="Eliminar snapshot"
                        class="p-1 rounded text-ink-subtle hover:text-ink-danger
                               hover:bg-ink-border transition-colors">
                        <svg width="13" height="13" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3,6 5,6 21,6"/>
                          <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/>
                          <path d="M10,11v6M14,11v6"/>
                          <path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1V6"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <!-- Preview (toggle al hacer click en el dot o en la fecha) -->
                  @if (expandedId() === snapshot.id) {
                    <div class="mt-3 ml-4 p-3 rounded bg-ink-bg border border-ink-border">
                      <p class="text-ink-subtle text-xs leading-relaxed line-clamp-6">
                        {{ getPreview(snapshot) }}
                      </p>
                    </div>
                  }
                  <button
                    (click)="toggleExpand(snapshot.id)"
                    class="mt-1 ml-4 text-ink-muted text-xs hover:text-ink-subtle
                           transition-colors">
                    {{ expandedId() === snapshot.id ? 'Ocultar preview' : 'Ver preview' }}
                  </button>

                </div>
              </li>
            }
          </ul>
        }
      </div>

      <!-- Footer: info del límite -->
      @if (document() && document()!.snapshots.length > 0) {
        <div class="px-4 py-3 border-t border-ink-border">
          <p class="text-ink-muted text-xs">
            {{ document()!.snapshots.length }} de {{ maxSnapshots() }} snapshots
          </p>
        </div>
      }

    </aside>
  `,
})
export class SnapshotsPanelComponent {
  private docService = inject(DocumentService);
  private toast      = inject(ToastService);

  /** Documento activo. El panel reacciona automáticamente al cambiar. */
  document     = input<DocumentFile | null>(null);
  maxSnapshots = input<number>(10);

  /** Emitido cuando el documento cambia (restaurar, eliminar snapshot, etiquetar). */
  documentChanged = output<DocumentFile>();
  closed          = output<void>();

  editingLabelId = signal<string | null>(null);
  expandedId     = signal<string | null>(null);

  // Snapshots en orden cronológico inverso (el más reciente primero)
  snapshots = computed(() =>
    [...(this.document()?.snapshots ?? [])].reverse()
  );

  // ─── Restaurar ────────────────────────────────────────────────────────────

  async restore(snapshot: Snapshot): Promise<void> {
    const doc = this.document();
    if (!doc) return;

    try {
      const restored  = this.docService.restoreSnapshot(doc, snapshot.id);
      const saved     = await this.docService.saveDocument(restored);
      this.documentChanged.emit(saved);
      this.toast.success('Snapshot restaurado. El estado anterior se guardó como nuevo snapshot.');
    } catch (e) {
      this.toast.error(`Error al restaurar: ${e}`);
    }
  }

  // ─── Eliminar ─────────────────────────────────────────────────────────────

  async deleteSnapshot(snapshotId: string): Promise<void> {
    const doc = this.document();
    if (!doc) return;

    try {
      const updated = this.docService.deleteSnapshot(doc, snapshotId);
      const saved   = await this.docService.saveDocument(updated);
      this.documentChanged.emit(saved);
      if (this.expandedId() === snapshotId) this.expandedId.set(null);
    } catch (e) {
      this.toast.error(`Error al eliminar snapshot: ${e}`);
    }
  }

  // ─── Etiquetar ────────────────────────────────────────────────────────────

  async commitLabel(event: Event, snapshotId: string): Promise<void> {
    this.editingLabelId.set(null);
    const doc = this.document();
    if (!doc) return;

    const label = (event.target as HTMLInputElement).value.trim() || undefined;

    const updated: DocumentFile = {
      ...doc,
      snapshots: doc.snapshots.map(s =>
        s.id === snapshotId ? { ...s, label } : s
      ),
    };

    try {
      const saved = await this.docService.saveDocument(updated);
      this.documentChanged.emit(saved);
    } catch (e) {
      this.toast.error(`Error al guardar etiqueta: ${e}`);
    }
  }

  // ─── Preview ──────────────────────────────────────────────────────────────

  getPreview(snapshot: Snapshot): string {
    const text = tiptapToText(snapshot.content);
    if (!text) return '(Documento vacío)';
    return text.length > 400 ? text.slice(0, 400) + '…' : text;
  }

  toggleExpand(id: string): void {
    this.expandedId.update(current => current === id ? null : id);
  }

  // ─── Formateo de fechas ───────────────────────────────────────────────────

  formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now  = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);

    if (mins < 1)  return 'Ahora mismo';
    if (mins < 60) return `Hace ${mins} min`;
    if (hrs  < 24) return `Hace ${hrs}h · ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

    return date.toLocaleDateString('es-ES', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
```

---

## Parte 3: Modificaciones a EditorTopBarComponent

Añadir un botón de historial junto al botón de snapshot existente.

En `editor-top-bar.component.ts`, añadir el input y output:

```typescript
// Nuevos inputs/outputs a añadir
showSnapshots = input<boolean>(false);
snapshotsPanelToggled = output<void>();
```

Añadir el botón en el template, entre el botón de snapshot y el de focus mode:

```html
<!-- Botón toggle panel snapshots -->
<button
  (click)="snapshotsPanelToggled.emit()"
  title="Historial de snapshots"
  class="p-1.5 rounded transition-colors disabled:opacity-30
         disabled:cursor-not-allowed"
  [disabled]="!documentTitle()"
  [class]="showSnapshots()
    ? 'text-ink-accent bg-ink-border'
    : 'text-ink-subtle hover:text-ink-text hover:bg-ink-border'">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12,6 12,12 16,14"/>
  </svg>
</button>
```

---

## Parte 4: Modificaciones a EditorLayoutComponent

Integrar el panel de snapshots en `editor-layout.component.ts`.

**Añadir imports:**
```typescript
import { SnapshotsPanelComponent } from './snapshots/snapshots-panel.component';
```

**Añadir signal:**
```typescript
showSnapshotsPanel = signal(false);
```

**Actualizar el binding de la top bar:**
```html
<app-editor-top-bar
  [documentTitle]="activeDocument()?.title ?? null"
  [saveStatus]="saveStatus()"
  [focusMode]="focusMode()"
  [showSnapshots]="showSnapshotsPanel()"
  (binderToggled)="showBinder.update(v => !v)"
  (focusToggled)="toggleFocusMode()"
  (snapshotRequested)="createSnapshot()"
  (snapshotsPanelToggled)="showSnapshotsPanel.update(v => !v)"
  (titleChanged)="onTitleChanged($event)"/>
```

**Reemplazar la franja placeholder de IA** por lógica condicional en el área principal:

```html
<!-- Área principal: binder + editor + paneles laterales -->
<div class="flex flex-1 overflow-hidden">

  @if (showBinder() && !focusMode()) {
    <div class="w-60 shrink-0">
      <app-binder
        [activeId]="activeDocumentId()"
        (documentOpened)="openDocument($event)"/>
    </div>
  }

  <div class="flex-1 overflow-hidden relative">
    @if (activeDocument()) {
      <app-tiptap-editor
        [content]="activeDocument()!.content"
        (contentChanged)="onContentChanged($event)"/>
    } @else {
      <div class="flex flex-col items-center justify-center h-full gap-4 opacity-40">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.5" class="text-ink-subtle">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        <p class="text-ink-subtle text-sm">
          Selecciona o crea un documento en el binder
        </p>
      </div>
    }

    @if (focusMode()) {
      <button
        (click)="toggleFocusMode()"
        class="absolute top-4 right-4 p-2 rounded text-ink-muted
               hover:text-ink-subtle transition-colors opacity-0 hover:opacity-100">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3
                   m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      </button>
    }
  </div>

  <!-- Panel snapshots -->
  @if (showSnapshotsPanel() && !focusMode()) {
    <app-snapshots-panel
      [document]="activeDocument()"
      [maxSnapshots]="projectService.project()?.settings.maxSnapshots ?? 10"
      (documentChanged)="onDocumentRestoredFromPanel($event)"
      (closed)="showSnapshotsPanel.set(false)"/>
  }

  <!-- Franja IA (placeholder hasta INK-08) -->
  @if (!showSnapshotsPanel() && !focusMode()) {
    <div class="w-8 shrink-0 border-l border-ink-border bg-ink-panel
                flex items-center justify-center">
      <span class="text-ink-muted text-xs [writing-mode:vertical-lr]
                   rotate-180 select-none">IA</span>
    </div>
  }
</div>
```

**Añadir el método `onDocumentRestoredFromPanel` en `EditorLayoutComponent`:**

```typescript
onDocumentRestoredFromPanel(doc: DocumentFile): void {
  this.activeDocument.set(doc);
  this.isDirty = false;
  this.saveStatus.set('saved');
}
```

**Añadir `projectService` como propiedad pública** (necesario para el binding del template):

```typescript
// Cambiar de private a protected/public
protected projectService = inject(ProjectService);
```

---

## Criterios de aceptación

**Toast:**
- [ ] `toast.success('mensaje')` muestra un toast verde centrado en la parte inferior
- [ ] El toast desaparece automáticamente a los 3 segundos
- [ ] Hacer click en el toast lo cierra inmediatamente
- [ ] Los errores (`toast.error`) duran 5 segundos y son rojos

**Panel de snapshots:**
- [ ] El botón de historial (reloj) en la top bar abre/cierra el panel
- [ ] El botón está deshabilitado cuando no hay documento abierto
- [ ] El panel muestra los snapshots en orden cronológico inverso (más reciente arriba)
- [ ] Cada snapshot muestra la fecha relativa formateada correctamente
- [ ] "Ver preview" expande el texto plano del snapshot (usando `tiptapToText`)
- [ ] Click en la etiqueta abre un input inline; Enter confirma, Escape cancela
- [ ] El botón de restaurar (↩) restaura el snapshot y muestra toast de éxito
- [ ] Tras restaurar, el editor refleja el contenido restaurado
- [ ] Tras restaurar, el snapshot del estado previo aparece en la lista
- [ ] El botón de eliminar (🗑) elimina el snapshot; se actualiza la lista
- [ ] El footer muestra "N de M snapshots"
- [ ] El panel se cierra con el botón ×

**Integración con INK-05:**
- [ ] La franja "IA" se oculta cuando el panel de snapshots está abierto
- [ ] En modo focus, el panel de snapshots no se muestra
- [ ] Crear un snapshot desde la top bar (botón cámara) sigue funcionando igual que en INK-05

---

## Lo que NO hacer en esta spec

- No implementar el panel de IA (INK-08)
- No añadir confirmación de "¿Seguro que quieres restaurar?" — el sistema ya guarda el estado anterior automáticamente como snapshot
- No implementar diff visual entre snapshots
