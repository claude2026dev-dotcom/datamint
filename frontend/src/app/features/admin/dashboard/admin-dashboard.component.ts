import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div class="dm-container page">
      <div class="admin-tabs">
        <a routerLink="/admin" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="active">Overview</a>
        <a routerLink="/admin/audits" routerLinkActive="active">Audit logs</a>
        <a routerLink="/admin/users" routerLinkActive="active">Users</a>
        <a routerLink="/admin/subscriptions" routerLinkActive="active">Plans</a>
      </div>

      <h1>Admin overview</h1>

      @if (error) {
        <div class="dm-card error-banner">
          <p>{{ error }}</p>
          <button class="dm-btn dm-btn-ghost" (click)="load()">Retry</button>
        </div>
      } @else if (loading) {
        <p class="muted">Loading dashboard…</p>
      } @else {
        <div class="stat-grid">
          <div class="dm-card stat"><span class="label">Total users</span><span class="value">{{ stats?.totalUsers ?? '—' }}</span></div>
          <div class="dm-card stat"><span class="label">Active subscriptions</span><span class="value">{{ stats?.activeSubscriptions ?? '—' }}</span></div>
          <div class="dm-card stat"><span class="label">Documents processed</span><span class="value">{{ stats?.totalDocumentsProcessed ?? '—' }}</span></div>
          <div class="dm-card stat"><span class="label">Processed today</span><span class="value">{{ stats?.documentsProcessedToday ?? '—' }}</span></div>
          <div class="dm-card stat"><span class="label">Failed extractions (7d)</span><span class="value danger">{{ stats?.failedExtractionsLast7Days ?? '—' }}</span></div>
          <div class="dm-card stat"><span class="label">Revenue this month</span><span class="value">{{ stats?.revenueThisMonth ?? '—' }}</span></div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 40px 0 80px; }
    .admin-tabs { display: flex; gap: 8px; margin-bottom: 26px; border-bottom: 1px solid var(--dm-border); flex-wrap: wrap; }
    .admin-tabs a { padding: 10px 14px; color: var(--dm-text-muted); text-decoration: none; font-size: 0.9rem; border-bottom: 2px solid transparent; }
    .admin-tabs a.active { color: var(--dm-text); border-color: var(--dm-primary); }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 10px; }
    .stat { padding: 20px; display: flex; flex-direction: column; gap: 8px; }
    .label { font-size: 0.8rem; color: var(--dm-text-muted); }
    .value { font-size: 1.6rem; font-weight: 800; }
    .value.danger { color: var(--dm-danger); }
    @media (max-width: 800px) { .stat-grid { grid-template-columns: 1fr 1fr; } }
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
