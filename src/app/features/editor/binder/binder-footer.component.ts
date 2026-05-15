import { Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProjectService } from '../../../core/services/project.service';

@Component({
  selector: 'app-binder-footer',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './binder-footer.component.html',
})
export class BinderFooterComponent {
  private projectService = inject(ProjectService);
  searchActive = input<boolean>(false);
  searchToggled = output<void>();

  readonly wordCount = computed(() => this.projectService.totalWordCount());
  readonly wordCountK = computed(() => (this.projectService.totalWordCount() / 1000).toFixed(1).replace('.', ','));
}
