import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  animations: [
    trigger('staggerIn', [
      transition(':enter', [
        query('.reveal', [
          style({ opacity: 0, transform: 'translateY(16px)' }),
          stagger(90, animate('420ms cubic-bezier(.2,.8,.2,1)', style({ opacity: 1, transform: 'translateY(0)' })))
        ], { optional: true })
      ])
    ])
  ],
  template: `
    <section class="hero" [@staggerIn]>
      <div class="glow"></div>
      <div class="dm-container hero-inner">
        <span class="badge reveal"><app-icon name="sparkles" [size]="14" /> AI-powered PDF data extraction</span>
        <h1 class="reveal">Turn any PDF into clean, editable data — in seconds</h1>
        <p class="sub reveal">Upload scanned or digital PDFs, let AI pull out every field, review and edit the results, then export to Excel or send it straight to your inbox.</p>
        <div class="cta reveal">
          <a routerLink="/upload" class="dm-btn dm-btn-primary">Try it free — 2 uploads, no card needed</a>
          <a routerLink="/plans" class="dm-btn dm-btn-ghost">See pricing</a>
        </div>

        <div class="mock reveal">
          <div class="mock-doc">
            <div class="mock-line" style="width:70%"></div>
            <div class="mock-line" style="width:50%"></div>
            <div class="mock-line" style="width:85%"></div>
          </div>
          <div class="mock-arrow"><app-icon name="arrow-right" [size]="26" /></div>
          <div class="mock-table">
            <div class="row"><span>Reference #</span><span>REF-2026-014</span></div>
            <div class="row"><span>Amount</span><span>₹24,500</span></div>
            <div class="row"><span>Date</span><span>05 Jul 2026</span></div>
          </div>
        </div>
      </div>
    </section>

    <section class="features dm-container">
      <div class="feature-grid">
        <div class="dm-card feature">
          <div class="icon"><app-icon name="scan" [size]="26" /></div>
          <h3>OCR built-in</h3>
          <p>Scanned or photographed PDFs work automatically — no manual pre-processing.</p>
        </div>
        <div class="dm-card feature">
          <div class="icon"><app-icon name="cpu" [size]="26" /></div>
          <h3>AI-structured output</h3>
          <p>Every field is pulled into clean key/value pairs, ready to review and edit.</p>
        </div>
        <div class="dm-card feature">
          <div class="icon"><app-icon name="grid" [size]="26" /></div>
          <h3>One-click Excel export</h3>
          <p>Download a formatted spreadsheet, or have it emailed to you directly.</p>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .hero { position: relative; overflow: hidden; padding: 90px 0 60px; }
    .glow { position: absolute; top: -120px; left: 50%; transform: translateX(-50%); width: 700px; height: 400px;
            background: radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%); filter: blur(40px); pointer-events: none; }
    .hero-inner { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 18px; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; background: var(--dm-surface); border: 1px solid var(--dm-border); font-size: 0.8rem; color: var(--dm-accent); }
    h1 { font-size: 2.6rem; max-width: 780px; line-height: 1.15; }
    .sub { color: var(--dm-text-muted); max-width: 560px; font-size: 1.05rem; }
    .cta { display: flex; gap: 14px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }
    .mock { display: flex; align-items: center; gap: 18px; margin-top: 50px; background: var(--dm-surface); border: 1px solid var(--dm-border); border-radius: var(--dm-radius-lg); padding: 26px; box-shadow: var(--dm-shadow); }
    .mock-doc { width: 140px; background: var(--dm-bg-elevated); border-radius: var(--dm-radius-sm); padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .mock-line { height: 8px; border-radius: 4px; background: var(--dm-border); }
    .mock-arrow { color: var(--dm-primary-light); display: flex; }
    .mock-table { display: flex; flex-direction: column; gap: 8px; min-width: 220px; text-align: left; }
    .mock-table .row { display: flex; justify-content: space-between; gap: 20px; font-size: 0.85rem; padding: 6px 10px; background: var(--dm-bg-elevated); border-radius: 6px; }
    .mock-table .row span:first-child { color: var(--dm-text-muted); }

    .features { padding: 50px 0 90px; }
    .feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .feature { padding: 26px; }
    .feature .icon { color: var(--dm-primary-light); margin-bottom: 12px; }
    .feature p { color: var(--dm-text-muted); font-size: 0.92rem; margin-top: 6px; }

    @media (max-width: 900px) {
      h1 { font-size: 2rem; }
      .mock { flex-direction: column; }
      .feature-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class LandingComponent {}
