import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <div class="dm-card auth-card">
        @if (!submitted) {
          <h2>Forgot your password?</h2>
          <p class="muted">Enter the email on your account and we'll send you a link to reset your password.</p>

          <form (ngSubmit)="submit()" #f="ngForm">
            <label>Email</label>
            <input class="dm-input" type="email" name="email" [(ngModel)]="email" required />

            <button class="dm-btn dm-btn-primary submit" type="submit" [disabled]="f.invalid || loading">
              {{ loading ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>
        } @else {
          <h2>Check your email</h2>
          <p class="muted">If an account exists for <strong>{{ email }}</strong>, we've sent a link to reset your password. The link expires in 1 hour.</p>
        }

        <p class="muted footer-link"><a routerLink="/login">← Back to log in</a></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-wrap { min-height: calc(100vh - 64px); display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth-card { width: 100%; max-width: 400px; padding: 32px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    label { display: block; margin: 14px 0 6px; font-size: 0.85rem; color: var(--dm-text-muted); }
    .submit { width: 100%; margin-top: 20px; }
    .footer-link { margin-top: 18px; text-align: center; }
    .footer-link a { color: var(--dm-primary-light); }
  `]
})
export class ForgotPasswordComponent {
  email = '';
  loading = false;
  submitted = false;

  constructor(private auth: AuthService) {}

  submit() {
    this.loading = true;
    this.auth.forgotPassword(this.email).subscribe({
      next: () => { this.loading = false; this.submitted = true; },
      // Backend always returns success to avoid leaking which emails exist —
      // treat any transport-level error the same way so behavior stays identical.
      error: () => { this.loading = false; this.submitted = true; }
    });
  }
}
