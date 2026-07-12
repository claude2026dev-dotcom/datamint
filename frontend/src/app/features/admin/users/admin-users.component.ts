import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="page-head">
      <div>
        <h1>Users</h1>
        <p class="muted">{{ loading ? 'Loading…' : total + ' total' }}</p>
      </div>
    </div>

    <div class="view-tabs">
      <button class="view-tab" [class.active]="viewMode === 'active'" (click)="setViewMode('active')">Users</button>
      <button class="view-tab" [class.active]="viewMode === 'deactivated'" (click)="setViewMode('deactivated')">
        Deactivated <span class="tab-hint">reactivate within {{ graceDays }} days</span>
      </button>
    </div>

    <div class="filter-bar dm-card">
      <div class="search-wrap">
        <app-icon name="search" [size]="15" class="search-icon" />
        <input class="dm-input" placeholder="Search by email or name…" [(ngModel)]="search" (ngModelChange)="onFilterChange()" />
      </div>
      <select class="dm-input" [(ngModel)]="role" (ngModelChange)="reload()">
        <option value="">All roles</option>
        <option value="User">User</option>
        <option value="Admin">Admin</option>
      </select>
      @if (viewMode === 'active') {
        <select class="dm-input" [(ngModel)]="isActive" (ngModelChange)="reload()">
          <option [ngValue]="''">All statuses</option>
          <option [ngValue]="true">Active</option>
          <option [ngValue]="false">Disabled</option>
        </select>
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
          <thead>
            @if (viewMode === 'active') {
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
            } @else {
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Deactivated on</th>
                <th>Time left</th>
                <th class="actions-col">Actions</th>
              </tr>
            }
          </thead>
          <tbody>
            @if (loading) {
              @for (i of [1,2,3,4,5]; track i) {
                <tr class="skeleton-row"><td [attr.colspan]="viewMode === 'active' ? 8 : 6"><div class="skeleton"></div></td></tr>
              }
            } @else if (users.length === 0) {
              <tr><td [attr.colspan]="viewMode === 'active' ? 8 : 6" class="empty-cell">
                {{ viewMode === 'active' ? 'No users match these filters.' : 'No deactivated accounts right now.' }}
              </td></tr>
            } @else if (viewMode === 'active') {
              @for (u of users; track u.id) {
                <tr>
                  <td data-label="Email">
                    <div class="user-cell">
                      <span class="avatar" [style.background]="avatarColor(u)">{{ initials(u) }}</span>
                      <span>{{ u.email }}</span>
                      @if (u.id === myId) { <span class="you-badge">you</span> }
                      @if (u.isSuperAdmin) { <span class="you-badge super-badge" title="Can't be disabled, demoted, or deleted"><app-icon name="shield" [size]="11" /> super admin</span> }
                    </div>
                  </td>
                  <td data-label="Name">
                    @if (editingId === u.id) {
                      <input class="dm-input small-input" [(ngModel)]="editDisplayName" placeholder="Display name" />
                    } @else {
                      {{ u.displayName || '—' }}
                    }
                  </td>
                  <td data-label="Role">
                    @if (editingId === u.id) {
                      <select class="dm-input small-input" [(ngModel)]="editRole" [disabled]="u.id === myId || u.isSuperAdmin">
                        <option value="User">User</option>
                        <option value="Admin">Admin</option>
                      </select>
                    } @else {
                      <span class="badge" [class.badge-admin]="u.role === 'Admin'">{{ u.role }}</span>
                    }
                  </td>
                  <td data-label="Plan">{{ u.currentPlan ?? 'Free' }}</td>
                  <td data-label="Status"><span class="badge" [class.badge-ok]="u.isActive" [class.badge-fail]="!u.isActive">{{ u.isActive ? 'Active' : 'Disabled' }}</span></td>
                  <td class="nowrap" data-label="Joined">{{ u.createdAtUtc | date:'mediumDate' }}</td>
                  <td class="nowrap" data-label="Last login">{{ u.lastLoginAtUtc ? (u.lastLoginAtUtc | date:'medium') : '—' }}</td>
                  <td class="actions-col" data-label="Actions">
                    @if (editingId === u.id) {
                      <button class="dm-btn dm-btn-primary tiny" (click)="saveEdit(u)">Save</button>
                      <button class="dm-btn dm-btn-ghost tiny" (click)="cancelEdit()">Cancel</button>
                    } @else {
                      <button class="icon-btn" title="Edit" (click)="startEdit(u)"><app-icon name="edit" [size]="16" /></button>
                      <button class="icon-btn" [disabled]="!u.hasPassword || resettingId === u.id"
                              [title]="u.hasPassword ? 'Send password reset link' : 'Signs in with Google — no password to reset'"
                              (click)="sendPasswordReset(u)"><app-icon name="key" [size]="16" /></button>
                      <button class="icon-btn" [class.warning]="u.isActive" [disabled]="u.id === myId || u.isSuperAdmin"
                              [title]="u.isSuperAdmin ? 'The super admin account cannot be disabled' : (u.isActive ? 'Disable this account' : 'Re-enable this account')" (click)="toggle(u)">
                        <app-icon [name]="u.isActive ? 'pause' : 'play'" [size]="16" />
                      </button>
                      <button class="icon-btn danger" [disabled]="u.id === myId || u.isSuperAdmin"
                              [title]="u.isSuperAdmin ? 'The super admin account cannot be deleted' : 'Deactivate'" (click)="remove(u)"><app-icon name="trash" [size]="16" /></button>
                    }
                  </td>
                </tr>
              }
            } @else {
              @for (u of users; track u.id) {
                <tr>
                  <td data-label="Email">
                    <div class="user-cell">
                      <span class="avatar" [style.background]="avatarColor(u)">{{ initials(u) }}</span>
                      <span>{{ u.email }}</span>
                    </div>
                  </td>
                  <td data-label="Name">{{ u.displayName || '—' }}</td>
                  <td data-label="Role"><span class="badge" [class.badge-admin]="u.role === 'Admin'">{{ u.role }}</span></td>
                  <td class="nowrap" data-label="Deactivated on">{{ u.deactivatedAtUtc ? (u.deactivatedAtUtc | date:'mediumDate') : '—' }}</td>
                  <td class="nowrap" data-label="Time left">
                    @if (u.daysUntilPurge === null || u.daysUntilPurge === undefined) {
                      —
                    } @else if (u.daysUntilPurge <= 0) {
                      <span class="badge badge-fail">Purging soon</span>
                    } @else {
                      <span class="badge" [class.badge-fail]="u.daysUntilPurge <= 5">{{ u.daysUntilPurge }} day{{ u.daysUntilPurge === 1 ? '' : 's' }} left</span>
                    }
                  </td>
                  <td class="actions-col" data-label="Actions">
                    <button class="dm-btn dm-btn-primary tiny" [disabled]="reactivatingId === u.id" (click)="reactivate(u)">
                      {{ reactivatingId === u.id ? 'Reactivating…' : 'Reactivate' }}
                    </button>
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

    .view-tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid var(--dm-border); }
    .view-tab {
      background: none; border: none; padding: 10px 4px; margin-right: 20px; font-size: 0.88rem; font-weight: 600;
      color: var(--dm-text-muted); cursor: pointer; border-bottom: 2px solid transparent; display: flex; align-items: center; gap: 8px;
    }
    .view-tab.active { color: var(--dm-text); border-bottom-color: var(--dm-primary); }
    .tab-hint { font-size: 0.72rem; font-weight: 500; color: var(--dm-text-muted); }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); margin-bottom: 24px; }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }

    .filter-bar { display: flex; gap: 10px; padding: 14px 16px; margin-bottom: 18px; flex-wrap: wrap; }
    .search-wrap { position: relative; flex: 1 1 240px; min-width: 180px; }
    .search-wrap .dm-input { padding-left: 34px; }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dm-text-muted); pointer-events: none; }
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

    .user-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .user-cell span:not(.you-badge) { word-break: break-all; }
    .avatar { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; color: #fff; font-size: 0.68rem; font-weight: 700; flex-shrink: 0; }
    .you-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; padding: 2px 6px; border-radius: 10px; background: var(--dm-border); color: var(--dm-text-muted); white-space: nowrap; }
    .super-badge { background: rgba(124, 58, 237, 0.15); color: #a78bfa; }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; background: rgba(127,127,127,0.15); color: var(--dm-text-muted); }
    .badge-admin { background: rgba(124, 58, 237, 0.15); color: #a78bfa; }
    .badge-ok { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }

    .actions-col { display: flex; gap: 2px; align-items: center; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; background: none; border: 1px solid transparent; border-radius: 8px; padding: 0; cursor: pointer; color: var(--dm-text-muted); transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
    .icon-btn:hover:not(:disabled) { color: var(--dm-text); background: var(--dm-bg-elevated); border-color: var(--dm-border); }
    .icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .icon-btn.danger { color: var(--dm-danger); opacity: 0.85; }
    .icon-btn.danger:hover:not(:disabled) { color: var(--dm-danger); opacity: 1; background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.3); }
    .icon-btn.warning { color: var(--dm-warning); opacity: 0.85; }
    .icon-btn.warning:hover:not(:disabled) { color: var(--dm-warning); opacity: 1; background: rgba(251,191,36,0.15); border-color: rgba(251,191,36,0.4); }
    .tiny { padding: 6px 12px; font-size: 0.78rem; }
    .small-input { padding: 6px 8px; font-size: 0.82rem; min-width: 110px; }

    .pagination { display: flex; align-items: center; gap: 18px; margin-top: 16px; flex-wrap: wrap; justify-content: space-between; }
    .pager-controls { display: flex; align-items: center; gap: 14px; }
    .page-size { max-width: 120px; }
    @media (max-width: 700px) {
      .filter-bar { flex-direction: column; }
      /* .search-wrap's flex: 1 1 240px was sized for the row layout above - in a
         column flex container, flex-basis applies to HEIGHT not width, so left
         un-overridden it turned the search box into a ~240px-tall empty block. */
      .filter-bar select.dm-input, .search-wrap { flex: 1 1 auto; }
      .pagination { flex-direction: column; align-items: flex-start; }

      /* Reflow the table into a stack of cards instead of a horizontally-scrolling
         grid - each row becomes its own bordered block, each cell becomes a labeled
         line inside it. Every <td> keeps its data-label attribute (set in the
         template) and a ::before pseudo-element renders it as a mini-header. */
      .table-wrap { overflow-x: visible; padding: 0; }
      table, thead, tbody, th, tr, td { display: block; width: 100%; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
      tbody tr {
        border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm);
        margin-bottom: 12px; padding: 6px 0; background: var(--dm-bg-elevated);
      }
      tbody tr.skeleton-row { border: none; background: none; padding: 0; }
      td {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 9px 14px; border-bottom: 1px solid var(--dm-border); white-space: normal; text-align: right;
      }
      td:last-child { border-bottom: none; }
      td::before {
        content: attr(data-label); font-weight: 600; font-size: 0.72rem; color: var(--dm-text-muted);
        text-transform: uppercase; letter-spacing: 0.04em; text-align: left; flex-shrink: 0;
      }
      .actions-col { flex-wrap: wrap; }
      .actions-col::before { align-self: center; }
    }
  `]
})
export class AdminUsersComponent implements OnInit, OnDestroy {
  users: any[] = [];
  loading = true;
  error = '';

  viewMode: 'active' | 'deactivated' = 'active';
  graceDays = 30;

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
  reactivatingId: string | null = null;

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

  setViewMode(mode: 'active' | 'deactivated') {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.page = 1;
    this.sortBy = '';
    this.reload();
  }

  reload() {
    this.loading = true;
    this.error = '';
    this.adminService.getUsers({
      page: this.page, pageSize: this.pageSize, search: this.search,
      role: this.role, isActive: this.viewMode === 'active' && this.isActive !== '' ? this.isActive : undefined,
      sortBy: this.sortBy, sortDir: this.sortDir, includeDeactivated: this.viewMode === 'deactivated'
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

  async toggle(u: any) {
    if (u.isActive) {
      // Disabling immediately blocks the user from signing in and emails them
      // about it — worth a confirmation, unlike re-enabling which is low-risk.
      const confirmed = await this.confirmDialog.ask({
        title: 'Disable this user?',
        message: `${u.email} won't be able to sign in until an admin re-enables their account. They'll be notified by email.`,
        confirmLabel: 'Disable user',
        danger: true
      });
      if (!confirmed) return;
    }

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
      title: 'Deactivate this user?',
      message: `${u.email} will be signed out everywhere, any paid subscription cancelled (their free trial, if any, is untouched), and their account deactivated. ` +
        `Their data is kept for ${this.graceDays} days - you (or they) can reactivate it from the Deactivated tab within that window. After that it's permanently erased.`,
      confirmLabel: 'Deactivate user',
      danger: true
    });
    if (!confirmed) return;

    this.adminService.deleteUser(u.id).subscribe({
      next: () => {
        this.users = this.users.filter(x => x.id !== u.id);
        this.total--;
        this.toast.success('User deactivated.');
        if (this.users.length === 0 && this.page > 1) { this.page--; this.reload(); }
      },
      error: err => this.toast.error(err?.error?.message || 'Could not deactivate that user.')
    });
  }

  reactivate(u: any) {
    this.reactivatingId = u.id;
    this.adminService.reactivateUser(u.id).subscribe({
      next: () => {
        this.reactivatingId = null;
        this.users = this.users.filter(x => x.id !== u.id);
        this.total--;
        this.toast.success(`${u.email} has been reactivated.`);
        if (this.users.length === 0 && this.page > 1) { this.page--; this.reload(); }
      },
      error: err => { this.reactivatingId = null; this.toast.error(err?.error?.message || 'Could not reactivate that user.'); }
    });
  }
}
