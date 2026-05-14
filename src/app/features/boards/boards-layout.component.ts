import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-boards-layout',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './boards-layout.component.html',
})
export class BoardsLayoutComponent {
  theme = inject(ThemeService);
}
