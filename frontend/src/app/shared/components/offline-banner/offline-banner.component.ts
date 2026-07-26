import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { IconComponent } from '../icon/icon.component';

/// Global "no internet" state: a sticky bar that appears the instant the browser goes
/// offline (so a failed request reads as "you're offline", not a generic error toast)
/// and flips to a brief "back online" confirmation the moment connectivity returns -
/// mounted once in AppComponent, above the navbar, so every page gets it for free.
@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule, IconComponent],
  animations: [
    trigger('slide', [
      transition(':enter', [style({ height: 0, opacity: 0 }), animate('180ms ease-out', style({ height: '*', opacity: 1 }))]),
      transition(':leave', [animate('160ms ease-in', style({ height: 0, opacity: 0 }))])
    ])
  ],
  template: `
    @if (offline()) {
      <div class="conn-banner offline" [@slide]>
        <app-icon name="alert-triangle" [size]="15" />
        <span>You're offline. Changes won't save until your connection is back.</span>
      </div>
    } @else if (justReconnected()) {
      <div class="conn-banner online" [@slide]>
        <app-icon name="check-circle" [size]="15" />
        <span>Back online.</span>
      </div>
    }
  `,
  styles: [`
    .conn-banner {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 9px 16px; font-size: 0.85rem; font-weight: 600; overflow: hidden;
    }
    .conn-banner.offline { background: var(--dm-danger); color: var(--dm-danger-contrast-text); }
    .conn-banner.online { background: var(--dm-success); color: var(--dm-danger-contrast-text); }
  `]
})
export class OfflineBannerComponent implements OnInit, OnDestroy {
  offline = signal(!navigator.onLine);
  justReconnected = signal(false);
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private readonly onOffline = () => {
    clearTimeout(this.reconnectTimer);
    this.justReconnected.set(false);
    this.offline.set(true);
  };

  private readonly onOnline = () => {
    this.offline.set(false);
    this.justReconnected.set(true);
    this.reconnectTimer = setTimeout(() => this.justReconnected.set(false), 3000);
  };

  ngOnInit() {
    window.addEventListener('offline', this.onOffline);
    window.addEventListener('online', this.onOnline);
  }

  ngOnDestroy() {
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('online', this.onOnline);
    clearTimeout(this.reconnectTimer);
  }
}
