import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

  ngOnInit(): void {
    this.themeService.setTheme(this.themeService.theme());
  }
}
