import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { IconComponent } from '../../shared/components/icon/icon.component';

/// Public marketing page - pitches the actual product (AI document field extraction) rather
/// than a placeholder "coming soon" state, now that upload/review/export are real features.
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
        <span class="badge reveal"><app-icon name="sparkles" [size]="14" /> AI-powered document extraction</span>
        <h1 class="reveal">Turn any PDF or scan into structured data</h1>
        <p class="sub reveal">Upload invoices, statements, forms, or reports — Datamint's AI finds every field automatically, or extracts exactly the fields you name. Review, edit, and export to Excel or JSON in minutes.</p>
        <div class="cta reveal">
          <a routerLink="/register" class="dm-btn dm-btn-primary">Start free</a>
          <a routerLink="/plans" class="dm-btn dm-btn-ghost">See pricing</a>
        </div>
      </div>
    </section>

    <section class="dm-container features reveal">
      <div class="feature-card">
        <div class="feature-icon"><app-icon name="upload-cloud" [size]="22" /></div>
        <h3>Upload anything</h3>
        <p class="muted">PDFs and photos/scans, single files or bulk batches, with per-page selection.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><app-icon name="cpu" [size]="22" /></div>
        <h3>AI-driven extraction</h3>
        <p class="muted">Auto-detect every field, or tell us exactly which ones you want — every document, consistently.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><app-icon name="edit" [size]="22" /></div>
        <h3>Review &amp; edit</h3>
        <p class="muted">Every field stays fully editable before export — nothing is locked in as AI-final.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><app-icon name="file-text" [size]="22" /></div>
        <h3>Export your way</h3>
        <p class="muted">Excel or JSON, single sheet or one file per document, plus direct email delivery.</p>
      </div>
    </section>
  `,
  styles: [`
    .hero { position: relative; overflow: hidden; padding: 120px 0 100px; }
    .glow { position: absolute; top: -120px; left: 50%; transform: translateX(-50%); width: 700px; height: 400px;
            background: radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%); filter: blur(40px); pointer-events: none; }
    .hero-inner { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 18px; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; background: var(--dm-surface); border: 1px solid var(--dm-border); font-size: 0.8rem; color: var(--dm-accent); }
    h1 { font-size: 2.6rem; max-width: 780px; line-height: 1.15; }
    .sub { color: var(--dm-text-muted); max-width: 600px; font-size: 1.05rem; }
    .cta { display: flex; gap: 14px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }

    .features { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; padding-bottom: 100px; }
    .feature-card { padding: 24px; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-lg); background: var(--dm-surface); }
    .feature-icon { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--dm-gradient-primary); color: white; margin-bottom: 14px; }
    .feature-card h3 { font-size: 1rem; margin-bottom: 6px; }
    .muted { color: var(--dm-text-muted); font-size: 0.88rem; line-height: 1.5; }

    @media (max-width: 900px) {
      h1 { font-size: 2rem; }
      .features { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 560px) {
      .features { grid-template-columns: 1fr; }
    }
  `]
})
export class LandingComponent {}
