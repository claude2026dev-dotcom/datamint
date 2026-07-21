import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SettingsNavComponent } from '../../../shared/components/settings-nav/settings-nav.component';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule, FormsModule, SettingsNavComponent, BackButtonComponent, IconComponent],
  template: `
    <div class="dm-container page">
      <app-back-button />
      <h1>Security</h1>
      <app-settings-nav />

      @if (hasPassword) {
        <div class="dm-card section">
          <h3>Change password</h3>
          <p class="muted hint-block">Changing your password signs you out on every device.</p>

          @if (passwordError) { <div class="error-banner">{{ passwordError }}</div> }

          <div class="field">
            <label>Current password</label>
            <div class="password-field">
              <input class="dm-input" [type]="showCurrentPassword ? 'text' : 'password'" [(ngModel)]="currentPassword" (ngModelChange)="passwordError = ''" />
              <button type="button" class="toggle-visibility" (click)="showCurrentPassword = !showCurrentPassword" [attr.aria-label]="showCurrentPassword ? 'Hide password' : 'Show password'">
                <app-icon [name]="showCurrentPassword ? 'eye-off' : 'eye'" [size]="18" />
              </button>
            </div>
          </div>
          <div class="field">
            <label>New password</label>
            <div class="password-field">
              <input class="dm-input" [type]="showNewPassword ? 'text' : 'password'" [(ngModel)]="newPassword"
                     (ngModelChange)="passwordError = ''" (focus)="showChecklist = true" />
              <button type="button" class="toggle-visibility" (click)="showNewPassword = !showNewPassword" [attr.aria-label]="showNewPassword ? 'Hide password' : 'Show password'">
                <app-icon [name]="showNewPassword ? 'eye-off' : 'eye'" [size]="18" />
              </button>
            </div>
          </div>

          @if (showChecklist && newPassword) {
            <ul class="checklist">
              <li [class.met]="checks.length">{{ checks.length ? '✓' : '○' }} At least 8 characters</li>
              <li [class.met]="checks.upper">{{ checks.upper ? '✓' : '○' }} One uppercase letter</li>
              <li [class.met]="checks.lower">{{ checks.lower ? '✓' : '○' }} One lowercase letter</li>
              <li [class.met]="checks.digit">{{ checks.digit ? '✓' : '○' }} One number</li>
              <li [class.met]="checks.special">{{ checks.special ? '✓' : '○' }} One special character</li>
            </ul>
          }

          <div class="field">
            <label>Confirm new password</label>
            <div class="password-field">
              <input class="dm-input" [type]="showConfirmPassword ? 'text' : 'password'" [(ngModel)]="confirmNewPassword" (ngModelChange)="passwordError = ''" />
              <button type="button" class="toggle-visibility" (click)="showConfirmPassword = !showConfirmPassword" [attr.aria-label]="showConfirmPassword ? 'Hide password' : 'Show password'">
                <app-icon [name]="showConfirmPassword ? 'eye-off' : 'eye'" [size]="18" />
              </button>
            </div>
            @if (confirmNewPassword && confirmNewPassword !== newPassword) {
              <p class="mismatch">Passwords don't match.</p>
            }
          </div>

          <div class="card-footer">
            <button class="dm-btn dm-btn-primary"
                    [disabled]="changingPassword || !currentPassword || !allChecksPass || newPassword !== confirmNewPassword"
                    (click)="changePassword()">
              {{ changingPassword ? 'Changing…' : 'Change password' }}
            </button>
          </div>
        </div>
      }

      <div class="dm-card section danger-zone">
        <h3>Danger zone</h3>

        @if (isSuperAdmin) {
          <p class="muted hint-block">
            <app-icon name="shield" [size]="14" /> This is the super admin account — it can't be deactivated, disabled,
            or demoted, by itself or any other admin, so there's always a way back in.
          </p>
        } @else {
        <p class="muted hint-block">
          Deactivate your account. It's kept for {{ graceDays }} days in case you change your mind — just sign in again
          within that window to reactivate exactly as you left it. After that, everything is permanently erased.
        </p>

        @if (showDeactivateConfirm) {
          <div class="delete-warning">
            <app-icon name="alert-triangle" [size]="16" />
            <span>
              This signs you out everywhere right away. Your account stays recoverable for {{ graceDays }} days by
              signing back in - after that it's permanently erased and can't be undone.
            </span>
          </div>

          @if (hasPassword) {
            <div class="field">
              <label>Confirm your password to continue</label>
              <div class="password-field">
                <input class="dm-input" [type]="showDeletePassword ? 'text' : 'password'" [(ngModel)]="deletePassword" />
                <button type="button" class="toggle-visibility" (click)="showDeletePassword = !showDeletePassword" [attr.aria-label]="showDeletePassword ? 'Hide password' : 'Show password'">
                  <app-icon [name]="showDeletePassword ? 'eye-off' : 'eye'" [size]="18" />
                </button>
              </div>
            </div>
          } @else {
            <div class="field">
              <label>Type <strong>DEACTIVATE</strong> to confirm — your account doesn't have a password, since you signed in with Google</label>
              <input class="dm-input" type="text" [(ngModel)]="deleteConfirmText" placeholder="DEACTIVATE" />
            </div>
          }
        }

        <div class="card-footer">
          @if (!showDeactivateConfirm) {
            <button class="dm-btn dm-btn-ghost danger-btn" (click)="showDeactivateConfirm = true">Deactivate my account</button>
          } @else {
            <div class="delete-actions">
              <button class="dm-btn dm-btn-ghost" (click)="cancelDeactivate()">Cancel</button>
              <button class="dm-btn danger-confirm" [disabled]="deactivating || !canConfirmDeactivate()" (click)="deactivateAccount()">
                {{ deactivating ? 'Deactivating…' : 'Deactivate account' }}
              </button>
            </div>
          }
        </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; max-width: 560px; }
    h1 { font-size: 1.6rem; margin-bottom: 24px; }
    .section { padding: 24px; margin-bottom: 18px; }
    .section h3 { font-size: 1rem; margin-bottom: 16px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 0.82rem; color: var(--dm-text-muted); margin-bottom: 6px; }
    .password-field { position: relative; display: flex; }
    .password-field .dm-input { padding-right: 42px; }
    .toggle-visibility {
      position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
      background: none; border: none; padding: 6px; cursor: pointer; color: var(--dm-text-muted);
      display: flex; align-items: center; border-radius: var(--dm-radius-sm);
    }
    .toggle-visibility:hover { color: var(--dm-text); background: var(--dm-surface-hover); }
    .hint-block { margin: -6px 0 16px; font-size: 0.82rem; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }

    .error-banner { background: rgba(239,68,68,0.1); border: 1px solid var(--dm-danger); color: var(--dm-danger); font-size: 0.85rem; padding: 10px 14px; border-radius: var(--dm-radius-sm); margin-bottom: 14px; }
    .checklist { list-style: none; padding: 10px 12px; margin: -8px 0 16px; display: flex; flex-direction: column; gap: 4px; background: var(--dm-bg-elevated); border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border); }
    .checklist li { font-size: 0.78rem; color: var(--dm-text-muted); transition: color 0.15s; }
    .checklist li.met { color: var(--dm-success); }
    .mismatch { color: var(--dm-danger); font-size: 0.78rem; margin: 6px 0 0; }

    .danger-zone { border-color: var(--dm-danger); }
    .delete-warning {
      display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; margin-bottom: 16px;
      background: rgba(239,68,68,0.08); border: 1px solid var(--dm-danger); border-radius: var(--dm-radius-sm);
      color: var(--dm-danger); font-size: 0.84rem; line-height: 1.5;
    }
    .delete-warning app-icon { flex-shrink: 0; margin-top: 1px; }
    .danger-btn { color: var(--dm-danger); border-color: var(--dm-danger); }
    .danger-btn:hover { background: rgba(239,68,68,0.1); }
    .delete-actions { display: flex; gap: 10px; }
    .danger-confirm { background: var(--dm-danger); color: var(--dm-danger-contrast-text); }
    .danger-confirm:hover { filter: brightness(1.08); }

    .card-footer { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--dm-border); display: flex; justify-content: flex-end; }
    .card-footer .delete-actions { width: 100%; justify-content: flex-end; }
    @media (max-width: 480px) {
      .card-footer, .card-footer .delete-actions { flex-direction: column-reverse; align-items: stretch; }
      .card-footer .dm-btn { width: 100%; }
    }
  `]
})
export class SecurityComponent {
  hasPassword = true;
  isSuperAdmin = false;
  graceDays = 30;

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
  showChecklist = false;
  changingPassword = false;
  passwordError = '';

