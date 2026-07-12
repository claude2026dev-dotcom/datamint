import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  template: `
    <div class="page-head">
      <h1>Overview</h1>
      <p class="muted">Live snapshot of the platform. Timestamps across the admin area are shown in your local timezone.</p>
    </div>

    @if (error) {
      <div class="dm-card error-banner">
        <p>{{ error }}</p>
        <button class="dm-btn dm-btn-ghost" (click)="load()">Retry</button>
      </div>
    } @else if (loading) {
      <div class="stat-grid">
        @for (i of [1,2,3,4,5,6]; track i) { <div class="dm-card stat skeleton"></div> }
      </div>
    } @else {
      <div class="stat-grid">
        <div class="dm-card stat">
          <div class="stat-icon users"><app-icon name="users" [size]="20" /></div>
          <div class="stat-body"><span class="label">Total users</span><span class="value">{{ stats?.totalUsers ?? '—' }}</span></div>
        </div>
        <div class="dm-card stat">
          <div class="stat-icon subs"><app-icon name="credit-card" [size]="20" /></div>
          <div class="stat-body"><span class="label">Active subscriptions</span><span class="value">{{ stats?.activeSubscriptions ?? '—' }}</span></div>
        </div>
        <div class="dm-card stat">
          <div class="stat-icon docs"><app-icon name="file-text" [size]="20" /></div>
          <div class="stat-body"><span class="label">Documents processed</span><span class="value">{{ stats?.totalDocumentsProcessed ?? '—' }}</span></div>
        </div>
        <div class="dm-card stat">
          <div class="stat-icon today"><app-icon name="inbox" [size]="20" /></div>
          <div class="stat-body"><span class="label">Processed today</span><span class="value">{{ stats?.documentsProcessedToday ?? '—' }}</span></div>
        </div>
        <div class="dm-card stat" [class.stat-alert]="(stats?.failedExtractionsLast7Days ?? 0) > 0">
          <div class="stat-icon fail"><app-icon name="alert-triangle" [size]="20" /></div>
          <div class="stat-body"><span class="label">Failed extractions (7d)</span><span class="value" [class.danger]="(stats?.failedExtractionsLast7Days ?? 0) > 0">{{ stats?.failedExtractionsLast7Days ?? '—' }}</span></div>
        </div>
        <div class="dm-card stat">
          <div class="stat-icon rev"><app-icon name="dollar-sign" [size]="20" /></div>
          <div class="stat-body"><span class="label">Revenue this month</span><span class="value">{{ stats?.revenueThisMonth ?? '—' }}</span></div>
        </div>
      </div>

      <div class="quick-links">
        <a routerLink="/admin/audits" class="dm-card quick-link">
          <span class="ql-icon"><app-icon name="file-text" [size]="19" /></span>
          <span class="ql-title">Audit trail</span>
          <span class="ql-sub">Every login, upload, export, and admin action</span>
        </a>
        <a routerLink="/admin/users" class="dm-card quick-link">
          <span class="ql-icon"><app-icon name="users" [size]="19" /></span>
          <span class="ql-title">Manage users</span>
          <span class="ql-sub">Search, edit roles, disable or delete accounts</span>
        </a>
        <a routerLink="/admin/subscriptions" class="dm-card quick-link">
          <span class="ql-icon"><app-icon name="credit-card" [size]="19" /></span>
          <span class="ql-title">Manage plans</span>
          <span class="ql-sub">Pricing, upload limits, and availability</span>
        </a>
      </div>
    }
  `,
  styles: [`
    .page-head { margin-bottom: 24px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 6px 0 0; }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }

    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .stat { padding: 22px; display: flex; align-items: center; gap: 16px; transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .stat:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
    .stat.skeleton { height: 76px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .stat-alert { border-color: var(--dm-danger); }
    .stat-icon { width: 46px; height: 46px; flex-shrink: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(99,102,241,0.12); color: var(--dm-primary-light); }
    .stat-icon.users { background: rgba(99,102,241,0.12); color: var(--dm-primary-light); }
    .stat-icon.subs { background: rgba(34,211,238,0.14); color: var(--dm-accent); }
    .stat-icon.docs { background: rgba(168,85,247,0.14); color: #a855f7; }
    .stat-icon.today { background: rgba(52,211,153,0.14); color: var(--dm-success); }
    .stat-icon.fail { background: rgba(239,68,68,0.12); color: var(--dm-danger); }
    .stat-icon.rev { background: rgba(251,191,36,0.14); color: var(--dm-warning); }
    .stat-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .label { font-size: 0.78rem; color: var(--dm-text-muted); }
    .value { font-size: 1.55rem; font-weight: 800; }
    .value.danger { color: var(--dm-danger); }
    @media (max-width: 900px) { .stat-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 480px) { .stat-grid { grid-template-columns: 1fr; } }

    .quick-links { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 18px; }
    .quick-link { padding: 20px; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 5px; transition: transform 0.15s ease, border-color 0.15s ease; }
    .quick-link:hover { transform: translateY(-2px); border-color: var(--dm-primary); }
    .ql-icon { color: var(--dm-primary-light); margin-bottom: 2px; display: flex; }
    .ql-title { font-weight: 700; }
    .ql-sub { font-size: 0.8rem; color: var(--dm-text-muted); }
    @media (max-width: 900px) { .quick-links { grid-template-columns: 1fr; } }
  `]
})
export class AdminDashboardComponent implements OnInit {
  stats: any;
  loading = true;
  error = '';

  constructor(private adminService: AdminService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.error = '';
    this.adminService.getDashboardStats().subscribe({
      next: res => { this.stats = res.stats; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load dashboard stats. Please try again.'; }
    });
  }
}
