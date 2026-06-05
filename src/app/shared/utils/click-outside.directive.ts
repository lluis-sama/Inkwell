import { Directive, ElementRef, HostListener, inject, input, output } from '@angular/core';

@Directive({
  selector: '[clickOutside]',
  standalone: true,
})
export class ClickOutsideDirective {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  clickOutsideExceptions = input<string>();
  clickOutside = output<MouseEvent>();

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!target || !(target instanceof Node)) {
      return;
    }

    if (this.elementRef.nativeElement.contains(target)) {
      return;
    }

    const exceptions = this.clickOutsideExceptions();
    if (exceptions) {
      const selectors = exceptions.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      if (target instanceof Element) {
        for (const selector of selectors) {
          if (target.closest(selector)) {
            return;
          }
        }
      }
    }

    this.clickOutside.emit(event);
  }
}
