import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ExtractionTier, RoleTierOverride } from '../../../core/models/models';

/// Lets an admin pin a whole Role (e.g. every "Admin" account) to a specific Extraction Tier,
/// bypassing the normal Plan-based tier for those accounts - useful for giving internal/staff
/// accounts a consistently better tier without subscribing them to a paid plan. Exactly two rows
/// always exist (Admin, User); this page only ever edits them, it can't add or remove roles.
@Component({
  selector: 'app-admin-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>Roles</h1>
        <p class="muted">Pin a role to a specific extraction tier, overriding whatever tier its plan would otherwise use.</p>
      </div>
    </div>

    @if (error) {
      <div class="dm-card error-banner">
        <p>{{ error }}</p>
        <button class="dm-btn dm-btn-ghost" (click)="load()">Retry</button>
      </div>
    } @else if (loading) {
      <div class="role-grid">
        @for (i of [1,2]; track i) { <div class="dm-card role-card skeleton"></div> }
      </div>
    } @else {
      <div class="role-grid">
        @for (r of overrides; track r.role) {
          <div class="dm-card role-card">
            <span class="role-name">{{ r.role }}</span>
            <label class="field">
              <span>Extraction tier override</span>
              <select class="dm-input" [ngModel]="r.extractionTierId" (ngModelChange)="save(r, $event)">
                <option [ngValue]="null">No override — use the plan's tier</option>
                @for (t of tiers; track t.id) {
                  <option [ngValue]="t.id">{{ t.name }}{{ t.isDefault ? ' (default)' : '' }}</option>
                }
              </select>
            </label>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .page-head { margin-bottom: 22px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 6px 0 0; }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }

    .role-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
    .role-card { padding: 22px; display: flex; flex-direction: column; gap: 14px; }
    .role-card.skeleton { height: 120px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .role-name { font-weight: 700; font-size: 1.05rem; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 0.82rem; color: var(--dm-text-muted); }
  `]
})
export class AdminRolesComponent implements OnInit {
  overrides: RoleTierOverride[] = [];
  tiers: ExtractionTier[] = [];
  loading = true;
  error = '';

  constructor(private adminService: AdminService, private toast: ToastService) {}

  ngOnInit() {
    this.load();
    this.adminService.getExtractionTiers({ pageSize: 100 }).subscribe({
      next: res => { this.tiers = res.items; },
      error: () => {}
    });
  }

  load() {
    this.loading = true;
    this.error = '';
    this.adminService.getRoleTierOverrides().subscribe({
      next: res => { this.overrides = res.items; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load role overrides. Please try again.'; }
    });
  }

  save(r: RoleTierOverride, tierId: string | null) {
    const previous = r.extractionTierId;
    r.extractionTierId = tierId;
    this.adminService.updateRoleTierOverride(r.role, tierId).subscribe({
      next: () => {
        r.extractionTierName = this.tiers.find(t => t.id === tierId)?.name ?? null;
        this.toast.success(`${r.role} role updated.`);
      },
      error: err => {
        r.extractionTierId = previous;
        this.toast.error(err?.error?.message || 'Could not update that role. Please try again.');
      }
    });
  }
}
