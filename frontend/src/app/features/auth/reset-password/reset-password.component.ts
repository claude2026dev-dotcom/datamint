import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent],
  template: `
    <div class="auth-wrap">
      <div class="dm-card auth-card">
        @if (!token) {
          <h2>Invalid link</h2>
          <p class="muted">This password reset link is missing its token. Request a new one below.</p>
          <a routerLink="/forgot-password" class="dm-btn dm-btn-primary submit">Request a new link</a>
        } @else if (success) {
          <h2>Password reset</h2>
          <p class="muted">Your password has been changed. You can now log in with your new password.</p>
          <a routerLink="/login" class="dm-btn dm-btn-primary submit">Go to login</a>
        } @else {
          <h2>Choose a new password</h2>
          <p class="muted">Enter a new password for your account.</p>

          @if (errorMessage) { <div class="error-banner">{{ errorMessage }}</div> }

          <form (ngSubmit)="submit()" #f="ngForm">
            <label>New password</label>
            <div class="password-field">
              <input class="dm-input" [type]="showPassword ? 'text' : 'password'" name="password" [(ngModel)]="password"
                     required (ngModelChange)="errorMessage = ''" (focus)="showChecklist = true" />
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

            <label>Confirm new password</label>
            <div class="password-field">
              <input class="dm-input" [type]="showConfirmPassword ? 'text' : 'password'" name="confirmPassword" [(ngModel)]="confirmPassword"
                     required (ngModelChange)="errorMessage = ''" />
              <button type="button" class="toggle-visibility" (click)="showConfirmPassword = !showConfirmPassword" [attr.aria-label]="showConfirmPassword ? 'Hide password' : 'Show password'">
                <app-icon [name]="showConfirmPassword ? 'eye-off' : 'eye'" [size]="18" />
              </button>
            </div>
            @if (confirmPassword && confirmPassword !== password) {
              <p class="mismatch">Passwords don't match.</p>
            }

            <button class="dm-btn dm-btn-primary submit" type="submit"
                    [disabled]="f.invalid || !allChecksPass || password !== confirmPassword || loading">
              {{ loading ? 'Resetting…' : 'Reset password' }}
            </button>
          </form>
        }
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
    .submit { width: 100%; margin-top: 20px; display: block; text-align: center; }
    .error-banner { background: rgba(239,68,68,0.1); border: 1px solid var(--dm-danger); color: var(--dm-danger); font-size: 0.85rem; padding: 10px 14px; border-radius: var(--dm-radius-sm); margin-bottom: 4px; }
    .checklist { list-style: none; padding: 10px 12px; margin: 8px 0 0; display: flex; flex-direction: column; gap: 4px; background: var(--dm-surface); border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border); }
    .checklist li { font-size: 0.78rem; color: var(--dm-text-muted); transition: color 0.15s; }
    .checklist li.met { color: var(--dm-success); }
    .mismatch { color: var(--dm-danger); font-size: 0.78rem; margin: 6px 0 0; }
  `]
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;
  loading = false;
  success = false;
  showChecklist = false;
  errorMessage = '';

  constructor(private route: ActivatedRoute, private router: Router, private auth: AuthService) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
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
    if (!this.allChecksPass || this.password !== this.confirmPassword) return;
    this.loading = true;
    this.errorMessage = '';
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: () => { this.loading = false; this.success = true; },
      error: err => { this.loading = false; this.errorMessage = err?.error?.message || 'Something went wrong. Please try again.'; }
    });
  }
}
