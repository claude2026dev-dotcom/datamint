import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-users',
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

      <h1>Users</h1>

      @if (error) {
        <div class="dm-card error-banner">
          <p>{{ error }}</p>
          <button class="dm-btn dm-btn-ghost" (click)="load()">Retry</button>
        </div>
      } @else if (loading) {
        <p class="muted">Loading users…</p>
      } @else {
        <div class="dm-card table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Plan</th><th>Status</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              @for (u of users; track u.id) {
                <tr>
                  <td>{{ u.email }}</td>
                  <td>{{ u.displayName }}</td>
                  <td>{{ u.role }}</td>
                  <td>{{ u.currentPlan ?? 'Free' }}</td>
                  <td><span [class.ok]="u.isActive" [class.fail]="!u.isActive">{{ u.isActive ? 'Active' : 'Disabled' }}</span></td>
                  <td>{{ u.createdAtUtc | date:'mediumDate' }}</td>
                  <td><button class="dm-btn dm-btn-ghost small" (click)="toggle(u)">{{ u.isActive ? 'Disable' : 'Enable' }}</button></td>
                </tr>
              }
            </tbody>
          </table>
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
    .table-wrap { overflow-x: auto; padding: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--dm-border); white-space: nowrap; }
    th { color: var(--dm-text-muted); font-weight: 600; }
    .ok { color: var(--dm-success); } .fail { color: var(--dm-danger); }
    .small { padding: 6px 12px; font-size: 0.8rem; }
  `]
})
export class AdminUsersComponent implements OnInit {
  users: any[] = [];
  loading = true;
  error = '';

  constructor(private adminService: AdminService, private toast: ToastService) {}
  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.error = '';
    this.adminService.getUsers().subscribe({
      next: res => { this.users = res.items; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load users. Please try again.'; }
    });
  }

  toggle(u: any) {
    this.adminService.toggleUserActive(u.id).subscribe({
      next: res => {
        u.isActive = res.isActive;
        this.toast.success(`User ${res.isActive ? 'enabled' : 'disabled'}.`);
      },
      error: () => this.toast.error('Could not update that user. Please try again.')
    });
  }
}
