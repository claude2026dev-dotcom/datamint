import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="wrap">
      <div class="dm-card card">
        <div class="mark">D</div>
        <h1>404 — Page not found</h1>
        <p class="muted">
          There's nothing at this address. It may have been moved, or the link might be mistyped.
        </p>
        <div class="actions">
          <a routerLink="/" class="dm-btn dm-btn-primary">Back to home</a>
          <a [routerLink]="auth.isLoggedIn() ? '/upload' : '/login'" class="dm-btn dm-btn-ghost">
            {{ auth.isLoggedIn() ? 'Go to Upload' : 'Log in' }}
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: calc(100vh - 64px); display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { width: 100%; max-width: 440px; padding: 40px 32px; text-align: center; }
    .mark {
      width: 48px; height: 48px; margin: 0 auto 20px; border-radius: 12px;
      background: var(--dm-gradient-primary); color: #fff; font-weight: 800; font-size: 1.3rem;
      display: flex; align-items: center; justify-content: center;
    }
    h1 { font-size: 1.4rem; margin-bottom: 10px; }
    .muted { color: var(--dm-text-muted); font-size: 0.92rem; line-height: 1.6; margin-bottom: 26px; }
    .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  `]
})
export class NotFoundComponent {
  constructor(public auth: AuthService) {}
}
