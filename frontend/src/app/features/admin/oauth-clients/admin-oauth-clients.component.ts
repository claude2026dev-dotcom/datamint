import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { LoadingHintComponent } from '../../../shared/components/loading-hint/loading-hint.component';
import { OAuthClientListItem } from '../../../core/models/models';

const GRANT_LABELS: Record<string, string> = {
  authorization_code: 'Authorization Code',
  client_credentials: 'Client Credentials',
  refresh_token: 'Refresh Token'
};

@Component({
  selector: 'app-admin-oauth-clients',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, LoadingHintComponent],
  template: `
    <div class="page-head">
      <div>
        <h1>OAuth Clients</h1>
        <p class="muted">{{ loading ? 'Loading…' : total + ' total' }}</p>
      </div>
      <a routerLink="new" class="dm-btn dm-btn-primary">+ New client</a>
    </div>

    <div class="filter-bar dm-card">
      <div class="search-wrap">
        <app-icon name="search" [size]="15" class="search-icon" />
        <input class="dm-input" placeholder="Search by name or client ID…" [(ngModel)]="search" (ngModelChange)="onFilterChange()" />
      </div>
      <select class="dm-input" [(ngModel)]="grantType" (ngModelChange)="reload()">
        <option value="">All grant types</option>
        <option value="authorization_code">Authorization Code</option>
        <option value="client_credentials">Client Credentials</option>
        <option value="refresh_token">Refresh Token</option>
      </select>
      <select class="dm-input" [(ngModel)]="isEnabled" (ngModelChange)="reload()">
        <option [ngValue]="''">All statuses</option>
        <option [ngValue]="true">Active</option>
        <option [ngValue]="false">Disabled</option>
      </select>
    </div>

    @if (error) {
      <div class="dm-card error-banner">
        <p>{{ error }}</p>
        <button class="dm-btn dm-btn-ghost" (click)="reload()">Retry</button>
      </div>
    } @else {
      <div class="dm-card table-wrap">
        <table>
          <thead><tr><th>Client</th><th>Client ID</th><th>Grant types</th><th>Redirect URIs</th><th>Status</th><th>Created</th><th class="actions-col">Actions</th></tr></thead>
          <tbody>
            @if (loading) {
              @for (i of [1,2,3,4,5]; track i) {
                <tr class="skeleton-row"><td colspan="7"><div class="skeleton"></div></td></tr>
              }
            } @else if (clients.length === 0) {
              <tr><td colspan="7" class="empty-cell">
                {{ search || grantType || isEnabled !== '' ? 'No OAuth clients match these filters.' : 'No OAuth clients yet — create one to get started.' }}
              </td></tr>
            } @else {
              @for (c of clients; track c.id) {
                <tr>
                  <td data-label="Client">
                    <div class="client-cell">
                      <span class="avatar">
                        @if (c.logoUrl) { <img [src]="c.logoUrl" alt="" (error)="onLogoError(c)" /> } @else { {{ c.name.slice(0,2).toUpperCase() }} }
                      </span>
                      <div>
                        <div class="client-name">{{ c.name }}</div>
                        <div class="client-type">{{ c.isConfidential ? 'Confidential' : 'Public' }}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Client ID"><code class="client-id" (click)="copy(c.clientId)" title="Click to copy">{{ c.clientId }}</code></td>
                  <td data-label="Grant types">
                    <div class="badge-group">
                      @for (g of c.grantTypes; track g) { <span class="badge">{{ grantLabel(g) }}</span> }
                    </div>
                  </td>
                  <td data-label="Redirect URIs" class="nowrap">{{ c.redirectUriCount }}</td>
                  <td data-label="Status"><span class="badge" [class.badge-ok]="c.isEnabled" [class.badge-fail]="!c.isEnabled">{{ c.isEnabled ? 'Active' : 'Disabled' }}</span></td>
                  <td class="nowrap" data-label="Created">{{ c.createdAtUtc | date:'mediumDate' }}</td>
                  <td class="actions-col" data-label="Actions">
                    <a class="icon-btn" [routerLink]="[c.id]" title="Edit"><app-icon name="edit" [size]="16" /></a>
                    <button class="icon-btn" [class.warning]="c.isEnabled" [title]="c.isEnabled ? 'Disable' : 'Enable'" (click)="toggle(c)">
                      <app-icon [name]="c.isEnabled ? 'pause' : 'play'" [size]="16" />
                    </button>
                    <button class="icon-btn danger" title="Delete" (click)="remove(c)"><app-icon name="trash" [size]="16" /></button>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      <app-loading-hint [loading]="loading" />

      @if (!loading && clients.length > 0) {
        <div class="pagination">
          <span class="muted">Showing {{ rangeStart }}–{{ rangeEnd }} of {{ total }}</span>
          <div class="pager-controls">
            <button class="dm-btn dm-btn-ghost tiny" [disabled]="page <= 1" (click)="goToPage(page - 1)">← Prev</button>
            <span class="muted">Page {{ page }} of {{ totalPages }}</span>
            <button class="dm-btn dm-btn-ghost tiny" [disabled]="page >= totalPages" (click)="goToPage(page + 1)">Next →</button>
          </div>
          <select class="dm-input page-size" [(ngModel)]="pageSize" (ngModelChange)="onPageSizeChange()">
            <option [ngValue]="10">10 / page</option>
            <option [ngValue]="25">25 / page</option>
            <option [ngValue]="50">50 / page</option>
          </select>
        </div>
      }
    }
  `,
  styles: [`
    .page-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .muted { color: var(--dm-text-muted); font-size: 0.88rem; margin: 2px 0 0; }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }

    .filter-bar { display: flex; gap: 10px; padding: 14px 16px; margin-bottom: 18px; flex-wrap: wrap; }
    .search-wrap { position: relative; flex: 1 1 240px; min-width: 180px; }
    .search-wrap .dm-input { padding-left: 34px; }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dm-text-muted); pointer-events: none; }
    .filter-bar select.dm-input { flex: 0 1 180px; }

    .table-wrap { overflow-x: auto; padding: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--dm-border); white-space: nowrap; }
    th { color: var(--dm-text-muted); font-weight: 600; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; }
    tbody tr:hover { background: var(--dm-surface-hover); }
    .nowrap { white-space: nowrap; }
    .empty-cell { text-align: center; color: var(--dm-text-muted); padding: 40px 12px; white-space: normal; }

    .skeleton-row td { padding: 8px 14px; }
    .skeleton { height: 32px; border-radius: 6px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .client-cell { display: flex; align-items: center; gap: 10px; min-width: 0; white-space: normal; }
    .avatar { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: var(--dm-gradient-primary); color: #fff; font-size: 0.7rem; font-weight: 700; flex-shrink: 0; overflow: hidden; }
    .avatar img { width: 100%; height: 100%; object-fit: contain; }
    .client-name { font-weight: 600; }
    .client-type { font-size: 0.75rem; color: var(--dm-text-muted); }
    .client-id { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.78rem; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); border-radius: 6px; padding: 3px 8px; cursor: pointer; }
    .client-id:hover { border-color: var(--dm-primary); }

    .badge-group { display: flex; gap: 4px; flex-wrap: wrap; white-space: normal; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; background: rgba(127,127,127,0.15); color: var(--dm-text-muted); }
    .badge-ok { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }

    .actions-col { display: flex; gap: 2px; align-items: center; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; background: none; border: 1px solid transparent; border-radius: 8px; padding: 0; cursor: pointer; color: var(--dm-text-muted); text-decoration: none; transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
    .icon-btn:hover:not(:disabled) { color: var(--dm-text); background: var(--dm-bg-elevated); border-color: var(--dm-border); }
    .icon-btn.danger { color: var(--dm-danger); opacity: 0.85; }
    .icon-btn.danger:hover { color: var(--dm-danger); opacity: 1; background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.3); }
    .icon-btn.warning { color: var(--dm-warning); opacity: 0.85; }
    .icon-btn.warning:hover { color: var(--dm-warning); opacity: 1; background: rgba(251,191,36,0.15); border-color: rgba(251,191,36,0.4); }
    .tiny { padding: 6px 12px; font-size: 0.78rem; }

    .pagination { display: flex; align-items: center; gap: 18px; margin-top: 16px; flex-wrap: wrap; justify-content: space-between; }
    .pager-controls { display: flex; align-items: center; gap: 14px; }
    .page-size { max-width: 120px; }

    @media (max-width: 760px) {
      .filter-bar { flex-direction: column; }
      .filter-bar select.dm-input, .search-wrap { flex: 1 1 auto; }
      .pagination { flex-direction: column; align-items: flex-start; }

      .table-wrap { overflow-x: visible; padding: 0; }
      table, thead, tbody, th, tr, td { display: block; width: 100%; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
      tbody tr { border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); margin-bottom: 12px; padding: 6px 0; background: var(--dm-bg-elevated); }
      tbody tr.skeleton-row { border: none; background: none; padding: 0; }
      td { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 14px; border-bottom: 1px solid var(--dm-border); white-space: normal; text-align: right; }
      td:last-child { border-bottom: none; }
      td::before { content: attr(data-label); font-weight: 600; font-size: 0.72rem; color: var(--dm-text-muted); text-transform: uppercase; letter-spacing: 0.04em; text-align: left; flex-shrink: 0; }
      .actions-col { flex-wrap: wrap; }
    }
  `]
})
export class AdminOAuthClientsComponent implements OnInit, OnDestroy {
  clients: OAuthClientListItem[] = [];
  loading = true;
  error = '';

