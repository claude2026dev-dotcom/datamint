import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';

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
          <button class="dm-btn dm-btn-primary" (click)="save()" [disabled]="saving">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
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
          <a routerLink="/plans" class="dm-btn dm-btn-ghost">{{ planStatus?.hasActiveSubscription ? 'Change plan' : 'Choose a plan' }}</a>
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
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .small { font-size: 0.8rem; }
    .plan-line { font-size: 1.1rem; margin-bottom: 6px; }
  `]
})
export class ProfileComponent implements OnInit {
  loading = true;
  saving = false;
  email = '';
  displayName = '';
  planStatus: { hasActiveSubscription: boolean; planName?: string; endAtUtc?: string; uploadsUsedThisCycle: number; monthlyUploadLimit: number } | null = null;

  constructor(private auth: AuthService, private subscriptionService: SubscriptionService, private toast: ToastService) {}

  ngOnInit() {
    this.auth.getProfile().subscribe(res => {
      this.email = res.profile.email;
      this.displayName = res.profile.displayName ?? '';
      this.loading = false;
    });

    this.subscriptionService.getStatus().subscribe(res => this.planStatus = res.status);
  }

  save() {
    this.saving = true;
    this.auth.updateProfile(this.displayName).subscribe({
      next: () => { this.saving = false; this.toast.success('Profile updated.'); },
      error: () => this.saving = false
    });
  }
}
