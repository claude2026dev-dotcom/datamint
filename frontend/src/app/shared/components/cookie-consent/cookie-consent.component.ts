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
    @if (cookieConsent.bannerOpen()) {
      <div class="dm-card cookie-banner" role="dialog" aria-label="Cookie consent">
        <p>
          Signing in and using Datamint only needs a session token - no cookie banner would even be required for that alone.
          We're asking because two <em>optional</em> features load third-party scripts that set their own cookies:
          <strong>Google Sign-In</strong> and <strong>Razorpay Checkout</strong>. Accept to enable both; reject and everything
          else - email/password login, uploads, editing, exports - still works exactly the same. You can change your mind
          any time from "Cookie settings" in the footer. See our <a routerLink="/privacy">Privacy Policy</a> for details.
        </p>
        @if (cookieConsent.consent(); as current) {
          <p class="current-choice">Current choice: <strong>{{ current === 'accepted' ? 'Accepted' : 'Rejected' }}</strong></p>
        }
        <div class="cookie-actions">
          <button class="dm-btn dm-btn-ghost" (click)="cookieConsent.reject()">Reject non-essential</button>
          <button class="dm-btn dm-btn-ghost accept-btn" (click)="cookieConsent.accept()">Accept</button>
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
    .current-choice { font-size: 0.8rem !important; }
    .cookie-banner a { color: var(--dm-primary-light); }
    .cookie-actions { display: flex; gap: 10px; justify-content: flex-end; }
    /* Both buttons are deliberately the same size/weight - only the border color tells
       Accept apart from Reject. A brighter, bigger "Accept" next to a dim "Reject" link
       is the exact "dark pattern" EU regulators (CNIL, the ICO) have fined sites over:
       nudging people toward accepting instead of presenting a genuine, equal choice. */
    .accept-btn { border-color: var(--dm-primary); color: var(--dm-primary-light); }
    @media (max-width: 480px) {
      .cookie-actions { flex-direction: column-reverse; }
      .cookie-actions .dm-btn { width: 100%; }
    }
  `]
})
export class CookieConsentComponent {
  constructor(public cookieConsent: CookieConsentService) {}
}
