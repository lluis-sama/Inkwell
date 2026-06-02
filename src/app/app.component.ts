import { Component, HostListener, inject, OnInit, signal } from "@angular/core";
import { Router, RouterOutlet } from "@angular/router";
import { ThemeService } from "./core/services/theme.service";
import { UpdateService } from "./core/services/update.service";
import { LanguageToolService } from "./core/services/language-tool.service";
import { AppConfigService } from "./core/services/app-config.service";
import { InkToastComponent } from "./shared/components/ink-toast.component";
import { ShortcutsModalComponent } from "./shared/components/shortcuts-modal.component";
import { UpdateModalComponent } from "./shared/components/update-modal/update-modal.component";
import { LtWelcomeModalComponent } from "./shared/components/lt-welcome-modal/lt-welcome-modal.component";
import { LtInstallModalComponent } from "./shared/components/lt-install-modal/lt-install-modal.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, InkToastComponent, ShortcutsModalComponent, UpdateModalComponent, LtWelcomeModalComponent, LtInstallModalComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent implements OnInit {
  private themeService = inject(ThemeService);
  private router = inject(Router);
  private readonly updateService = inject(UpdateService);
  private readonly ltService = inject(LanguageToolService);
  private readonly appConfigSvc = inject(AppConfigService);

  showShortcuts = signal(false);
  showLtWelcomeModal = signal(false);
  showLtInstallModal = signal(false);

  ngOnInit(): void {
    this.themeService.setTheme(this.themeService.theme());
    this.updateService.checkOnce();

    // Inicializar LT en background (no bloquea el arranque de la app)
    const config = this.appConfigSvc.config();
    this.ltService.initialize(config.ltEnabled).then(() => {
      // Mostrar el modal de bienvenida si nunca se ha preguntado
      if (!config.ltPromptShown && !config.ltEnabled) {
        this.showLtWelcomeModal.set(true);
      }
    });
  }

  onLtWelcomeClosed(install: boolean): void {
    this.showLtWelcomeModal.set(false);
    this.appConfigSvc.setLtPromptShown(true);
    if (install) {
      this.appConfigSvc.setLtEnabled(true);
      this.ltService.install();
      this.showLtInstallModal.set(true);
    }
  }

  @HostListener("document:keydown", ["$event"])
  onKeydown(event: KeyboardEvent): void {
    if (event.altKey && event.key === "1") {
      event.preventDefault();
      this.router.navigate(["/editor"]);
    } else if (event.altKey && event.key === "2") {
      event.preventDefault();
      this.router.navigate(["/boards"]);
    } else if (event.altKey && event.key === "3") {
      event.preventDefault();
      this.router.navigate(["/narrative"]);
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key === "?" &&
      !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)
    ) {
      this.showShortcuts.set(true);
    } else if (event.key === "Escape") {
      this.showShortcuts.set(false);
    }
  }
}
