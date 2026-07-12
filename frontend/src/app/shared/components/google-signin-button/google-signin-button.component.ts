import { Component, AfterViewInit, ElementRef, EventEmitter, NgZone, Output, ViewChild } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';

declare const google: any; // injected by CookieConsentService once cookies are accepted

/// Renders the real Google-hosted sign-in button (more reliable across browsers
/// than a custom button + prompt()) and emits the ID token credential on success.
/// Used by both login and register — same backend endpoint handles first-time
/// sign-up and returning sign-in for a Google account.
@Component({
  selector: 'app-google-signin-button',
  standalone: true,
  template: `
    <div #btnContainer class="google-btn-slot"></div>
    @if (cookiesRejected) {
      <p class="cookie-note">Accept cookies (see the banner below) to enable Google Sign-In.</p>
    }
  `,
  styles: [`
    .google-btn-slot { display: flex; justify-content: center; }
    .cookie-note { margin: 8px 0 0; font-size: 0.78rem; color: var(--dm-text-muted); text-align: center; }
  `]
})
export class GoogleSigninButtonComponent implements AfterViewInit {
  @ViewChild('btnContainer', { static: true }) btnContainer!: ElementRef<HTMLDivElement>;
  @Output() credential = new EventEmitter<string>();

  cookiesRejected = false;

  constructor(private zone: NgZone, private cookieConsent: CookieConsentService) {}

  ngAfterViewInit() {
    this.renderWhenReady();
  }

  private renderWhenReady(retriesLeft = 20) {
    if (typeof google === 'undefined' || !google.accounts?.id) {
      // The GSI script only exists once CookieConsentService has injected it
      // (after Accept), and even then loads async - poll briefly rather than
      // requiring load-order luck.
      if (retriesLeft > 0) { setTimeout(() => this.renderWhenReady(retriesLeft - 1), 150); return; }
      this.cookiesRejected = this.cookieConsent.consent() !== 'accepted';
      return;
    }

    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: { credential: string }) => this.zone.run(() => this.credential.emit(response.credential))
    });

    google.accounts.id.renderButton(this.btnContainer.nativeElement, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      width: 320
    });
  }
}
