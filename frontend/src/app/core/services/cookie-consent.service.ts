import { Injectable, signal } from '@angular/core';

const CONSENT_KEY = 'dm_cookie_consent';

export type CookieConsent = 'accepted' | 'rejected';

/// Google Sign-In and Razorpay Checkout are the only third-party, cookie-setting
/// scripts this app loads - both used to load unconditionally from index.html.
/// Now they're injected on demand, only once the user has actually accepted,
/// so "reject" is a real choice (no tracking scripts running before/without
/// consent) rather than just a banner that dismisses itself.
@Injectable({ providedIn: 'root' })
export class CookieConsentService {
  consent = signal<CookieConsent | null>(this.readStored());

  // Separate from `consent` on purpose: `consent` is "what was decided" (persisted),
  // this is just "is the banner currently on screen". Without the split, the only way
  // to let someone revisit their choice later (a "Cookie settings" link, same as every
  // real cookie banner has) would be to null out their saved choice just to reopen the
  // banner - which would also silently re-trigger the "accepted" default script-loading
  // logic below before they'd actually re-decided anything.
  bannerOpen = signal(this.consent() === null);

  private readonly scripts: Record<string, string> = {
    'google-gsi': 'https://accounts.google.com/gsi/client',
    'razorpay-checkout': 'https://checkout.razorpay.com/v1/checkout.js'
  };

  constructor() {
    // A returning visitor who already accepted shouldn't have to click through
    // the banner again every session - just load the scripts silently.
    if (this.consent() === 'accepted') this.loadThirdPartyScripts();
  }

  private readStored(): CookieConsent | null {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw === 'accepted' || raw === 'rejected' ? raw : null;
  }

  accept() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    this.consent.set('accepted');
    this.bannerOpen.set(false);
    this.loadThirdPartyScripts();
  }

  reject() {
    localStorage.setItem(CONSENT_KEY, 'rejected');
    this.consent.set('rejected');
    this.bannerOpen.set(false);
  }

  /// Reopens the banner so an already-decided choice can be changed - reachable any
  /// time via the "Cookie settings" link in the footer, not just on first visit.
  reopen() {
    this.bannerOpen.set(true);
  }

  private loadThirdPartyScripts() {
    for (const [id, src] of Object.entries(this.scripts)) {
      if (document.getElementById(id)) continue;
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  }
}
