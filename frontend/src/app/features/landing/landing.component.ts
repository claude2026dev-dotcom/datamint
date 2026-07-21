import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { IconComponent } from '../../shared/components/icon/icon.component';

/// Placeholder marketing content - the real pitch gets rebuilt once the new feature
/// set is defined. See docs/WORKFLOW.md for the current phase of this project.
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
        <span class="badge reveal"><app-icon name="sparkles" [size]="14" /> Coming soon</span>
        <h1 class="reveal">Something new is on the way</h1>
        <p class="sub reveal">We're rebuilding this from the ground up. Create an account to be ready when it launches.</p>
        <div class="cta reveal">
          <a routerLink="/register" class="dm-btn dm-btn-primary">Create an account</a>
          <a routerLink="/login" class="dm-btn dm-btn-ghost">Log in</a>
        </div>
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
    .sub { color: var(--dm-text-muted); max-width: 560px; font-size: 1.05rem; }
    .cta { display: flex; gap: 14px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }

    @media (max-width: 900px) {
      h1 { font-size: 2rem; }
    }
  `]
})
export class LandingComponent {}
