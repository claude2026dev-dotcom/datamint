import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsNavComponent } from '../../shared/components/settings-nav/settings-nav.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, SettingsNavComponent, BackButtonComponent],
  template: `
    <div class="dm-container page">
      <app-back-button />
      <h1>Account</h1>
      <app-settings-nav />

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
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; max-width: 560px; }
    h1 { font-size: 1.6rem; margin-bottom: 24px; }
    .section { padding: 24px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 0.82rem; color: var(--dm-text-muted); margin-bottom: 6px; }
    .hint { font-size: 0.76rem; color: var(--dm-text-muted); margin-top: 4px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }

    .card-footer { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--dm-border); display: flex; justify-content: flex-end; }
    @media (max-width: 480px) {
      .card-footer { flex-direction: column-reverse; align-items: stretch; }
      .card-footer .dm-btn { width: 100%; }
    }
  `]
})
export class ProfileComponent implements OnInit {
  loading = true;
  saving = false;
  email = '';
  displayName = '';

  constructor(
    private auth: AuthService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.auth.getProfile().subscribe(res => {
      this.email = res.profile.email;
      this.displayName = res.profile.displayName ?? '';
      this.loading = false;
    });
  }

  save() {
    this.saving = true;
    this.auth.updateProfile(this.displayName).subscribe({
      next: () => { this.saving = false; this.toast.success('Profile updated.'); },
      error: () => this.saving = false
    });
  }
}
