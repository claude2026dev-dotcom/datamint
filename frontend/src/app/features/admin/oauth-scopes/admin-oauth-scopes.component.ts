import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { LoadingHintComponent } from '../../../shared/components/loading-hint/loading-hint.component';
import { OAuthScope } from '../../../core/models/models';

@Component({
  selector: 'app-admin-oauth-scopes',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, LoadingHintComponent],
  template: `
    <div class="page-head">
      <div>
        <h1>Scopes</h1>
        <p class="muted">{{ loading ? 'Loading…' : total + ' total' }}</p>
      </div>
      <button class="dm-btn dm-btn-primary" (click)="showCreate = !showCreate">{{ showCreate ? 'Cancel' : '+ New scope' }}</button>
    </div>

    @if (showCreate) {
      <div class="dm-card create-card">
        <h3>New scope</h3>
        <div class="create-grid">
          <div class="field">
            <label>Name <span class="hint">(e.g. documents.read — used by clients, can't change later)</span></label>
            <input class="dm-input" [(ngModel)]="newScope.name" placeholder="documents.read" />
          </div>
          <div class="field">
            <label>Display name</label>
            <input class="dm-input" [(ngModel)]="newScope.displayName" placeholder="View your documents" />
          </div>
          <div class="field wide">
            <label>Description <span class="optional">(optional)</span></label>
            <input class="dm-input" [(ngModel)]="newScope.description" placeholder="Shown on the consent screen." />
          </div>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" [(ngModel)]="newScope.isDefault" />
          <span>Pre-checked by default when a new client is created</span>
        </label>
        <div class="create-actions">
          <button class="dm-btn dm-btn-primary" [disabled]="creating || !newScope.name.trim() || !newScope.displayName.trim()" (click)="create()">
            {{ creating ? 'Creating…' : 'Create scope' }}
          </button>
        </div>
      </div>
    }

    <div class="filter-bar dm-card">
      <div class="search-wrap">
        <app-icon name="search" [size]="15" class="search-icon" />
        <input class="dm-input" placeholder="Search by name…" [(ngModel)]="search" (ngModelChange)="onFilterChange()" />
      </div>
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
          <thead><tr><th>Name</th><th>Display name</th><th>Description</th><th>Default</th><th>Used by</th><th>Status</th><th class="actions-col">Actions</th></tr></thead>
          <tbody>
            @if (loading) {
              @for (i of [1,2,3]; track i) {
                <tr class="skeleton-row"><td colspan="7"><div class="skeleton"></div></td></tr>
              }
            } @else if (scopes.length === 0) {
              <tr><td colspan="7" class="empty-cell">{{ search || isEnabled !== '' ? 'No scopes match these filters.' : 'No scopes yet — create one to get started.' }}</td></tr>
            } @else {
              @for (s of scopes; track s.id) {
                <tr>
                  <td data-label="Name"><code class="scope-name">{{ s.name }}</code></td>
                  <td data-label="Display name">
                    @if (editingId === s.id) {
                      <input class="dm-input small-input" [(ngModel)]="editDisplayName" />
                    } @else { {{ s.displayName }} }
                  </td>
                  <td data-label="Description" class="desc-cell">
                    @if (editingId === s.id) {
                      <input class="dm-input small-input" [(ngModel)]="editDescription" placeholder="Optional" />
                    } @else { {{ s.description || '—' }} }
                  </td>
                  <td data-label="Default">
                    @if (editingId === s.id) {
                      <input type="checkbox" [(ngModel)]="editIsDefault" />
                    } @else {
                      <span class="badge" [class.badge-ok]="s.isDefault">{{ s.isDefault ? 'Yes' : 'No' }}</span>
                    }
                  </td>
                  <td data-label="Used by" class="nowrap">{{ s.clientCount }} client{{ s.clientCount === 1 ? '' : 's' }}</td>
                  <td data-label="Status"><span class="badge" [class.badge-ok]="s.isEnabled" [class.badge-fail]="!s.isEnabled">{{ s.isEnabled ? 'Active' : 'Disabled' }}</span></td>
                  <td class="actions-col" data-label="Actions">
                    @if (editingId === s.id) {
                      <button class="dm-btn dm-btn-primary tiny" (click)="saveEdit(s)">Save</button>
                      <button class="dm-btn dm-btn-ghost tiny" (click)="cancelEdit()">Cancel</button>
                    } @else {
                      <button class="icon-btn" title="Edit" (click)="startEdit(s)"><app-icon name="edit" [size]="16" /></button>
                      <button class="icon-btn" [class.warning]="s.isEnabled" [title]="s.isEnabled ? 'Disable' : 'Enable'" (click)="toggle(s)">
                        <app-icon [name]="s.isEnabled ? 'pause' : 'play'" [size]="16" />
                      </button>
                      <button class="icon-btn danger" title="Delete" (click)="remove(s)"><app-icon name="trash" [size]="16" /></button>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      <app-loading-hint [loading]="loading" />

      @if (!loading && scopes.length > 0) {
        <div class="pagination">
          <span class="muted">Showing {{ rangeStart }}–{{ rangeEnd }} of {{ total }}</span>
          <div class="pager-controls">
            <button class="dm-btn dm-btn-ghost tiny" [disabled]="page <= 1" (click)="goToPage(page - 1)">← Prev</button>
            <span class="muted">Page {{ page }} of {{ totalPages }}</span>
            <button class="dm-btn dm-btn-ghost tiny" [disabled]="page >= totalPages" (click)="goToPage(page + 1)">Next →</button>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .page-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .muted { color: var(--dm-text-muted); font-size: 0.88rem; margin: 2px 0 0; }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }

    .create-card { padding: 20px; margin-bottom: 18px; }
    .create-card h3 { font-size: 0.95rem; margin: 0 0 14px; }
    .create-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; }
    .field.wide { grid-column: 1 / -1; }
    .field label { display: block; font-size: 0.8rem; color: var(--dm-text-muted); margin-bottom: 6px; }
    .field label .hint { font-weight: 400; font-size: 0.74rem; }
    .optional { font-weight: 400; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; margin: 6px 0 4px; cursor: pointer; }
    .checkbox-row input { accent-color: var(--dm-primary); }
    .create-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
    @media (max-width: 600px) { .create-grid { grid-template-columns: 1fr; } }

    .filter-bar { display: flex; gap: 10px; padding: 14px 16px; margin-bottom: 18px; flex-wrap: wrap; }
    .search-wrap { position: relative; flex: 1 1 240px; min-width: 180px; }
    .search-wrap .dm-input { padding-left: 34px; }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dm-text-muted); pointer-events: none; }
    .filter-bar select.dm-input { flex: 0 1 160px; }

    .table-wrap { overflow-x: auto; padding: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--dm-border); white-space: nowrap; }
    th { color: var(--dm-text-muted); font-weight: 600; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; }
    tbody tr:hover { background: var(--dm-surface-hover); }
    .nowrap { white-space: nowrap; }
    .desc-cell { white-space: normal; max-width: 260px; }
    .empty-cell { text-align: center; color: var(--dm-text-muted); padding: 40px 12px; white-space: normal; }
    .scope-name { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.8rem; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); border-radius: 6px; padding: 3px 8px; }

    .skeleton-row td { padding: 8px 14px; }
    .skeleton { height: 32px; border-radius: 6px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; background: rgba(127,127,127,0.15); color: var(--dm-text-muted); }
    .badge-ok { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }

    .actions-col { display: flex; gap: 2px; align-items: center; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; background: none; border: 1px solid transparent; border-radius: 8px; padding: 0; cursor: pointer; color: var(--dm-text-muted); transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
    .icon-btn:hover:not(:disabled) { color: var(--dm-text); background: var(--dm-bg-elevated); border-color: var(--dm-border); }
    .icon-btn.danger { color: var(--dm-danger); opacity: 0.85; }
    .icon-btn.danger:hover { color: var(--dm-danger); opacity: 1; background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.3); }
    .icon-btn.warning { color: var(--dm-warning); opacity: 0.85; }
    .icon-btn.warning:hover { color: var(--dm-warning); opacity: 1; background: rgba(251,191,36,0.15); border-color: rgba(251,191,36,0.4); }
    .tiny { padding: 6px 12px; font-size: 0.78rem; }
    .small-input { padding: 6px 8px; font-size: 0.82rem; min-width: 120px; }

    .pagination { display: flex; align-items: center; gap: 18px; margin-top: 16px; flex-wrap: wrap; justify-content: space-between; }
    .pager-controls { display: flex; align-items: center; gap: 14px; }

    @media (max-width: 700px) {
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
      .desc-cell { max-width: none; }
    }
  `]
})
export class AdminOAuthScopesComponent implements OnInit, OnDestroy {
  scopes: OAuthScope[] = [];
  loading = true;
  error = '';

