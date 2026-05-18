import {
  Component, inject, signal, OnInit, output,
} from '@angular/core';
import { ConsistencyService } from '../../../core/services/consistency.service';
import { ConsistencyReport, ISSUE_TYPE_LABELS, ISSUE_SEVERITY_CONFIG }
  from '../../../core/models/consistency.model';
import { AiService }          from '../../../core/services/ai.service';
import { InkModalComponent }  from '../../../shared/components/ink-modal.component';
import { InkButtonComponent } from '../../../shared/components/ink-button.component';

@Component({
  selector:    'app-consistency-modal',
  standalone:  true,
  imports:     [InkModalComponent, InkButtonComponent],
  templateUrl: './consistency-modal.component.html',
  styleUrl:    './consistency-modal.component.css',
})
export class ConsistencyModalComponent implements OnInit {
  protected consistencySvc = inject(ConsistencyService);
  protected ai             = inject(AiService);
  closed                   = output<void>();

  report      = signal<ConsistencyReport | null>(null);
  progressLog = signal<string[]>([]);

  readonly typeLabels     = ISSUE_TYPE_LABELS;
  readonly severityConfig = ISSUE_SEVERITY_CONFIG;

  sortedIssues() {
    const r = this.report();
    if (!r) return [];
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...r.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  }

  estimatedCost() {
    return this.consistencySvc.documentCount + 1;
  }

  async ngOnInit(): Promise<void> {
    const saved = await this.consistencySvc.loadSavedReport();
    if (saved) this.report.set(saved);
  }

  async startAnalysis(): Promise<void> {
    this.progressLog.set([]);
    try {
      const r = await this.consistencySvc.analyze(msg => {
        this.progressLog.update(logs => [...logs.slice(-10), msg]);
      });
      this.report.set(r);
    } catch (e) {
      this.progressLog.update(l => [...l, `Error: ${e}`]);
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }
}
