import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>Users</h1>
        <p class="muted">{{ loading ? 'Loading…' : total + ' total' }}</p>
      </div>
    </div>

    <div class="filter-bar dm-card">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input class="dm-input" placeholder="Search by email or name…" [(ngModel)]="search" (ngModelChange)="onFilterChange()" />
      </div>
      <select class="dm-input" [(ngModel)]="role" (ngModelChange)="reload()">
        <option value="">All roles</option>
        <option value="User">User</option>
        <option value="Admin">Admin</option>
      </select>
      <select class="dm-input" [(ngModel)]="isActive" (ngModelChange)="reload()">
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
          <thead>
            <tr>
              <th (click)="setSort('email')" class="sortable">Email {{ sortArrow('email') }}</th>
              <th (click)="setSort('displayName')" class="sortable">Name {{ sortArrow('displayName') }}</th>
              <th (click)="setSort('role')" class="sortable">Role {{ sortArrow('role') }}</th>
              <th>Plan</th>
              <th>Status</th>
              <th (click)="setSort('')" class="sortable">Joined {{ sortArrow('') }}</th>
              <th (click)="setSort('lastLogin')" class="sortable">Last login {{ sortArrow('lastLogin') }}</th>
              <th class="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @if (loading) {
              @for (i of [1,2,3,4,5]; track i) {
                <tr class="skeleton-row"><td colspan="8"><div class="skeleton"></div></td></tr>
              }
            } @else if (users.length === 0) {
              <tr><td colspan="8" class="empty-cell">No users match these filters.</td></tr>
            } @else {
              @for (u of users; track u.id) {
                <tr>
                  <td>
                    <div class="user-cell">
                      <span class="avatar" [style.background]="avatarColor(u)">{{ initials(u) }}</span>
                      <span>{{ u.email }}</span>
                      @if (u.id === myId) { <span class="you-badge">you</span> }
                    </div>
                  </td>
                  <td>
                    @if (editingId === u.id) {
                      <input class="dm-input small-input" [(ngModel)]="editDisplayName" placeholder="Display name" />
                    } @else {
                      {{ u.displayName || '—' }}
                    }
                  </td>
                  <td>
                    @if (editingId === u.id) {
                      <select class="dm-input small-input" [(ngModel)]="editRole" [disabled]="u.id === myId">
                        <option value="User">User</option>
                        <option value="Admin">Admin</option>
                      </select>
                    } @else {
                      <span class="badge" [class.badge-admin]="u.role === 'Admin'">{{ u.role }}</span>
                    }
                  </td>
                  <td>{{ u.currentPlan ?? 'Free' }}</td>
                  <td><span class="badge" [class.badge-ok]="u.isActive" [class.badge-fail]="!u.isActive">{{ u.isActive ? 'Active' : 'Disabled' }}</span></td>
                  <td class="nowrap">{{ u.createdAtUtc | date:'mediumDate' }}</td>
                  <td class="nowrap">{{ u.lastLoginAtUtc ? (u.lastLoginAtUtc | date:'medium') : '—' }}</td>
                  <td class="actions-col">
                    @if (editingId === u.id) {
                      <button class="dm-btn dm-btn-primary tiny" (click)="saveEdit(u)">Save</button>
                      <button class="dm-btn dm-btn-ghost tiny" (click)="cancelEdit()">Cancel</button>
                    } @else {
                      <button class="icon-btn" title="Edit" (click)="startEdit(u)">✏️</button>
                      <button class="icon-btn" [disabled]="!u.hasPassword || resettingId === u.id"
                              [title]="u.hasPassword ? 'Send password reset link' : 'Signs in with Google — no password to reset'"
                              (click)="sendPasswordReset(u)">🔑</button>
                      <button class="icon-btn" [disabled]="u.id === myId" [title]="u.isActive ? 'Disable' : 'Enable'" (click)="toggle(u)">{{ u.isActive ? '⏸' : '▶️' }}</button>
                      <button class="icon-btn danger" [disabled]="u.id === myId" title="Delete" (click)="remove(u)">🗑</button>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      @if (!loading && users.length > 0) {
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
            <option [ngValue]="100">100 / page</option>
          </select>
        </div>
      }
    }
  `,
  styles: [`
    .page-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
    .muted { color: var(--dm-text-muted); font-size: 0.88rem; margin: 2px 0 0; }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); margin-bottom: 24px; }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }

    .filter-bar { display: flex; gap: 10px; padding: 14px 16px; margin-bottom: 18px; flex-wrap: wrap; }
    .search-wrap { position: relative; flex: 1 1 240px; min-width: 180px; }
    .search-wrap .dm-input { padding-left: 34px; }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 0.85rem; opacity: 0.6; }
    .filter-bar select.dm-input { flex: 0 1 160px; }

    .table-wrap { overflow-x: auto; padding: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--dm-border); white-space: nowrap; }
    th { color: var(--dm-text-muted); font-weight: 600; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; user-select: none; }
    th.sortable { cursor: pointer; }
    th.sortable:hover { color: var(--dm-text); }
    tbody tr:hover { background: var(--dm-surface-hover); }
    .nowrap { white-space: nowrap; }
    .empty-cell { text-align: center; color: var(--dm-text-muted); padding: 40px 12px; white-space: normal; }

    .skeleton-row td { padding: 8px 14px; }
    .skeleton { height: 32px; border-radius: 6px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .user-cell { display: flex; align-items: center; gap: 10px; }
    .avatar { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; color: #fff; font-size: 0.68rem; font-weight: 700; flex-shrink: 0; }
    .you-badge { font-size: 0.68rem; padding: 2px 6px; border-radius: 10px; background: var(--dm-border); color: var(--dm-text-muted); }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; background: rgba(127,127,127,0.15); color: var(--dm-text-muted); }
    .badge-admin { background: rgba(124, 58, 237, 0.15); color: #a78bfa; }
    .badge-ok { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }

    .actions-col { display: flex; gap: 4px; align-items: center; }
    .icon-btn { background: none; border: 1px solid transparent; border-radius: 8px; padding: 6px 8px; cursor: pointer; font-size: 0.9rem; line-height: 1; transition: background 0.15s ease, border-color 0.15s ease; }
    .icon-btn:hover:not(:disabled) { background: var(--dm-bg-elevated); border-color: var(--dm-border); }
    .icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .icon-btn.danger:hover:not(:disabled) { background: rgba(248,113,113,0.12); }
    .tiny { padding: 6px 12px; font-size: 0.78rem; }
    .small-input { padding: 6px 8px; font-size: 0.82rem; min-width: 110px; }

    .pagination { display: flex; align-items: center; gap: 18px; margin-top: 16px; flex-wrap: wrap; justify-content: space-between; }
    .pager-controls { display: flex; align-items: center; gap: 14px; }
    .page-size { max-width: 120px; }
    @media (max-width: 700px) {
      .filter-bar { flex-direction: column; }
      .filter-bar select.dm-input { flex: 1 1 auto; }
      .pagination { flex-direction: column; align-items: flex-start; }
    }
  `]
})
export class AdminUsersComponent implements OnInit, OnDestroy {
  users: any[] = [];
  loading = true;
  error = '';

  search = '';
  role = '';
  isActive: '' | boolean = '';
  sortBy = '';
  sortDir: 'asc' | 'desc' = 'desc';

  page = 1;
  pageSize = 25;
  total = 0;

  editingId: string | null = null;
  editDisplayName = '';
  editRole = 'User';
  resettingId: string | null = null;

  private searchDebounce: ReturnType<typeof setTimeout> | undefined;
  private readonly avatarPalette = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#06b6d4', '#a855f7', '#eab308'];

  get myId() { return this.auth.currentUser()?.id ?? null; }
  get totalPages() { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get rangeStart() { return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1; }
  get rangeEnd() { return Math.min(this.page * this.pageSize, this.total); }

  constructor(
    private adminService: AdminService,
    private auth: AuthService,
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

  setSort(field: string) {
    if (this.sortBy === field) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else { this.sortBy = field; this.sortDir = 'asc'; }
    this.reload();
  }

  sortArrow(field: string) {
    if (this.sortBy !== field) return '';
    return this.sortDir === 'asc' ? '▲' : '▼';
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.reload();
  }

  reload() {
    this.loading = true;
    this.error = '';
    this.adminService.getUsers({
      page: this.page, pageSize: this.pageSize, search: this.search,
      role: this.role, isActive: this.isActive === '' ? undefined : this.isActive,
      sortBy: this.sortBy, sortDir: this.sortDir
    }).subscribe({
      next: res => { this.users = res.items; this.total = res.total; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load users. Please try again.'; }
    });
  }

  initials(u: any) {
    const source = (u.displayName || u.email || '?').trim();
    return source.slice(0, 2).toUpperCase();
  }

  avatarColor(u: any) {
    let hash = 0;
    for (const ch of u.email) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return this.avatarPalette[hash % this.avatarPalette.length];
  }

  toggle(u: any) {
    this.adminService.toggleUserActive(u.id).subscribe({
      next: res => { u.isActive = res.isActive; this.toast.success(`User ${res.isActive ? 'enabled' : 'disabled'}.`); },
      error: () => this.toast.error('Could not update that user. Please try again.')
    });
  }

  sendPasswordReset(u: any) {
    this.resettingId = u.id;
    this.adminService.sendPasswordReset(u.id).subscribe({
      next: res => { this.resettingId = null; this.toast.success(res.message); },
      error: err => { this.resettingId = null; this.toast.error(err?.error?.message || 'Could not send a password reset link.'); }
    });
  }

  startEdit(u: any) {
    this.editingId = u.id;
    this.editDisplayName = u.displayName || '';
    this.editRole = u.role;
  }

  cancelEdit() { this.editingId = null; }

  saveEdit(u: any) {
    this.adminService.updateUser(u.id, { displayName: this.editDisplayName, role: this.editRole }).subscribe({
      next: res => {
        u.displayName = res.user.displayName;
        u.role = res.user.role;
        this.editingId = null;
        this.toast.success('User updated.');
      },
      error: err => this.toast.error(err?.error?.message || 'Could not update that user.')
    });
  }

  async remove(u: any) {
    const confirmed = await this.confirmDialog.ask({
      title: 'Delete this user?',
      message: `${u.email} will be permanently removed from the active user list. This can't be undone from here.`,
      confirmLabel: 'Delete user',
      danger: true
    });
    if (!confirmed) return;

    this.adminService.deleteUser(u.id).subscribe({
      next: () => {
        this.users = this.users.filter(x => x.id !== u.id);
        this.total--;
        this.toast.success('User deleted.');
        if (this.users.length === 0 && this.page > 1) { this.page--; this.reload(); }
      },
      error: err => this.toast.error(err?.error?.message || 'Could not delete that user.')
    });
  }
}
