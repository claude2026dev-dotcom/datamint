import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-settings-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="settings-tabs">
      <a routerLink="/profile" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
        <app-icon name="user" [size]="15" /> <span>Account</span>
      </a>
      <a routerLink="/profile/plan" routerLinkActive="active">
        <app-icon name="credit-card" [size]="15" /> <span>Plan</span>
      </a>
      <a routerLink="/profile/security" routerLinkActive="active">
        <app-icon name="key" [size]="15" /> <span>Security</span>
      </a>
    </nav>
  `,
  styles: [`
    .settings-tabs {
      display: flex; gap: 4px; margin-bottom: 24px; padding: 4px;
      background: var(--dm-surface); border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm);
    }
    .settings-tabs a {
      display: flex; align-items: center; gap: 7px; flex: 1; justify-content: center;
      padding: 9px 12px; border-radius: calc(var(--dm-radius-sm) - 2px); text-decoration: none;
      color: var(--dm-text-muted); font-size: 0.85rem; font-weight: 600; transition: background 0.15s ease, color 0.15s ease;
    }
    .settings-tabs a:hover { color: var(--dm-text); background: var(--dm-surface-hover); }
    .settings-tabs a.active { color: white; background: var(--dm-gradient-primary); }
    @media (max-width: 360px) { .settings-tabs a span { display: none; } }
  `]
})
export class SettingsNavComponent {}
