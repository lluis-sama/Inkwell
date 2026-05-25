import { Component, HostListener, inject, OnInit, signal } from "@angular/core";
import { Router, RouterOutlet } from "@angular/router";
import { ThemeService } from "./core/services/theme.service";
import { UpdateService } from "./core/services/update.service";
import { InkToastComponent } from "./shared/components/ink-toast.component";
import { ShortcutsModalComponent } from "./shared/components/shortcuts-modal.component";
import { UpdateModalComponent } from "./shared/components/update-modal/update-modal.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, InkToastComponent, ShortcutsModalComponent, UpdateModalComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent implements OnInit {
  private themeService = inject(ThemeService);
  private router = inject(Router);
  private readonly updateService = inject(UpdateService);

  showShortcuts = signal(false);

  ngOnInit(): void {
    this.themeService.setTheme(this.themeService.theme());
    this.updateService.checkOnce();
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
      event.ctrlKey &&
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
