import { Component, AfterViewInit, ElementRef, EventEmitter, NgZone, Output, ViewChild } from '@angular/core';
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
  styles: [`.google-btn-slot { display: flex; justify-content: center; }`]
})
export class GoogleSigninButtonComponent implements AfterViewInit {
  @ViewChild('btnContainer', { static: true }) btnContainer!: ElementRef<HTMLDivElement>;
  @Output() credential = new EventEmitter<string>();

  constructor(private zone: NgZone) {}

  ngAfterViewInit() {
    this.renderWhenReady();
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

    google.accounts.id.renderButton(this.btnContainer.nativeElement, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      width: 320
    });
  }
}
