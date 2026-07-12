import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { GoogleSigninButtonComponent } from '../../../shared/components/google-signin-button/google-signin-button.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GoogleSigninButtonComponent, IconComponent],
  template: `
    <div class="auth-wrap">
      <div class="dm-card auth-card">
        <h2>Create your account</h2>
        <p class="muted">Get more uploads and access your document history.</p>

        <app-google-signin-button (credential)="signUpWithGoogle($event)" />
        <div class="divider"><span>or</span></div>

        @if (errorMessage) { <div class="error-banner">{{ errorMessage }}</div> }

        <form (ngSubmit)="submit()" #f="ngForm">
          <label>Full name</label>
          <input class="dm-input" type="text" name="name" [(ngModel)]="displayName" (ngModelChange)="errorMessage = ''" />

          <label>Email</label>
          <input class="dm-input" type="email" name="email" [(ngModel)]="email" required (ngModelChange)="errorMessage = ''" />

          <label>Password</label>
          <div class="password-field">
            <input class="dm-input" [type]="showPassword ? 'text' : 'password'" name="password" [(ngModel)]="password" required
                   (ngModelChange)="errorMessage = ''" (focus)="showChecklist = true" />
            <button type="button" class="toggle-visibility" (click)="showPassword = !showPassword" [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'">
              <app-icon [name]="showPassword ? 'eye-off' : 'eye'" [size]="18" />
            </button>
          </div>

          @if (showChecklist && password) {
            <ul class="checklist">
              <li [class.met]="checks.length">{{ checks.length ? '✓' : '○' }} At least 8 characters</li>
              <li [class.met]="checks.upper">{{ checks.upper ? '✓' : '○' }} One uppercase letter</li>
              <li [class.met]="checks.lower">{{ checks.lower ? '✓' : '○' }} One lowercase letter</li>
              <li [class.met]="checks.digit">{{ checks.digit ? '✓' : '○' }} One number</li>
              <li [class.met]="checks.special">{{ checks.special ? '✓' : '○' }} One special character</li>
            </ul>
          }

          <button class="dm-btn dm-btn-primary submit" type="submit" [disabled]="f.invalid || !allChecksPass || loading">
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
    .password-field { position: relative; display: flex; }
    .password-field .dm-input { padding-right: 42px; }
    .toggle-visibility {
      position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
      background: none; border: none; padding: 6px; cursor: pointer; color: var(--dm-text-muted);
      display: flex; align-items: center; border-radius: var(--dm-radius-sm);
    }
    .toggle-visibility:hover { color: var(--dm-text); background: var(--dm-surface-hover); }
    .submit { width: 100%; margin-top: 20px; }
    .divider { display: flex; align-items: center; gap: 10px; margin: 18px 0; color: var(--dm-text-muted); font-size: 0.8rem; }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--dm-border); }
    .error-banner { background: rgba(239,68,68,0.1); border: 1px solid var(--dm-danger); color: var(--dm-danger); font-size: 0.85rem; padding: 10px 14px; border-radius: var(--dm-radius-sm); margin-bottom: 4px; }
    .checklist { list-style: none; padding: 10px 12px; margin: 8px 0 0; display: flex; flex-direction: column; gap: 4px; background: var(--dm-surface); border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border); }
    .checklist li { font-size: 0.78rem; color: var(--dm-text-muted); transition: color 0.15s; }
    .checklist li.met { color: var(--dm-success); }
    .footer-link { margin-top: 18px; text-align: center; }
    .footer-link a, .terms-note a { color: var(--dm-primary-light); }
    .terms-note { margin-top: 10px; text-align: center; font-size: 0.78rem; }
  `]
})
export class RegisterComponent {
  displayName = '';
  email = '';
  password = '';
  showPassword = false;
  loading = false;
  errorMessage = '';
  showChecklist = false;

  constructor(private auth: AuthService, private toast: ToastService, private route: ActivatedRoute) {}

  private get returnUrl(): string | undefined {
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? undefined;
  }

  get checks() {
    const p = this.password;
    return {
      length: p.length >= 8,
      upper: /[A-Z]/.test(p),
      lower: /[a-z]/.test(p),
      digit: /[0-9]/.test(p),
      special: /[^A-Za-z0-9]/.test(p)
    };
  }

  get allChecksPass(): boolean {
    const c = this.checks;
    return c.length && c.upper && c.lower && c.digit && c.special;
  }

  submit() {
    if (!this.allChecksPass) return;
    this.loading = true;
    this.errorMessage = '';
    this.auth.register(this.email, this.password, this.displayName).subscribe({
      next: res => this.auth.completeLogin(res, true, this.returnUrl),
      error: err => { this.loading = false; this.errorMessage = err?.error?.message || 'Something went wrong. Please try again.'; },
      complete: () => this.loading = false
    });
  }

  signUpWithGoogle(idToken: string) {
    this.auth.loginWithGoogle(idToken).subscribe({
      next: res => this.auth.completeLogin(res, true, this.returnUrl),
      error: () => this.toast.error('Google sign-up failed. Please try again.')
    });
  }
}
