import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { Plan } from '../../../core/models/models';

declare const Razorpay: any; // loaded via https://checkout.razorpay.com/v1/checkout.js in index.html - only invoked when order.provider is a real gateway

type CheckoutStage = 'loading' | 'confirm' | 'processing' | 'success' | 'failed';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, BackButtonComponent, IconComponent],
  template: `
    <div class="dm-container page">
      <app-back-button fallbackUrl="/plans" />

      <div class="dm-card box">
        @switch (stage) {
          @case ('loading') {
            <div class="state-icon spin"><app-icon name="cpu" [size]="34" /></div>
            <h2>Loading plan…</h2>
          }
          @case ('confirm') {
            <h2>Confirm your subscription</h2>
            @if (plan) {
              <div class="plan-summary">
                <span class="plan-name">{{ plan.name }}</span>
                <span class="plan-price">{{ plan.currency }} {{ plan.price }} <span class="cycle">/ {{ plan.billingCycle === 'Monthly' ? 'mo' : 'yr' }}</span></span>
              </div>
            }
            <p class="muted">You'll be redirected to our secure checkout to complete payment.</p>
            <button class="dm-btn dm-btn-primary" (click)="pay()">Pay &amp; activate plan</button>
          }
          @case ('processing') {
            <div class="state-icon spin"><app-icon name="cpu" [size]="34" /></div>
            <h2>Processing payment…</h2>
            <p class="muted">Please don't close this page.</p>
          }
          @case ('success') {
            <div class="state-icon success"><app-icon name="check-circle" [size]="40" /></div>
            <h2>Payment successful</h2>
            <p class="muted">{{ plan?.name || 'Your plan' }} is now active. You're ready to start extracting.</p>
            <button class="dm-btn dm-btn-primary" (click)="goToUpload()">Start extracting</button>
          }
          @case ('failed') {
            <div class="state-icon failed"><app-icon name="x-circle" [size]="40" /></div>
            <h2>Payment failed</h2>
            <p class="muted">{{ failureMessage }}</p>
            <div class="actions">
              <button class="dm-btn dm-btn-ghost" (click)="router.navigateByUrl('/plans')">Back to plans</button>
              <button class="dm-btn dm-btn-primary" (click)="reset()">Try again</button>
            </div>
          }
        }

        @if (isFakeProvider && (stage === 'confirm' || stage === 'processing')) {
          <div class="test-mode">
            <div class="test-mode-head"><app-icon name="flask" [size]="15" /> Test mode</div>
            <p>No real gateway is configured — payments are simulated locally so you can test the full flow end-to-end.</p>
            @if (order) {
              <div class="test-mode-actions">
                <button class="dm-btn dm-btn-ghost tiny" [disabled]="stage === 'processing'" (click)="simulate(true)">Simulate success</button>
                <button class="dm-btn dm-btn-ghost tiny danger" [disabled]="stage === 'processing'" (click)="simulate(false)">Simulate failure</button>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding-top: 60px; padding-bottom: 60px; }
    .box { max-width: 440px; margin: 0 auto; padding: 32px; text-align: center; display: flex; flex-direction: column; align-items: center; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 10px 0 24px; }
    .box h2 { margin: 4px 0 0; }

    .plan-summary { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 14px 0 6px; }
    .plan-name { font-weight: 700; }
    .plan-price { font-size: 1.4rem; font-weight: 800; }
    .plan-price .cycle { font-size: 0.85rem; font-weight: 500; color: var(--dm-text-muted); }

    .state-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; }
    .state-icon.success { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .state-icon.failed { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }
    .state-icon.spin { background: var(--dm-surface-hover); color: var(--dm-primary-light); }
    .state-icon.spin app-icon { animation: spin 1.4s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .actions { display: flex; gap: 10px; margin-top: 4px; }

    .test-mode { margin-top: 26px; padding: 14px 16px; border: 1px dashed var(--dm-border); border-radius: 10px; width: 100%; text-align: left; }
    .test-mode-head { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.82rem; color: var(--dm-primary-light); }
    .test-mode p { margin: 6px 0 12px; font-size: 0.8rem; color: var(--dm-text-muted); line-height: 1.5; }
    .test-mode-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .tiny { padding: 7px 14px; font-size: 0.8rem; }
    .danger { border-color: var(--dm-danger); color: var(--dm-danger); }
    .danger:hover:not(:disabled) { background: rgba(248,113,113,0.1); }

    @media (max-width: 480px) {
      .box { padding: 24px; }
      .actions, .test-mode-actions { flex-direction: column; width: 100%; }
      .actions .dm-btn, .test-mode-actions .dm-btn { width: 100%; }
    }
  `]
})
export class CheckoutComponent implements OnInit {
  planId = '';
  plan: Plan | null = null;
  stage: CheckoutStage = 'loading';
  order: { orderId: string; amount: number; currency: string; keyId: string; provider: string } | null = null;
  failureMessage = '';

