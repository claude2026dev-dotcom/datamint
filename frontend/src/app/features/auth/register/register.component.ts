import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { GoogleSigninButtonComponent } from '../../../shared/components/google-signin-button/google-signin-button.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GoogleSigninButtonComponent],
  template: `
    <div class="auth-wrap">
      <div class="dm-card auth-card">
        <h2>Create your account</h2>
        <p class="muted">Get more uploads and access your document history.</p>

        <app-google-signin-button (credential)="signUpWithGoogle($event)" />
        <div class="divider"><span>or</span></div>

        <form (ngSubmit)="submit()" #f="ngForm">
          <label>Full name</label>
          <input class="dm-input" type="text" name="name" [(ngModel)]="displayName" />

          <label>Email</label>
          <input class="dm-input" type="email" name="email" [(ngModel)]="email" required />

          <label>Password</label>
          <input class="dm-input" type="password" name="password" [(ngModel)]="password" required minlength="6" />

          <button class="dm-btn dm-btn-primary submit" type="submit" [disabled]="f.invalid || loading">
            {{ loading ? 'Creating account…' : 'Create account' }}
          </button>
        </form>

        <p class="muted footer-link">Already have an account? <a routerLink="/login">Log in</a></p>
        <p class="muted terms-note">By continuing you agree to our <a routerLink="/terms">Terms</a> and <a routerLink="/privacy">Privacy Policy</a>.</p>
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
    .footer-link a, .terms-note a { color: var(--dm-primary-light); }
    .terms-note { margin-top: 10px; text-align: center; font-size: 0.78rem; }
  `]
})
export class RegisterComponent {
  displayName = '';
  email = '';
  password = '';
  loading = false;

  constructor(private auth: AuthService, private toast: ToastService) {}

  submit() {
    this.loading = true;
    this.auth.register(this.email, this.password, this.displayName).subscribe({
      next: res => this.auth.completeLogin(res),
      error: () => this.loading = false,
      complete: () => this.loading = false
    });
  }

  signUpWithGoogle(idToken: string) {
    this.auth.loginWithGoogle(idToken).subscribe({
      next: res => this.auth.completeLogin(res),
      error: () => this.toast.error('Google sign-up failed. Please try again.')
    });
  }
}
