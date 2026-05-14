import { Component, HostListener, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { InkToastComponent } from './shared/components/ink-toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, InkToastComponent],
  templateUrl: './app.component.html',
  styles: [`:host { display: block; height: 100vh; }`]
})
export class AppComponent implements OnInit {
  private themeService = inject(ThemeService);
  private router = inject(Router);

  ngOnInit(): void {
    this.themeService.setTheme(this.themeService.theme());
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.altKey && event.key === '1') {
      event.preventDefault();
      this.router.navigate(['/editor']);
    } else if (event.altKey && event.key === '2') {
      event.preventDefault();
      this.router.navigate(['/boards']);
    }
  }
}
