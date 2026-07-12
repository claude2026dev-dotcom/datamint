import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';

/// Shown once, on first visit, until the user actually chooses - Google Sign-In
/// and Razorpay Checkout (the only third-party, cookie-setting scripts this app
/// loads) stay uninjected until "Accept" is clicked, so "Reject" is a real choice,
/// not just a banner that dismisses itself while the scripts load anyway.
@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (cookieConsent.consent() === null) {
      <div class="dm-card cookie-banner" role="dialog" aria-label="Cookie consent">
        <p>
          We use a couple of essential and functional cookies - things like keeping you signed in, plus
          third-party widgets for Google Sign-In and Razorpay Checkout. See our <a routerLink="/privacy">Privacy Policy</a> for details.
        </p>
        <div class="cookie-actions">
          <button class="dm-btn dm-btn-ghost" (click)="cookieConsent.reject()">Reject non-essential</button>
          <button class="dm-btn dm-btn-primary" (click)="cookieConsent.accept()">Accept</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .cookie-banner {
      position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 300;
      max-width: 640px; margin: 0 auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px;
      box-shadow: var(--dm-shadow);
    }
    .cookie-banner p { margin: 0; font-size: 0.86rem; color: var(--dm-text-muted); line-height: 1.5; }
    .cookie-banner a { color: var(--dm-primary-light); }
    .cookie-actions { display: flex; gap: 10px; justify-content: flex-end; }
    @media (max-width: 480px) {
      .cookie-actions { flex-direction: column-reverse; }
      .cookie-actions .dm-btn { width: 100%; }
    }
  `]
})
export class CookieConsentComponent {
  constructor(public cookieConsent: CookieConsentService) {}
}
