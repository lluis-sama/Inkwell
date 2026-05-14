import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styles: [`:host { display: block; height: 100vh; }`]
})
export class AppComponent implements OnInit {
  private themeService = inject(ThemeService);

  ngOnInit(): void {
    this.themeService.setTheme(this.themeService.theme());
  }
}
