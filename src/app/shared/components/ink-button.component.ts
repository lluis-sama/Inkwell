import { Component, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

@Component({
  selector: "ink-button",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./ink-button.component.html",
})
export class InkButtonComponent {
  variant = input<ButtonVariant>("primary");
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  fullWidth = input<boolean>(false);

  clicked = output<void>();

  buttonClasses(): string {
    const base = `
      inline-flex items-center justify-center
      px-8 py-4 h-9 rounded text-sm font-medium
      transition-all duration-150 cursor-pointer
      disabled:opacity-40 disabled:cursor-not-allowed
      focus:outline-none focus:ring-2 focus:ring-ink-accent focus:ring-offset-1
      focus:ring-offset-ink-bg
    `;

    const variants: Record<ButtonVariant, string> = {
      primary:
        "bg-ink-accent text-ink-panel hover:opacity-90 active:opacity-80",
      secondary:
        "bg-ink-surface text-ink-text border border-ink-border hover:border-ink-accent",
      ghost: "text-ink-subtle hover:text-ink-text hover:bg-ink-surface",
      danger: "bg-ink-danger text-ink-panel hover:opacity-90",
    };

    const width = this.fullWidth() ? "w-full" : "";

    return `${base} ${variants[this.variant()]} ${width}`;
  }
}