  search = '';
  grantType = '';
  isEnabled: '' | boolean = '';

  page = 1;
  pageSize = 25;
  total = 0;

  private searchDebounce: ReturnType<typeof setTimeout> | undefined;

  get totalPages() { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get rangeStart() { return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1; }
  get rangeEnd() { return Math.min(this.page * this.pageSize, this.total); }

  constructor(
    private adminService: AdminService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService
  ) {}

  ngOnInit() { this.reload(); }
  ngOnDestroy() { clearTimeout(this.searchDebounce); }

  onFilterChange() {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.reload(), 350);
  }

  onPageSizeChange() { this.page = 1; this.reload(); }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.reload();
  }

  grantLabel(g: string) { return GRANT_LABELS[g] ?? g; }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => this.toast.success('Copied to clipboard.'));
  }

  onLogoError(c: OAuthClientListItem) { c.logoUrl = null; }

  reload() {
    this.loading = true;
    this.error = '';
    this.adminService.getOAuthClients({
      page: this.page, pageSize: this.pageSize, search: this.search,
      grantType: this.grantType, isEnabled: this.isEnabled === '' ? undefined : this.isEnabled
    }).subscribe({
      next: res => { this.clients = res.items; this.total = res.total; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load OAuth clients. Please try again.'; }
    });
  }

  toggle(c: OAuthClientListItem) {
    this.adminService.toggleOAuthClientActive(c.id).subscribe({
      next: res => { c.isEnabled = res.isEnabled; this.toast.success(`Client ${res.isEnabled ? 'enabled' : 'disabled'}.`); },
      error: () => this.toast.error('Could not update that client. Please try again.')
    });
  }

  async remove(c: OAuthClientListItem) {
    const confirmed = await this.confirmDialog.ask({
      title: 'Delete this OAuth client?',
      message: `"${c.name}" will immediately stop being able to authenticate or refresh tokens. This can't be undone.`,
      confirmLabel: 'Delete client',
      danger: true
    });
    if (!confirmed) return;

    this.adminService.deleteOAuthClient(c.id).subscribe({
      next: () => {
        this.clients = this.clients.filter(x => x.id !== c.id);
        this.total--;
        this.toast.success('OAuth client deleted.');
        if (this.clients.length === 0 && this.page > 1) { this.page--; this.reload(); }
      },
      error: () => this.toast.error('Could not delete that client. Please try again.')
    });
  }
}
