import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="dm-container page">
      <h1>Your profile</h1>

      @if (loading) {
        <p class="muted">Loading…</p>
      } @else {
        <div class="dm-card section">
          <h3>Account details</h3>
          <div class="field">
            <label>Email</label>
            <input class="dm-input" [value]="email" disabled />
            <p class="hint">Email can't be changed here — contact support if you need to update it.</p>
          </div>
          <div class="field">
            <label>Display name</label>
            <input class="dm-input" [(ngModel)]="displayName" placeholder="Your name" />
          </div>
          <div class="card-footer">
            <button class="dm-btn dm-btn-primary" (click)="save()" [disabled]="saving">
              {{ saving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>

        <div class="dm-card section">
          <h3>Your plan</h3>
          @if (planStatus?.hasActiveSubscription) {
            <p class="plan-line"><strong>{{ planStatus?.planName }}</strong></p>
            <p class="muted">
              {{ planStatus?.uploadsUsedThisCycle }} / {{ planStatus?.monthlyUploadLimit === -1 ? 'unlimited' : planStatus?.monthlyUploadLimit }} uploads used this cycle
            </p>
            @if (planStatus?.endAtUtc) { <p class="muted small">Renews {{ planStatus?.endAtUtc | date:'mediumDate' }}</p> }
          } @else {
            <p class="muted">You don't have an active plan yet.</p>
          }
          <div class="card-footer">
            <a routerLink="/plans" class="dm-btn dm-btn-ghost">{{ planStatus?.hasActiveSubscription ? 'Change plan' : 'Choose a plan' }}</a>
          </div>
        </div>

        @if (hasPassword) {
          <div class="dm-card section">
            <h3>Change password</h3>
            <p class="muted hint-block">Changing your password signs you out on every device.</p>

            @if (passwordError) { <div class="error-banner">{{ passwordError }}</div> }

            <div class="field">
              <label>Current password</label>
              <input class="dm-input" type="password" [(ngModel)]="currentPassword" (ngModelChange)="passwordError = ''" />
            </div>
            <div class="field">
              <label>New password</label>
              <input class="dm-input" type="password" [(ngModel)]="newPassword"
                     (ngModelChange)="passwordError = ''" (focus)="showChecklist = true" />
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
              <input class="dm-input" type="password" [(ngModel)]="confirmNewPassword" (ngModelChange)="passwordError = ''" />
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
          <p class="muted hint-block">Permanently delete your account and all of its documents. This can't be undone.</p>

          @if (hasPassword && showDeleteConfirm) {
            <div class="field">
              <label>Confirm your password to continue</label>
              <input class="dm-input" type="password" [(ngModel)]="deletePassword" />
            </div>
          }

          <div class="card-footer">
            @if (!showDeleteConfirm) {
              <button class="dm-btn dm-btn-ghost danger-btn" (click)="showDeleteConfirm = true">Delete my account</button>
            } @else {
              <div class="delete-actions">
                <button class="dm-btn dm-btn-ghost" (click)="showDeleteConfirm = false; deletePassword = ''">Cancel</button>
                <button class="dm-btn danger-confirm" [disabled]="deleting || (hasPassword && !deletePassword)" (click)="deleteAccount()">
                  {{ deleting ? 'Deleting…' : 'Permanently delete account' }}
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 40px 0 80px; max-width: 560px; }
    h1 { font-size: 1.6rem; margin-bottom: 24px; }
    .section { padding: 24px; margin-bottom: 18px; }
    .section h3 { font-size: 1rem; margin-bottom: 16px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 0.82rem; color: var(--dm-text-muted); margin-bottom: 6px; }
    .hint { font-size: 0.76rem; color: var(--dm-text-muted); margin-top: 4px; }
    .hint-block { margin: -6px 0 16px; font-size: 0.82rem; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .small { font-size: 0.8rem; }
    .plan-line { font-size: 1.1rem; margin-bottom: 6px; }

    .error-banner { background: rgba(239,68,68,0.1); border: 1px solid var(--dm-danger); color: var(--dm-danger); font-size: 0.85rem; padding: 10px 14px; border-radius: var(--dm-radius-sm); margin-bottom: 14px; }
    .checklist { list-style: none; padding: 10px 12px; margin: -8px 0 16px; display: flex; flex-direction: column; gap: 4px; background: var(--dm-bg-elevated); border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border); }
    .checklist li { font-size: 0.78rem; color: var(--dm-text-muted); transition: color 0.15s; }
    .checklist li.met { color: var(--dm-success); }
    .mismatch { color: var(--dm-danger); font-size: 0.78rem; margin: 6px 0 0; }

    .danger-zone { border-color: var(--dm-danger); }
    .danger-btn { color: var(--dm-danger); border-color: var(--dm-danger); }
    .danger-btn:hover { background: rgba(239,68,68,0.1); }
    .delete-actions { display: flex; gap: 10px; }
    .danger-confirm { background: var(--dm-danger); color: #1a0505; }
    .danger-confirm:hover { filter: brightness(1.08); }

    .card-footer { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--dm-border); display: flex; justify-content: flex-end; }
    .card-footer .delete-actions { width: 100%; justify-content: flex-end; }
    @media (max-width: 480px) {
      .card-footer, .card-footer .delete-actions { flex-direction: column-reverse; align-items: stretch; }
      .card-footer .dm-btn { width: 100%; }
    }
  `]
})
export class ProfileComponent implements OnInit {
  loading = true;
  saving = false;
  email = '';
  displayName = '';
  hasPassword = true;
  planStatus: { hasActiveSubscription: boolean; planName?: string; endAtUtc?: string; uploadsUsedThisCycle: number; monthlyUploadLimit: number } | null = null;

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  showChecklist = false;
  changingPassword = false;
  passwordError = '';

  showDeleteConfirm = false;
  deletePassword = '';
  deleting = false;

  constructor(
    private auth: AuthService,
    private subscriptionService: SubscriptionService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService
  ) {}

  ngOnInit() {
    this.auth.getProfile().subscribe(res => {
      this.email = res.profile.email;
      this.displayName = res.profile.displayName ?? '';
      this.hasPassword = res.profile.hasPassword;
      this.loading = false;
    });

    this.subscriptionService.getStatus().subscribe(res => this.planStatus = res.status);
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

  save() {
    this.saving = true;
    this.auth.updateProfile(this.displayName).subscribe({
      next: () => { this.saving = false; this.toast.success('Profile updated.'); },
      error: () => this.saving = false
    });
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

  async deleteAccount() {
    const confirmed = await this.confirmDialog.ask({
      title: 'Delete your account?',
      message: 'This permanently deletes your account and all of your documents. This cannot be undone.',
      confirmLabel: 'Delete my account',
      danger: true
    });
    if (!confirmed) return;

    this.deleting = true;
    this.auth.deleteAccount(this.hasPassword ? this.deletePassword : null).subscribe({
      next: () => {
        this.toast.success('Your account has been deleted.');
        this.auth.logout();
      },
      error: err => {
        this.deleting = false;
        this.toast.error(err?.error?.message || 'Could not delete your account. Please try again.');
      }
    });
  }
}
