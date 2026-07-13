import { Component, AfterViewInit, OnDestroy, ElementRef, EventEmitter, NgZone, Output, ViewChild } from '@angular/core';
import { environment } from '../../../../environments/environment';

declare const google: any; // loaded via https://accounts.google.com/gsi/client in index.html

/// Renders the real Google-hosted sign-in button (more reliable across browsers
/// than a custom button + prompt()) and emits the ID token credential on success.
/// Used by both login and register — same backend endpoint handles first-time
/// sign-up and returning sign-in for a Google account.
@Component({
  selector: 'app-google-signin-button',
  standalone: true,
  template: `<div #btnContainer class="google-btn-slot"></div>`,
  styles: [`.google-btn-slot { display: flex; justify-content: center; max-width: 100%; overflow: hidden; }`]
})
export class GoogleSigninButtonComponent implements AfterViewInit, OnDestroy {
  @ViewChild('btnContainer', { static: true }) btnContainer!: ElementRef<HTMLDivElement>;
  @Output() credential = new EventEmitter<string>();

  private readonly onResize = () => this.renderButton();

  constructor(private zone: NgZone) {}

  ngAfterViewInit() {
    this.renderWhenReady();
    // Google's button has a fixed pixel width baked in at render time - it doesn't
    // reflow on its own, so a viewport/orientation change (or the sidebar opening)
    // needs an explicit re-render to stay within its container.
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
  }

  private renderWhenReady(retriesLeft = 20) {
    if (typeof google === 'undefined' || !google.accounts?.id) {
      // The GSI script tag is `async defer`, so it may not have executed yet
      // on first render — poll briefly rather than requiring load-order luck.
      if (retriesLeft > 0) setTimeout(() => this.renderWhenReady(retriesLeft - 1), 150);
      return;
    }

    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: { credential: string }) => this.zone.run(() => this.credential.emit(response.credential))
    });

    this.renderButton();
  }

  private renderButton() {
    const container = this.btnContainer.nativeElement;
    // A hardcoded width overflows any narrow container (e.g. the auth card on mobile,
    // or once Google renders the wider "Sign in as <name>" variant for an already
    // signed-in browser session) - measure what's actually available instead. Google
    // clamps this to its own min/max internally, so there's no need to clamp here too.
    container.innerHTML = '';
    google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      width: container.clientWidth || 320
    });
  }
}
