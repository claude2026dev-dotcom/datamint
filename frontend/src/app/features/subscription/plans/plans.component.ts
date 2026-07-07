import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Plan } from '../../../core/models/models';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dm-container page">
      <div class="head">
        <h1>Simple, transparent pricing</h1>
        <p class="muted">Start free. Upgrade any time as your extraction needs grow.</p>
        <!-- Pricing values below are placeholders seeded in the DB — set real numbers from Admin > Plans -->
      </div>

      <div class="plan-grid">
        @for (plan of plans; track plan.id) {
          <div class="dm-card plan-card" [class.featured]="plan.name === 'Pro'">
            @if (plan.name === 'Pro') { <span class="ribbon">Most popular</span> }
            <h3>{{ plan.name }}</h3>
            <div class="price">
              <span class="amount">{{ plan.price === 0 ? 'Free' : (plan.currency + ' ' + plan.price) }}</span>
              @if (plan.price > 0) { <span class="cycle">/ {{ plan.billingCycle.toLowerCase() }}</span> }
            </div>
            <p class="desc">{{ plan.description }}</p>
            <ul>
              <li>{{ plan.monthlyUploadLimit === -1 ? 'Unlimited' : plan.monthlyUploadLimit }} PDF extractions / month</li>
              <li>AI-powered key/value extraction</li>
              <li>Excel export & email delivery</li>
            </ul>
            <button class="dm-btn" [class.dm-btn-primary]="plan.name !== 'Free'" [class.dm-btn-ghost]="plan.name === 'Free'"
                    [disabled]="activating" (click)="choosePlan(plan)">
              {{ activating ? 'Activating…' : (plan.price === 0 ? 'Start free' : 'Choose ' + plan.name) }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 50px 0 90px; }
    .head { text-align: center; margin-bottom: 40px; }
    .muted { color: var(--dm-text-muted); }
    .plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .plan-card { padding: 28px; position: relative; display: flex; flex-direction: column; gap: 14px; }
    .plan-card.featured { border-color: var(--dm-primary); box-shadow: 0 0 0 1px var(--dm-primary), var(--dm-shadow); }
    .ribbon { position: absolute; top: -10px; right: 20px; background: var(--dm-gradient-primary); color: white; font-size: 0.72rem; padding: 4px 10px; border-radius: 999px; }
    .price { display: flex; align-items: baseline; gap: 6px; }
    .amount { font-size: 1.8rem; font-weight: 800; }
    .cycle { color: var(--dm-text-muted); font-size: 0.85rem; }
    .desc { color: var(--dm-text-muted); font-size: 0.88rem; min-height: 36px; }
    ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem; }
    li::before { content: "✓ "; color: var(--dm-success); }
    @media (max-width: 900px) { .plan-grid { grid-template-columns: 1fr; } }
  `]
})
export class PlansComponent implements OnInit {
  plans: Plan[] = [];
  activating = false;

  constructor(
    private subscriptionService: SubscriptionService,
    public auth: AuthService,
    private toast: ToastService,
    private router: Router
  ) {}

  ngOnInit() {
    this.subscriptionService.getPlans().subscribe(res => this.plans = res.plans);
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
