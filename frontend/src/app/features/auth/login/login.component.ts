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

        <form (ngSubmit)="submit()" #f="ngForm">
          <label>Email</label>
          <input class="dm-input" type="email" name="email" [(ngModel)]="email" required />

          <label>Password</label>
          <input class="dm-input" type="password" name="password" [(ngModel)]="password" required minlength="6" />

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
    .submit { width: 100%; margin-top: 20px; }
    .divider { display: flex; align-items: center; gap: 10px; margin: 18px 0; color: var(--dm-text-muted); font-size: 0.8rem; }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--dm-border); }
    .footer-link { margin-top: 18px; text-align: center; }
    .footer-link a { color: var(--dm-primary-light); }
  `]
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;

  constructor(private auth: AuthService, private toast: ToastService) {}

  submit() {
    this.loading = true;
    this.auth.login(this.email, this.password).subscribe({
      next: res => this.auth.completeLogin(res),
      error: () => this.loading = false,
      complete: () => this.loading = false
    });
  }

  loginWithGoogle(idToken: string) {
    this.auth.loginWithGoogle(idToken).subscribe({
      next: res => this.auth.completeLogin(res),
      error: () => this.toast.error('Google sign-in failed. Please try again.')
    });
  }
}
