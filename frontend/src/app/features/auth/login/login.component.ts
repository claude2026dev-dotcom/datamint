import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { GoogleSigninButtonComponent } from '../../../shared/components/google-signin-button/google-signin-button.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GoogleSigninButtonComponent],
  template: `
    <div class="auth-wrap">
      <div class="dm-card auth-card">
        <h2>Welcome back</h2>
        <p class="muted">Log in to review your documents and manage your plan.</p>

        <app-google-signin-button (credential)="loginWithGoogle($event)" />
        <div class="divider"><span>or</span></div>

        @if (errorMessage) { <div class="error-banner">{{ errorMessage }}</div> }

        <form (ngSubmit)="submit()" #f="ngForm">
          <label>Email</label>
          <input class="dm-input" type="email" name="email" [(ngModel)]="email" required (ngModelChange)="errorMessage = ''" />

          <label>Password</label>
          <input class="dm-input" type="password" name="password" [(ngModel)]="password" required minlength="6" (ngModelChange)="errorMessage = ''" />

          <label class="remember-row">
            <input type="checkbox" name="rememberMe" [(ngModel)]="rememberMe" />
            <span>Remember me for 10 days</span>
          </label>

          <button class="dm-btn dm-btn-primary submit" type="submit" [disabled]="f.invalid || loading">
            {{ loading ? 'Signing in…' : 'Log in' }}
          </button>
        </form>

        <p class="muted footer-link">New to Datamint? <a routerLink="/register">Create an account</a></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-wrap { min-height: calc(100vh - 64px); display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth-card { width: 100%; max-width: 400px; padding: 32px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    label { display: block; margin: 14px 0 6px; font-size: 0.85rem; color: var(--dm-text-muted); }
    .remember-row { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; cursor: pointer; }
    .remember-row input[type="checkbox"] { accent-color: var(--dm-primary); width: 16px; height: 16px; }
    .remember-row span { margin: 0; color: var(--dm-text); font-size: 0.85rem; }
    .submit { width: 100%; margin-top: 20px; }
    .divider { display: flex; align-items: center; gap: 10px; margin: 18px 0; color: var(--dm-text-muted); font-size: 0.8rem; }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--dm-border); }
    .error-banner { background: rgba(239,68,68,0.1); border: 1px solid var(--dm-danger); color: var(--dm-danger); font-size: 0.85rem; padding: 10px 14px; border-radius: var(--dm-radius-sm); margin-bottom: 4px; }
    .footer-link { margin-top: 18px; text-align: center; }
    .footer-link a { color: var(--dm-primary-light); }
  `]
})
export class LoginComponent {
  email = '';
  password = '';
  rememberMe = false;
  loading = false;
  errorMessage = '';

  constructor(private auth: AuthService, private toast: ToastService) {}

  submit() {
    this.loading = true;
    this.errorMessage = '';
    this.auth.login(this.email, this.password, this.rememberMe).subscribe({
      next: res => this.auth.completeLogin(res, this.rememberMe),
      error: err => { this.loading = false; this.errorMessage = err?.error?.message || 'Something went wrong. Please try again.'; },
      complete: () => this.loading = false
    });
  }

  loginWithGoogle(idToken: string) {
    this.auth.loginWithGoogle(idToken).subscribe({
      next: res => this.auth.completeLogin(res, true),
      error: () => this.toast.error('Google sign-in failed. Please try again.')
    });
  }
}
