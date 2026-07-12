import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

declare const Razorpay: any; // injected by CookieConsentService once cookies are accepted

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, BackButtonComponent],
  template: `
    <div class="dm-container page">
      <app-back-button fallbackUrl="/plans" />
      <div class="dm-card box">
        <h2>Confirm your subscription</h2>
        <p class="muted">You'll be redirected to Razorpay's secure checkout to complete payment.</p>
        <button class="dm-btn dm-btn-primary" (click)="pay()" [disabled]="loading">
          {{ loading ? 'Preparing checkout…' : 'Pay & activate plan' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .page { padding-top: 60px; padding-bottom: 60px; }
    .box { max-width: 420px; margin: 0 auto; padding: 32px; text-align: center; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 10px 0 24px; }
  `]
})
export class CheckoutComponent implements OnInit {
  planId = '';
  loading = false;

  constructor(private route: ActivatedRoute, private subscriptionService: SubscriptionService, private toast: ToastService, private router: Router) {}

  ngOnInit() { this.planId = this.route.snapshot.paramMap.get('planId')!; }

  pay() {
    // Razorpay's script only exists once the cookie-consent banner has been accepted
    // (see CookieConsentService) - check before even creating an order server-side,
    // rather than discovering it's missing only after that call already succeeded.
    if (typeof Razorpay === 'undefined') {
      this.toast.error('Please accept cookies (see the banner at the bottom of the page) to enable checkout.');
      return;
    }

    this.loading = true;
    this.subscriptionService.createOrder(this.planId).subscribe({
      next: res => {
        this.loading = false;
        // Public Razorpay Key ID comes from environment.ts.
        const options = {
          key: res.order.keyId || environment.razorpayKeyId,
          amount: res.order.amount * 100,
          currency: res.order.currency,
          order_id: res.order.orderId,
          name: 'Datamint',
          description: 'Subscription payment',
          handler: (response: any) => {
            this.subscriptionService.verifyPayment({
              planId: this.planId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            }).subscribe({
              next: () => { this.toast.success('Subscription activated!'); this.router.navigateByUrl('/upload'); },
              error: () => this.toast.error('Payment verification failed. Please contact support if you were charged.')
            });
          },
          theme: { color: '#6366f1' }
        };
        new Razorpay(options).open();
      },
      error: () => this.loading = false
    });
  }
}