  get isFakeProvider() { return this.order?.provider === 'Fake'; }

  constructor(
    private route: ActivatedRoute,
    private subscriptionService: SubscriptionService,
    private toast: ToastService,
    public router: Router
  ) {}

  ngOnInit() {
    this.planId = this.route.snapshot.paramMap.get('planId')!;
    this.subscriptionService.getPlans().subscribe({
      next: res => { this.plan = res.plans.find(p => p.id === this.planId) ?? null; this.stage = 'confirm'; },
      // The plan might be a non-public one (e.g. mid-price-change) - still let checkout proceed,
      // just without the summary card; the backend re-validates the plan regardless.
      error: () => { this.stage = 'confirm'; }
    });
  }

  pay() {
    this.stage = 'processing';
    this.subscriptionService.createOrder(this.planId).subscribe({
      next: res => {
        this.order = res.order;
        if (this.isFakeProvider) {
          this.stage = 'confirm'; // wait for the explicit "Simulate success/failure" click below
          return;
        }
        this.openRealCheckout(res.order);
      },
      error: () => { this.stage = 'failed'; this.failureMessage = 'Could not start checkout. Please try again.'; }
    });
  }

  private openRealCheckout(order: { orderId: string; amount: number; currency: string; keyId: string }) {
    const options = {
      key: order.keyId || environment.paymentPublicKey,
      amount: order.amount * 100,
      currency: order.currency,
      order_id: order.orderId,
      name: environment.appName,
      description: 'Subscription payment',
      handler: (response: any) => this.verify(order.orderId, response.razorpay_payment_id, response.razorpay_signature),
      modal: { ondismiss: () => { this.stage = 'confirm'; } },
      theme: { color: '#6366f1' }
    };
    new Razorpay(options).open();
  }

  /// Fake provider only: no real checkout widget exists, so this simulates what the widget's
  /// handler callback would deliver - a matching id/signature pair for success, or a deliberately
  /// wrong one to exercise the real failure path (backend verification, transaction Status update,
  /// audit log) exactly as it would for a real declined payment.
  simulate(success: boolean) {
    if (!this.order) return;
    this.stage = 'processing';
    const paymentId = success ? `fake_pay_${this.order.orderId}` : `fake_pay_${this.order.orderId}_wrong`;
    const signature = success ? `fake_sig_${this.order.orderId}` : `fake_sig_wrong`;
    this.verify(this.order.orderId, paymentId, signature);
  }

  private verify(providerOrderId: string, providerPaymentId: string, providerSignature: string) {
    this.stage = 'processing';
    this.subscriptionService.verifyPayment({ planId: this.planId, providerOrderId, providerPaymentId, providerSignature }).subscribe({
      next: () => { this.stage = 'success'; },
      error: err => {
        this.stage = 'failed';
        this.failureMessage = err?.error?.message || 'Payment verification failed. Please contact support if you were charged.';
      }
    });
  }

  reset() {
    this.order = null;
    this.failureMessage = '';
    this.stage = 'confirm';
  }

  goToUpload() {
    this.toast.success('Subscription activated!');
    this.router.navigateByUrl('/upload');
  }
}
