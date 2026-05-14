import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-editor-layout',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './editor-layout.component.html',
})
export class EditorLayoutComponent {
  theme = inject(ThemeService);
}
