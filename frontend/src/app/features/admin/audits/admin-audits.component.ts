import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { formatIpAddress, describeDevice } from '../../../core/utils/request-context.util';

@Component({
  selector: 'app-admin-audits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>Audit trail</h1>
        <p class="muted">{{ loading ? 'Loading…' : total + ' total' }}</p>
      </div>
    </div>

    <div class="filter-bar dm-card">
      <label class="filter-field">
        <span class="filter-label">Action</span>
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input class="dm-input" placeholder="e.g. Auth.Login" [(ngModel)]="actionFilter" (ngModelChange)="onFilterChange()" />
        </div>
      </label>
      <label class="filter-field">
        <span class="filter-label">User email</span>
        <div class="search-wrap">
          <span class="search-icon">👤</span>
          <input class="dm-input" placeholder="Contains…" [(ngModel)]="userEmailFilter" (ngModelChange)="onFilterChange()" />
        </div>
      </label>
      <label class="filter-field">
        <span class="filter-label">Result</span>
        <select class="dm-input" [(ngModel)]="isSuccess" (ngModelChange)="reload()">
          <option [ngValue]="''">All results</option>
          <option [ngValue]="true">Success</option>
          <option [ngValue]="false">Failed</option>
        </select>
      </label>
      <label class="filter-field">
        <span class="filter-label">From</span>
        <input class="dm-input date-input" type="date" [(ngModel)]="fromDate" (ngModelChange)="reload()" />
      </label>
      <label class="filter-field">
        <span class="filter-label">To</span>
        <input class="dm-input date-input" type="date" [(ngModel)]="toDate" (ngModelChange)="reload()" />
      </label>
      <label class="filter-field">
        <span class="filter-label">Sort</span>
        <button class="dm-btn dm-btn-ghost tiny" (click)="toggleSortDir()">{{ sortDir === 'desc' ? '▼ Newest' : '▲ Oldest' }}</button>
      </label>
      <button class="dm-btn dm-btn-ghost tiny clear-btn" (click)="clearFilters()">Clear filters</button>
    </div>

    <div class="category-chips">
      @for (cat of categories; track cat.key) {
        <button class="chip" [class.active]="categoryFilter === cat.key" (click)="toggleCategory(cat.key)">{{ cat.label }}</button>
      }
    </div>

    @if (error) {
      <div class="dm-card error-banner">
        <p>{{ error }}</p>
        <button class="dm-btn dm-btn-ghost" (click)="reload()">Retry</button>
      </div>
    } @else {
      <div class="dm-card table-wrap">
        <table>
          <thead><tr><th></th><th>When</th><th>User</th><th>Category</th><th>Action</th><th>Entity</th><th>IP</th><th>Result</th></tr></thead>
          <tbody>
            @if (loading) {
              @for (i of [1,2,3,4,5]; track i) {
                <tr class="skeleton-row"><td colspan="8"><div class="skeleton"></div></td></tr>
              }
            } @else if (visibleLogs.length === 0) {
              <tr><td colspan="8" class="empty-cell">No audit log entries match this filter.</td></tr>
            } @else {
              @for (log of visibleLogs; track log.id) {
                <tr class="log-row" (click)="toggleExpand(log.id)">
                  <td class="chevron">{{ expandedId === log.id ? '▾' : '▸' }}</td>
                  <td class="nowrap">{{ log.createdAtUtc | date:'medium' }}</td>
                  <td>
                    @if (log.userEmail) {
                      {{ log.userEmail }}
                    } @else {
                      <span class="anon-badge" title="No signed-in user was attached to this event — e.g. a failed login attempt, or an action taken before signing in.">Anonymous</span>
                    }
                  </td>
                  <td><span class="badge" [style.background]="categoryColor(log.action).bg" [style.color]="categoryColor(log.action).fg">{{ categoryOf(log.action) }}</span></td>
                  <td>{{ log.action }}</td>
                  <td>{{ log.entityType }} {{ log.entityId ? '#' + log.entityId.substring(0,8) : '' }}</td>
                  <td class="muted">{{ formatIp(log.ipAddress) }}</td>
                  <td><span class="badge" [class.badge-ok]="log.isSuccess" [class.badge-fail]="!log.isSuccess">{{ log.isSuccess ? 'Success' : 'Failed' }}</span></td>
                </tr>
                @if (expandedId === log.id) {
                  <tr class="detail-row">
                    <td colspan="8">
                      <div class="detail-panel">
                        <div class="detail-item">
                          <span class="detail-label">Changes</span>
                          @if (log.details) {
                            <pre class="detail-json">{{ formatDetails(log.details) }}</pre>
                          } @else {
                            <span class="muted">No additional detail recorded.</span>
                          }
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Device</span>
                          <span class="detail-ua">{{ describeDevice(log.userAgent) }}</span>
                          @if (log.userAgent) { <span class="detail-ua-raw">{{ log.userAgent }}</span> }
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            }
          </tbody>
        </table>
      </div>

      @if (!loading && visibleLogs.length > 0) {
        <div class="pagination">
          <span class="muted">Showing {{ rangeStart }}–{{ rangeEnd }} of {{ total }}</span>
          <div class="pager-controls">
            <button class="dm-btn dm-btn-ghost tiny" [disabled]="page <= 1" (click)="goToPage(page - 1)">← Prev</button>
            <span class="muted">Page {{ page }} of {{ totalPages }}</span>
            <button class="dm-btn dm-btn-ghost tiny" [disabled]="page >= totalPages" (click)="goToPage(page + 1)">Next →</button>
          </div>
          <select class="dm-input page-size" [(ngModel)]="pageSize" (ngModelChange)="onPageSizeChange()">
            <option [ngValue]="25">25 / page</option>
            <option [ngValue]="50">50 / page</option>
            <option [ngValue]="100">100 / page</option>
          </select>
        </div>
      }
    }
  `,
  styles: [`
    .page-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
    .muted { color: var(--dm-text-muted); font-size: 0.88rem; margin: 2px 0 0; }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }

    .filter-bar { display: flex; gap: 14px; padding: 16px; margin-bottom: 12px; flex-wrap: wrap; align-items: flex-end; }
    .filter-field { display: flex; flex-direction: column; gap: 5px; flex: 1 1 160px; min-width: 140px; }
    .filter-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); font-weight: 700; }
    .search-wrap { position: relative; }
    .search-wrap .dm-input { padding-left: 32px; }
    .search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); font-size: 0.8rem; opacity: 0.6; }
    .date-input { min-width: 0; }
    .tiny { padding: 8px 12px; font-size: 0.8rem; white-space: nowrap; }
    .clear-btn { align-self: flex-end; }

    .category-chips { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
    .chip { border: 1px solid var(--dm-border); background: var(--dm-surface); color: var(--dm-text-muted); border-radius: 20px; padding: 6px 14px; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
    .chip:hover { color: var(--dm-text); }
    .chip.active { background: var(--dm-primary); color: #fff; border-color: var(--dm-primary); }

    .table-wrap { overflow-x: auto; padding: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 11px 13px; border-bottom: 1px solid var(--dm-border); white-space: nowrap; }
    th { color: var(--dm-text-muted); font-weight: 600; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .log-row { cursor: pointer; }
    .log-row:hover { background: var(--dm-surface-hover); }
    .chevron { color: var(--dm-text-muted); width: 18px; }
    .nowrap { white-space: nowrap; }
    .empty-cell { text-align: center; color: var(--dm-text-muted); padding: 40px 12px; white-space: normal; }

    .anon-badge { color: var(--dm-text-muted); border-bottom: 1px dashed var(--dm-text-muted); cursor: help; font-style: italic; }

    .skeleton-row td { padding: 8px 14px; }
    .skeleton { height: 32px; border-radius: 6px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .detail-row td { padding: 0; border-bottom: 1px solid var(--dm-border); }
    .detail-panel { display: flex; gap: 28px; padding: 16px 20px; background: var(--dm-bg-elevated); white-space: normal; flex-wrap: wrap; }
    .detail-item { display: flex; flex-direction: column; gap: 6px; min-width: 220px; flex: 1; }
    .detail-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); font-weight: 700; }
    .detail-json { margin: 0; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.78rem; background: var(--dm-surface); border: 1px solid var(--dm-border); border-radius: 8px; padding: 10px 12px; white-space: pre-wrap; word-break: break-word; max-width: 480px; }
    .detail-ua { font-size: 0.85rem; color: var(--dm-text); font-weight: 600; }
    .detail-ua-raw { display: block; font-size: 0.72rem; color: var(--dm-text-muted); word-break: break-word; margin-top: 2px; }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; }
    .badge-ok { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }

    .pagination { display: flex; align-items: center; gap: 18px; margin-top: 16px; flex-wrap: wrap; justify-content: space-between; }
    .pager-controls { display: flex; align-items: center; gap: 14px; }
    .page-size { max-width: 120px; }
    @media (max-width: 700px) {
      .filter-bar { flex-direction: column; align-items: stretch; }
      .filter-field { flex: 1 1 auto; }
      .clear-btn { align-self: stretch; }
      .pagination { flex-direction: column; align-items: flex-start; }
    }
  `]
})
export class AdminAuditsComponent implements OnInit, OnDestroy {
  logs: any[] = [];
  loading = true;
  error = '';

  actionFilter = '';
  userEmailFilter = '';
  isSuccess: '' | boolean = '';
  fromDate = '';
  toDate = '';
  sortDir: 'asc' | 'desc' = 'desc';
  categoryFilter = '';
  expandedId: string | null = null;

  page = 1;
  pageSize = 25;
  total = 0;

  categories = [
    { key: 'Auth', label: 'Auth' },
    { key: 'Document', label: 'Documents' },
    { key: 'Subscription', label: 'Subscriptions' },
    { key: 'Admin', label: 'Admin' },
  ];

  private categoryColors: Record<string, { bg: string; fg: string }> = {
    Auth: { bg: 'rgba(34,211,238,0.15)', fg: '#22d3ee' },
    Document: { bg: 'rgba(52,211,153,0.15)', fg: '#34d399' },
    Subscription: { bg: 'rgba(251,191,36,0.15)', fg: '#fbbf24' },
    Admin: { bg: 'rgba(167,139,250,0.15)', fg: '#a78bfa' },
  };

  private filterDebounce: ReturnType<typeof setTimeout> | undefined;

  get totalPages() { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get rangeStart() { return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1; }
  get rangeEnd() { return Math.min(this.page * this.pageSize, this.total); }
  get visibleLogs() {
    if (!this.categoryFilter) return this.logs;
    return this.logs.filter(l => this.categoryOf(l.action) === this.categoryFilter);
  }

  constructor(private adminService: AdminService) {}
  ngOnInit() { this.reload(); }
  ngOnDestroy() { clearTimeout(this.filterDebounce); }

  onFilterChange() {
    clearTimeout(this.filterDebounce);
    this.filterDebounce = setTimeout(() => this.reload(), 350);
  }

  onPageSizeChange() { this.page = 1; this.reload(); }

  toggleSortDir() { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; this.reload(); }

  toggleCategory(key: string) { this.categoryFilter = this.categoryFilter === key ? '' : key; }

  toggleExpand(id: string) { this.expandedId = this.expandedId === id ? null : id; }

  categoryOf(action: string): string { return action.split('.')[0] || 'Other'; }

  categoryColor(action: string) { return this.categoryColors[this.categoryOf(action)] ?? { bg: 'rgba(127,127,127,0.15)', fg: 'var(--dm-text-muted)' }; }

  formatDetails(details: string): string {
    try { return JSON.stringify(JSON.parse(details), null, 2); }
    catch { return details; }
  }

  formatIp(ip: string | null | undefined): string { return formatIpAddress(ip); }
  describeDevice(userAgent: string | null | undefined): string { return describeDevice(userAgent); }

  clearFilters() {
    this.actionFilter = ''; this.userEmailFilter = ''; this.isSuccess = '';
    this.fromDate = ''; this.toDate = ''; this.categoryFilter = ''; this.page = 1;
    this.reload();
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.reload();
  }

  reload() {
    this.loading = true;
    this.error = '';
    this.expandedId = null;
    this.adminService.getAuditLogs({
      page: this.page, pageSize: this.pageSize, action: this.actionFilter,
      userEmail: this.userEmailFilter, isSuccess: this.isSuccess === '' ? undefined : this.isSuccess,
      fromUtc: this.fromDate ? new Date(this.fromDate + 'T00:00:00Z').toISOString() : undefined,
      toUtc: this.toDate ? new Date(this.toDate + 'T23:59:59Z').toISOString() : undefined,
      sortDir: this.sortDir
    }).subscribe({
      next: res => { this.logs = res.items; this.total = res.total; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load audit logs. Please try again.'; }
    });
  }
}