  showDeactivateConfirm = false;
  deletePassword = '';
  deleteConfirmText = '';
  showDeletePassword = false;
  deactivating = false;

  constructor(
    private auth: AuthService,
    private toast: ToastService
  ) {
    this.auth.getProfile().subscribe(res => {
      this.hasPassword = res.profile.hasPassword;
      this.isSuperAdmin = res.profile.isSuperAdmin;
    });
  }

  get checks() {
    const p = this.newPassword;
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

  changePassword() {
    this.changingPassword = true;
    this.passwordError = '';
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.toast.success('Password changed. Please sign in again.');
        this.auth.logout();
      },
      error: err => {
        this.changingPassword = false;
        this.passwordError = err?.error?.message || 'Could not change your password. Please try again.';
      }
    });
  }

  // A password-holding account confirms deactivation by re-entering that password -
  // the same "prove you're really you" gate real apps use for destructive actions.
  // A Google-only account has no password to re-enter, so it confirms by typing
  // DEACTIVATE instead - still a deliberate, hard-to-do-by-accident action, not the
  // free pass a plain "click one button" flow would otherwise leave it as.
  canConfirmDeactivate(): boolean {
    return this.hasPassword ? !!this.deletePassword : this.deleteConfirmText.trim().toUpperCase() === 'DEACTIVATE';
  }

  cancelDeactivate() {
    this.showDeactivateConfirm = false;
    this.deletePassword = '';
    this.deleteConfirmText = '';
  }

  // Revealing this section (clicking "Deactivate my account") together with typing
  // the password/DEACTIVATE confirmation IS the confirmation step - there is
  // deliberately no second "are you sure?" popup stacked on top of it, which
  // used to make the exact same question get asked twice in a row.
  deactivateAccount() {
    this.deactivating = true;
    this.auth.deleteAccount(this.hasPassword ? this.deletePassword : null).subscribe({
      next: () => {
        this.toast.success(`Your account has been deactivated. Sign in within ${this.graceDays} days to reactivate it.`);
        this.auth.logout();
      },
      error: err => {
        this.deactivating = false;
        this.toast.error(err?.error?.message || 'Could not deactivate your account. Please try again.');
      }
    });
  }
}
