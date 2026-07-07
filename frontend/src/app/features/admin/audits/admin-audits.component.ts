import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-audits',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule],
  template: `
    <div class="dm-container page">
      <div class="admin-tabs">
        <a routerLink="/admin" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="active">Overview</a>
        <a routerLink="/admin/audits" routerLinkActive="active">Audit logs</a>
        <a routerLink="/admin/users" routerLinkActive="active">Users</a>
        <a routerLink="/admin/subscriptions" routerLinkActive="active">Plans</a>
      </div>

      <h1>Audit trail</h1>
      <input class="dm-input filter" placeholder="Filter by action e.g. Auth.Login" [(ngModel)]="actionFilter" (ngModelChange)="reload()" />

      <div class="dm-card table-wrap">
        <table>
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Result</th></tr></thead>
          <tbody>
            @for (log of logs; track log.id) {
              <tr>
                <td>{{ log.createdAtUtc | date:'medium' }}</td>
                <td>{{ log.userEmail ?? 'anonymous' }}</td>
                <td>{{ log.action }}</td>
                <td>{{ log.entityType }} {{ log.entityId ? '#' + log.entityId.substring(0,8) : '' }}</td>
                <td><span [class.ok]="log.isSuccess" [class.fail]="!log.isSuccess">{{ log.isSuccess ? 'Success' : 'Failed' }}</span></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 40px 0 80px; }
    .admin-tabs { display: flex; gap: 8px; margin-bottom: 26px; border-bottom: 1px solid var(--dm-border); flex-wrap: wrap; }
    .admin-tabs a { padding: 10px 14px; color: var(--dm-text-muted); text-decoration: none; font-size: 0.9rem; border-bottom: 2px solid transparent; }
    .admin-tabs a.active { color: var(--dm-text); border-color: var(--dm-primary); }
    .filter { max-width: 320px; margin-bottom: 16px; }
    .table-wrap { overflow-x: auto; padding: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--dm-border); white-space: nowrap; }
    th { color: var(--dm-text-muted); font-weight: 600; }
    .ok { color: var(--dm-success); }
    .fail { color: var(--dm-danger); }
  `]
})
export class AdminAuditsComponent implements OnInit {
  logs: any[] = [];
  actionFilter = '';

  constructor(private adminService: AdminService) {}
  ngOnInit() { this.reload(); }
  reload() { this.adminService.getAuditLogs({ action: this.actionFilter }).subscribe(res => this.logs = res.items); }
}
