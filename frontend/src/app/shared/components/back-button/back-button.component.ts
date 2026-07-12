import { Component, Input } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-back-button',
  standalone: true,
  imports: [IconComponent],
  template: `
    <button class="back-btn" type="button" (click)="goBack()">
      <app-icon name="chevron-left" [size]="16" /> {{ label }}
    </button>
  `,
  styles: [`
    .back-btn {
      display: inline-flex; align-items: center; gap: 6px; background: none; border: none;
      color: var(--dm-text-muted); font-size: 0.88rem; font-weight: 600; cursor: pointer;
      padding: 6px 4px; margin-bottom: 16px; border-radius: var(--dm-radius-sm);
      transition: color 0.15s ease, background 0.15s ease;
    }
    .back-btn:hover { color: var(--dm-text); background: var(--dm-surface-hover); }
  `]
})
export class BackButtonComponent {
  /// Where to go if there's no in-app history to step back into (e.g. this page
  /// was opened directly from a bookmark or a fresh tab) - without this, the
  /// button would either do nothing or navigate the user out of the app entirely.
  @Input() fallbackUrl = '/home';
  @Input() label = 'Back';

  constructor(private location: Location, private router: Router) {}

  goBack() {
    if (window.history.length > 1) this.location.back();
    else this.router.navigateByUrl(this.fallbackUrl);
  }
}