  search = '';
  isEnabled: '' | boolean = '';

  page = 1;
  pageSize = 25;
  total = 0;

  showCreate = false;
  creating = false;
  newScope = { name: '', displayName: '', description: '', isDefault: false };

  editingId: string | null = null;
  editDisplayName = '';
  editDescription = '';
  editIsDefault = false;

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

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.reload();
  }

  reload() {
    this.loading = true;
    this.error = '';
    this.adminService.getOAuthScopes({
      page: this.page, pageSize: this.pageSize, search: this.search,
      isEnabled: this.isEnabled === '' ? undefined : this.isEnabled
    }).subscribe({
      next: res => { this.scopes = res.items; this.total = res.total; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load scopes. Please try again.'; }
    });
  }

  create() {
    if (!this.newScope.name.trim() || !this.newScope.displayName.trim()) return;
    this.creating = true;
    this.adminService.createOAuthScope({
      name: this.newScope.name.trim(),
      displayName: this.newScope.displayName.trim(),
      description: this.newScope.description.trim() || undefined,
      isDefault: this.newScope.isDefault
    }).subscribe({
      next: () => {
        this.creating = false;
        this.showCreate = false;
        this.newScope = { name: '', displayName: '', description: '', isDefault: false };
        this.toast.success('Scope created.');
        this.reload();
      },
      error: err => { this.creating = false; this.toast.error(err?.error?.message || 'Could not create that scope.'); }
    });
  }

  startEdit(s: OAuthScope) {
    this.editingId = s.id;
    this.editDisplayName = s.displayName;
    this.editDescription = s.description ?? '';
    this.editIsDefault = s.isDefault;
  }

  cancelEdit() { this.editingId = null; }

  saveEdit(s: OAuthScope) {
    this.adminService.updateOAuthScope(s.id, {
      displayName: this.editDisplayName.trim(),
      description: this.editDescription.trim() || undefined,
      isDefault: this.editIsDefault
    }).subscribe({
      next: () => {
        s.displayName = this.editDisplayName.trim();
        s.description = this.editDescription.trim() || null;
        s.isDefault = this.editIsDefault;
        this.editingId = null;
        this.toast.success('Scope updated.');
      },
      error: err => this.toast.error(err?.error?.message || 'Could not update that scope.')
    });
  }

  toggle(s: OAuthScope) {
    this.adminService.toggleOAuthScopeActive(s.id).subscribe({
      next: res => { s.isEnabled = res.isEnabled; this.toast.success(`Scope ${res.isEnabled ? 'enabled' : 'disabled'}.`); },
      error: () => this.toast.error('Could not update that scope. Please try again.')
    });
  }

  async remove(s: OAuthScope) {
    const confirmed = await this.confirmDialog.ask({
      title: 'Delete this scope?',
      message: s.clientCount > 0
        ? `"${s.displayName}" is currently used by ${s.clientCount} client${s.clientCount === 1 ? '' : 's'}. Deleting it removes it from all of them.`
        : `"${s.displayName}" will be permanently removed.`,
      confirmLabel: 'Delete scope',
      danger: true
    });
    if (!confirmed) return;

    this.adminService.deleteOAuthScope(s.id).subscribe({
      next: () => {
        this.scopes = this.scopes.filter(x => x.id !== s.id);
        this.total--;
        this.toast.success('Scope deleted.');
        if (this.scopes.length === 0 && this.page > 1) { this.page--; this.reload(); }
      },
      error: () => this.toast.error('Could not delete that scope. Please try again.')
    });
  }
}
