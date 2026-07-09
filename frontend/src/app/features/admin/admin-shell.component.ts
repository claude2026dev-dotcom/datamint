import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, IconComponent],
  template: `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-icon"><app-icon name="tool" [size]="20" /></span>
          <div>
            <div class="sidebar-title">Admin</div>
            <div class="sidebar-sub">Control panel</div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <a routerLink="/admin" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="active">
            <app-icon name="bar-chart" [size]="17" /> Overview
          </a>
          <a routerLink="/admin/audits" routerLinkActive="active">
            <app-icon name="file-text" [size]="17" /> Audit logs
          </a>
          <a routerLink="/admin/users" routerLinkActive="active">
            <app-icon name="users" [size]="17" /> Users
          </a>
          <a routerLink="/admin/subscriptions" routerLinkActive="active">
            <app-icon name="credit-card" [size]="17" /> Plans
          </a>
        </nav>

        <a routerLink="/" class="sidebar-footer"><app-icon name="chevron-left" [size]="15" /> Back to app</a>
      </aside>

      <main class="admin-content">
        <div class="admin-content-inner">
          <router-outlet></router-outlet>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .admin-shell { display: flex; align-items: flex-start; min-height: calc(100vh - 64px); }

    .admin-sidebar {
      width: 232px; flex-shrink: 0; position: sticky; top: 64px; height: calc(100vh - 64px);
      background: var(--dm-bg-elevated); border-right: 1px solid var(--dm-border);
      display: flex; flex-direction: column; padding: 22px 14px;
    }
    .sidebar-header { display: flex; align-items: center; gap: 10px; padding: 4px 10px 20px; }
    .sidebar-icon { color: var(--dm-primary-light); display: flex; }
    .sidebar-title { font-weight: 700; font-size: 0.95rem; }
    .sidebar-sub { font-size: 0.72rem; color: var(--dm-text-muted); }

    .sidebar-nav { display: flex; flex-direction: column; gap: 3px; flex: 1; }
    .sidebar-nav a {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--dm-radius-sm);
      color: var(--dm-text-muted); text-decoration: none; font-size: 0.88rem; font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .sidebar-nav a app-icon { flex-shrink: 0; }
    .sidebar-nav a:hover { background: var(--dm-surface-hover); color: var(--dm-text); }
    .sidebar-nav a.active { background: var(--dm-surface); color: var(--dm-text); box-shadow: inset 3px 0 0 var(--dm-primary); }

    .sidebar-footer {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; color: var(--dm-text-muted); text-decoration: none; font-size: 0.82rem;
      border-top: 1px solid var(--dm-border); margin-top: 10px; padding-top: 16px;
    }
    .sidebar-footer:hover { color: var(--dm-text); }

    .admin-content { flex: 1; min-width: 0; }
    .admin-content-inner { max-width: 1320px; margin: 0 auto; padding: 32px 36px 80px; }

    @media (max-width: 900px) {
      .admin-shell { flex-direction: column; min-height: 0; }
      .admin-sidebar {
        position: static; width: 100%; height: auto; flex-direction: row; align-items: center;
        overflow-x: auto; padding: 10px 14px; gap: 4px; border-right: none; border-bottom: 1px solid var(--dm-border);
      }
      .sidebar-header, .sidebar-footer { display: none; }
      .sidebar-nav { flex-direction: row; flex: none; }
      .sidebar-nav a { white-space: nowrap; }
      .sidebar-nav a.active { box-shadow: inset 0 -3px 0 var(--dm-primary); }
      .admin-content-inner { padding: 24px 16px 60px; }
    }
  `]
})
export class AdminShellComponent {}
