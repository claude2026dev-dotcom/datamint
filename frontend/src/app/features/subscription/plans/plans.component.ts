import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Plan, SubscriptionStatus } from '../../../core/models/models';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dm-container page">
      <div class="head">
        <h1>Simple, transparent pricing</h1>
        <p class="muted">Start free. Upgrade any time as your extraction needs grow.</p>
        <!-- Pricing values below are placeholders seeded in the DB — set real numbers from Admin > Plans -->
      </div>

      @if (error) {
        <div class="dm-card error-banner">
          <p>{{ error }}</p>
          <button class="dm-btn dm-btn-ghost" (click)="load()">Retry</button>
        </div>
      } @else if (loading) {
        <div class="plan-grid">
          @for (i of [1,2,3]; track i) { <div class="dm-card plan-card skeleton"></div> }
        </div>
      } @else {
      <div class="plan-grid">
        @for (plan of plans; track plan.id) {
          <div class="dm-card plan-card" [class.featured]="plan.name === 'Pro'" [class.current]="plan.id === currentPlanId">
            @if (plan.name === 'Pro' && plan.id !== currentPlanId) { <span class="ribbon">Most popular</span> }
            @if (plan.id === currentPlanId) { <span class="ribbon current-ribbon">Your current plan</span> }
            <h3>{{ plan.name }}</h3>
            <div class="price">
              <span class="amount">{{ plan.price === 0 ? 'Free' : (plan.currency + ' ' + plan.price) }}</span>
              @if (plan.price > 0) { <span class="cycle">/ {{ plan.billingCycle.toLowerCase() }}</span> }
            </div>
            <p class="desc">{{ plan.description }}</p>
            <ul>
              <li>{{ plan.monthlyPageLimit === -1 ? 'Unlimited' : plan.monthlyPageLimit }} pages / month</li>
              <li>AI-powered key/value extraction</li>
              <li>Excel export & email delivery</li>
            </ul>
            @if (plan.id === currentPlanId) {
              <a routerLink="/profile/plan" class="dm-btn dm-btn-ghost">Manage plan</a>
            } @else {
              <button class="dm-btn" [class.dm-btn-primary]="plan.name !== 'Free'" [class.dm-btn-ghost]="plan.name === 'Free'"
                      [disabled]="activating" (click)="choosePlan(plan)">
                {{ activating ? 'Activating…' : (hasAnyPlan ? 'Switch to ' + plan.name : (plan.price === 0 ? 'Start free' : 'Choose ' + plan.name)) }}
              </button>
            }
          </div>
        }
      </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 50px; padding-bottom: 90px; }
    .head { text-align: center; margin-bottom: 40px; }
    .muted { color: var(--dm-text-muted); }
    .plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .plan-card { padding: 28px; position: relative; display: flex; flex-direction: column; gap: 14px; }
    .plan-card.featured { border-color: var(--dm-primary); box-shadow: 0 0 0 1px var(--dm-primary), var(--dm-shadow); }
    .plan-card.current { border-color: var(--dm-success); box-shadow: 0 0 0 1px var(--dm-success), var(--dm-shadow); }
    .ribbon { position: absolute; top: -10px; right: 20px; background: var(--dm-gradient-primary); color: white; font-size: 0.72rem; padding: 4px 10px; border-radius: 999px; }
    .ribbon.current-ribbon { background: var(--dm-success); left: 20px; right: auto; }
    .price { display: flex; align-items: baseline; gap: 6px; }
    .amount { font-size: 1.8rem; font-weight: 800; }
    .cycle { color: var(--dm-text-muted); font-size: 0.85rem; }
    .desc { color: var(--dm-text-muted); font-size: 0.88rem; min-height: 36px; }
    ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem; }
    li::before { content: "✓ "; color: var(--dm-success); }
    @media (max-width: 900px) { .plan-grid { grid-template-columns: 1fr; } }

    .error-banner { max-width: 480px; margin: 0 auto; padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }
    .plan-card.skeleton { height: 280px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  `]
})
export class PlansComponent implements OnInit {
  plans: Plan[] = [];
  loading = true;
  error = '';
  activating = false;
  currentPlanId: string | null = null;
  hasAnyPlan = false;

  constructor(
    private subscriptionService: SubscriptionService,
    public auth: AuthService,
    private toast: ToastService,
    private router: Router
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.error = '';
    this.subscriptionService.getPlans().subscribe({
      next: res => { this.plans = res.plans; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load plans. Please try again.'; }
    });

    // Only logged-in users have anything to compare against - this is the public
    // pricing page too, so it must work fine for a signed-out visitor as well.
    // A failure here just means "current plan" can't be highlighted - not worth
    // blocking the whole page, since Plan management is available from Profile too.
    if (this.auth.isLoggedIn()) {
      this.subscriptionService.getStatus().subscribe({
        next: res => {
          if (res.status.hasActiveSubscription) {
            this.currentPlanId = res.status.planId ?? null;
            this.hasAnyPlan = true;
          }
        },
        error: () => {}
      });
    }
  }

  choosePlan(plan: Plan) {
    if (!this.auth.isLoggedIn()) { this.router.navigateByUrl('/login'); return; }

    if (plan.price === 0) {
      // Nothing to charge - activate the subscription directly instead of
      // just navigating away (that used to leave no subscription behind at
      // all, so upload would immediately bounce back to /plans again).
      this.activating = true;
      this.subscriptionService.activateFreePlan(plan.id).subscribe({
        next: res => {
          this.activating = false;
          this.toast.success(res.message);
          this.router.navigateByUrl('/upload');
        },
        error: () => { this.activating = false; }
      });
      return;
    }

    this.router.navigateByUrl(`/checkout/${plan.id}`);
  }
}
