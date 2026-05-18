import { Component, inject, signal, OnInit, output, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { StatsService } from '../../../core/services/stats.service';
import { StatsEntry }   from '../../../core/models/stats.model';
import { InkModalComponent } from '../../../shared/components/ink-modal.component';

@Component({
  selector: 'app-stats-modal',
  standalone: true,
  imports: [InkModalComponent, DecimalPipe],
  templateUrl: './stats-modal.component.html',
  styleUrl:    './stats-modal.component.css',
})
export class StatsModalComponent implements OnInit {
  private statsService = inject(StatsService);
  closed = output<void>();

  @ViewChild('chartSvg') chartSvg?: ElementRef<SVGSVGElement>;

  entries      = signal<StatsEntry[]>([]);
  streak       = signal(0);
  totalWords30 = signal(0);
  avgWords30   = signal(0);

  async ngOnInit(): Promise<void> {
    const [entries, streak, total] = await Promise.all([
      this.statsService.getLastNDays(30),
      this.statsService.currentStreak(),
      this.statsService.totalWordsLastNDays(30),
    ]);

    this.entries.set(entries);
    this.streak.set(streak);
    this.totalWords30.set(total);

    const activeDays = entries.filter(e => e.wordsAdded > 0).length;
    this.avgWords30.set(activeDays > 0 ? Math.round(total / activeDays) : 0);

    setTimeout(() => this.renderChart(entries), 50);
  }

  renderChart(entries: StatsEntry[]): void {
    const svgEl = this.chartSvg?.nativeElement;
    if (!svgEl) return;

    const W      = svgEl.clientWidth || 400;
    const H      = 120;
    const mTop   = 10;
    const mRight = 8;
    const mBot   = 20;
    const mLeft  = 30;
    const width  = W - mLeft - mRight;
    const height = H - mTop - mBot;

    const maxVal = Math.max(...entries.map(e => e.wordsAdded), 1);
    const barW   = width / entries.length;
    const pad    = barW * 0.15;

    const scaleY = (v: number) => height - (Math.max(0, v) / maxVal) * height;

    const ns = 'http://www.w3.org/2000/svg';

    svgEl.innerHTML = '';
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${mLeft},${mTop})`);
    svgEl.appendChild(g);

    // Barras
    entries.forEach((entry, i) => {
      const x    = i * barW + pad;
      const y    = scaleY(entry.wordsAdded);
      const bh   = height - y;
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x',      String(x));
      rect.setAttribute('y',      String(y));
      rect.setAttribute('width',  String(barW - pad * 2));
      rect.setAttribute('height', String(Math.max(bh, 0)));
      rect.setAttribute('rx',     '2');
      rect.setAttribute('fill',   entry.wordsAdded > 0 ? 'var(--ink-accent)' : 'var(--ink-border)');
      rect.setAttribute('opacity', '0.85');
      g.appendChild(rect);
    });

    // Eje Y — 3 marcas
    [0, 0.5, 1].forEach(ratio => {
      const val  = Math.round(maxVal * ratio);
      const y    = height - ratio * height;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', '-5');
      line.setAttribute('x2', String(width));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', 'var(--ink-border)');
      line.setAttribute('stroke-width', '0.5');
      g.appendChild(line);

      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x',           '-8');
      label.setAttribute('y',           String(y + 3));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('fill',        'var(--ink-subtle)');
      label.setAttribute('font-size',   '9');
      label.textContent = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(val);
      g.appendChild(label);
    });

    // Eje X — etiqueta cada 7 días
    entries.forEach((entry, i) => {
      if (i % 7 !== 0) return;
      const d     = new Date(entry.date);
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x',          String(i * barW + barW / 2));
      label.setAttribute('y',          String(height + 14));
      label.setAttribute('text-anchor','middle');
      label.setAttribute('fill',       'var(--ink-subtle)');
      label.setAttribute('font-size',  '9');
      label.textContent = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      g.appendChild(label);
    });
  }
}
