import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { SubscriptionStatus } from '../../../core/models/models';
import { SettingsNavComponent } from '../../../shared/components/settings-nav/settings-nav.component';
import { isFreeTrialPlan, usageLabel as computeUsageLabel, usagePercent as computeUsagePercent } from '../../../shared/utils/plan-usage';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

@Component({
  selector: 'app-plan',
  standalone: true,
  imports: [CommonModule, RouterLink, SettingsNavComponent, BackButtonComponent],
  template: `
    <div class="dm-container page">
      <app-back-button />
      <h1>Current plan</h1>
      <app-settings-nav />

      @if (loading) {
        <p class="muted">Loading…</p>
      } @else {
        <div class="dm-card section">
          @if (planStatus?.hasActiveSubscription) {
            <div class="plan-name-row">
              <span class="plan-name">{{ planStatus?.planName }}</span>
              @if (planStatus?.cancelAtPeriodEnd) {
                <span class="badge badge-cancel">Ending {{ planStatus?.endAtUtc | date:'MMM d, h:mm a' }}</span>
              } @else {
                <span class="badge badge-active">Active</span>
              }
            </div>
            <p class="plan-price muted">
              {{ isFreeTrial() ? 'Free' : (planStatus?.currency + ' ' + planStatus?.price) }}
              @if (!isFreeTrial() && planStatus?.isRecurring) { / {{ planStatus?.billingCycle === 'Yearly' ? 'year' : 'month' }} }
            </p>

            <div class="usage-bar" [attr.aria-label]="usageLabel()">
              <div class="usage-fill" [style.width.%]="usagePercent()"></div>
            </div>
            <p class="muted small">{{ usageLabel() }}</p>

            @if (planStatus?.cancelAtPeriodEnd) {
              <p class="muted small">Your plan won't renew — you'll keep access until {{ planStatus?.endAtUtc | date:'medium' }}, then you'll be moved to Free.</p>
            } @else if (planStatus?.endAtUtc) {
              <p class="muted small">Renews {{ planStatus?.endAtUtc | date:'medium' }}</p>
            }

            <div class="card-footer plan-actions">
              @if (!planStatus?.cancelAtPeriodEnd && planStatus?.isRecurring) {
                <button class="dm-btn dm-btn-ghost danger-btn" [disabled]="cancelling" (click)="cancelPlan()">
                  {{ cancelling ? 'Cancelling…' : 'Cancel plan' }}
                </button>
              }
              <a routerLink="/plans" class="dm-btn dm-btn-primary">{{ isFreeTrial() ? 'Upgrade plan' : 'Change plan' }}</a>
            </div>
          } @else {
            <p class="muted">You don't have an active plan yet.</p>
            <div class="card-footer">
              <a routerLink="/plans" class="dm-btn dm-btn-primary">Choose a plan</a>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; max-width: 560px; }
    h1 { font-size: 1.6rem; margin-bottom: 24px; }
    .section { padding: 24px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .small { font-size: 0.8rem; }

    .plan-name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .plan-name { font-size: 1.15rem; font-weight: 700; }
    .plan-price { margin-bottom: 14px; }
    .badge { font-size: 0.72rem; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
    .badge-active { background: rgba(52,211,153,0.14); color: var(--dm-success); }
    .badge-cancel { background: rgba(251,191,36,0.14); color: var(--dm-warning); }
    .usage-bar { height: 8px; border-radius: 999px; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); overflow: hidden; margin-bottom: 6px; }
    .usage-fill { height: 100%; background: var(--dm-gradient-primary); transition: width 0.3s ease; }
    .plan-actions { justify-content: space-between; }
    @media (max-width: 480px) { .plan-actions { flex-direction: column; } .plan-actions .dm-btn { width: 100%; } }

    .danger-btn { color: var(--dm-danger); border-color: var(--dm-danger); }
    .danger-btn:hover { background: rgba(239,68,68,0.1); }

    .card-footer { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--dm-border); display: flex; justify-content: flex-end; }
    @media (max-width: 480px) {
      .card-footer { flex-direction: column-reverse; align-items: stretch; }
      .card-footer .dm-btn { width: 100%; }
    }
  `]
})
export class PlanComponent implements OnInit {
  loading = true;
  planStatus: SubscriptionStatus | null = null;
  cancelling = false;

  constructor(
    private subscriptionService: SubscriptionService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService
  ) {}

  ngOnInit() {
    this.subscriptionService.getStatus().subscribe(res => {
      this.planStatus = res.status;
      this.loading = false;
    });
  }

  isFreeTrial(): boolean {
    return isFreeTrialPlan(this.planStatus);
  }

  usagePercent(): number {
    return computeUsagePercent(this.planStatus);
  }

  usageLabel(): string {
    return computeUsageLabel(this.planStatus);
  }

  async cancelPlan() {
    const confirmed = await this.confirmDialog.ask({
      title: 'Cancel your plan?',
      message: `You'll keep access until ${this.planStatus?.endAtUtc ? new Date(this.planStatus.endAtUtc).toLocaleString() : 'the end of this cycle'}, then move to the Free plan. You can resubscribe any time.`,
      confirmLabel: 'Cancel plan',
      danger: true
    });
    if (!confirmed) return;

    this.cancelling = true;
    this.subscriptionService.cancelSubscription().subscribe({
      next: res => {
        this.cancelling = false;
        this.toast.success(res.message);
        this.subscriptionService.getStatus().subscribe(r => this.planStatus = r.status);
      },
      error: err => {
        this.cancelling = false;
        this.toast.error(err?.error?.message || 'Could not cancel your plan. Please try again.');
      }
    });
  }
}
