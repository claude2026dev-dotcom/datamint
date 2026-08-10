import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { ExtractionTier } from '../../../core/models/models';

interface TierForm {
  id: string | null;
  name: string;
  aiProvider: string;
  modelName: string;
  customOutputFormatExample: string;
  customInstructions: string;
}

/// Admin-only mapping of AI provider/model/prompt customization to a name a Plan can pick -
/// entirely invisible to the end user, who never sees which AI actually processed their
/// document. The always-present default tier (Claude Haiku 4.5, no customization) can't be
/// disabled or deleted since every plan without its own tier falls back to it.
@Component({
  selector: 'app-admin-extraction-tiers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>Extraction tiers</h1>
        <p class="muted">Controls which AI provider/model/prompt each plan's uploads use — customers never see this.</p>
      </div>
      <button class="dm-btn dm-btn-primary" (click)="openCreate()">+ New tier</button>
    </div>

    @if (error) {
      <div class="dm-card error-banner">
        <p>{{ error }}</p>
        <button class="dm-btn dm-btn-ghost" (click)="load()">Retry</button>
      </div>
    } @else if (loading) {
      <div class="tier-grid">
        @for (i of [1,2,3]; track i) { <div class="dm-card tier-card skeleton"></div> }
      </div>
    } @else if (tiers.length === 0) {
      <p class="muted">No tiers yet — create your first one above.</p>
    } @else {
      <div class="tier-grid">
        @for (t of tiers; track t.id) {
          <div class="dm-card tier-card" [class.inactive]="!t.isEnabled">
            <div class="tier-card-head">
              <span class="tier-name">{{ t.name }}</span>
              <div class="badges">
                @if (t.isDefault) { <span class="badge badge-trial">Default</span> }
                <span class="badge" [class.badge-ok]="t.isEnabled" [class.badge-fail]="!t.isEnabled">{{ t.isEnabled ? 'Enabled' : 'Disabled' }}</span>
              </div>
            </div>

            <div class="tier-meta">
              <div class="meta-item">
                <span class="meta-label">Provider</span>
                <span class="meta-value">{{ t.aiProvider }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Model</span>
                <span class="meta-value">{{ t.modelName }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Plans using it</span>
                <span class="meta-value">{{ t.planCount }}</span>
              </div>
            </div>

            @if (t.customOutputFormatExample || t.customInstructions) {
              <div class="custom-badges">
                @if (t.customOutputFormatExample) { <span class="chip">Custom output example</span> }
                @if (t.customInstructions) { <span class="chip">Custom instructions</span> }
              </div>
            } @else {
              <p class="plan-desc muted">Default prompt, unmodified.</p>
            }

            <div class="tier-actions">
              <button class="dm-btn dm-btn-ghost tiny" (click)="openEdit(t)">Edit</button>
              @if (!t.isDefault) {
                <button class="dm-btn dm-btn-ghost tiny" (click)="toggle(t)">{{ t.isEnabled ? 'Disable' : 'Enable' }}</button>
                <button class="dm-btn dm-btn-ghost tiny danger" (click)="remove(t)">Delete</button>
              }
            </div>
          </div>
        }
      </div>
    }

    @if (modalOpen) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="dm-card modal-panel" (click)="$event.stopPropagation()">
          <h2>{{ modalMode === 'create' ? 'Add a new tier' : 'Edit tier' }}</h2>

          <label class="field">
            <span>Tier name</span>
            <input class="dm-input" [(ngModel)]="form.name" placeholder="e.g. Premium" />
          </label>

          <div class="field-row">
            <label class="field">
              <span>AI provider</span>
              <select class="dm-input" [(ngModel)]="form.aiProvider">
                <option value="Claude">Claude</option>
                <option value="OpenAi">OpenAI</option>
              </select>
            </label>
            <label class="field">
              <span>Model name</span>
              <input class="dm-input" [(ngModel)]="form.modelName" placeholder="e.g. claude-haiku-4-5" />
            </label>
          </div>

          <label class="field">
            <span>Custom output format example <span class="hint">(optional — a literal example the model must structurally match)</span></span>
            <textarea class="dm-input" rows="3" [(ngModel)]="form.customOutputFormatExample" placeholder="Leave blank to use the default format"></textarea>
          </label>

          <label class="field">
            <span>Custom instructions <span class="hint">(optional — appended to the default extraction prompt)</span></span>
            <textarea class="dm-input" rows="3" [(ngModel)]="form.customInstructions" placeholder="Leave blank to use the default prompt, unmodified"></textarea>
          </label>

          @if (formError) { <p class="form-error">{{ formError }}</p> }

          <div class="modal-actions">
            <button class="dm-btn dm-btn-ghost" (click)="closeModal()">Cancel</button>
            <button class="dm-btn dm-btn-primary" (click)="save()">{{ modalMode === 'create' ? 'Create tier' : 'Save changes' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 6px 0 0; }
    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }

    .tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 18px; }
    .tier-card { padding: 22px; display: flex; flex-direction: column; gap: 14px; transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .tier-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
    .tier-card.inactive { opacity: 0.65; }
    .tier-card.skeleton { height: 200px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .tier-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .tier-name { font-weight: 700; font-size: 1.05rem; }
    .plan-desc { margin: 0; font-size: 0.82rem; line-height: 1.5; font-style: italic; }

    .tier-meta { display: flex; gap: 20px; padding: 12px 0; border-top: 1px solid var(--dm-border); border-bottom: 1px solid var(--dm-border); flex-wrap: wrap; }
    .meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); }
    .meta-value { font-weight: 700; font-size: 0.92rem; }

    .custom-badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { font-size: 0.74rem; padding: 3px 10px; border-radius: 999px; background: rgba(99,102,241,0.1); color: var(--dm-primary); }

    .tier-actions { display: flex; gap: 8px; margin-top: auto; }
    .tiny { padding: 7px 14px; font-size: 0.8rem; }
    .danger { border-color: var(--dm-danger); color: var(--dm-danger); }
    .danger:hover { background: rgba(248,113,113,0.1); }

    .badges { display: flex; align-items: center; gap: 6px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; }
    .badge-ok { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }
    .badge-trial { background: rgba(99, 102, 241, 0.15); color: var(--dm-primary-light); }

    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(4, 6, 14, 0.6); backdrop-filter: blur(2px);
      display: flex; align-items: flex-start; justify-content: center; z-index: 9000; padding: 40px 20px; overflow-y: auto;
    }
    .modal-panel { padding: 28px; width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 14px; margin: auto 0; }
    .modal-panel h2 { font-size: 1.15rem; margin: 0 0 4px; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 0.82rem; color: var(--dm-text-muted); flex: 1; min-width: 0; }
    .field .hint { font-weight: 400; font-size: 0.74rem; }
    .field textarea { resize: vertical; font-family: inherit; }
    .field-row { display: flex; gap: 12px; }
    .form-error { color: var(--dm-danger); font-size: 0.82rem; margin: 0; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
    @media (max-width: 520px) {
      .field-row { flex-direction: column; }
      .modal-backdrop { padding: 20px 12px; }
      .modal-panel { padding: 20px; }
      .modal-actions { flex-direction: column-reverse; }
      .modal-actions .dm-btn { width: 100%; }
    }
  `]
})
export class AdminExtractionTiersComponent implements OnInit {
  tiers: ExtractionTier[] = [];
  loading = true;
  error = '';

  modalOpen = false;
  modalMode: 'create' | 'edit' = 'create';
  form: TierForm = this.emptyForm();
  formError = '';

  constructor(
    private adminService: AdminService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService
  ) {}

  ngOnInit() { this.load(); }

  emptyForm(): TierForm {
    return { id: null, name: '', aiProvider: 'Claude', modelName: '', customOutputFormatExample: '', customInstructions: '' };
  }

  load() {
    this.loading = true;
    this.error = '';
    this.adminService.getExtractionTiers({ pageSize: 100 }).subscribe({
      next: res => { this.tiers = res.items; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load extraction tiers. Please try again.'; }
    });
  }

  toggle(t: ExtractionTier) {
    this.adminService.toggleExtractionTierActive(t.id).subscribe({
      next: res => { t.isEnabled = res.isEnabled; },
      error: err => this.toast.error(err?.error?.message || 'Could not update that tier. Please try again.')
    });
  }

  openCreate() {
    this.form = this.emptyForm();
    this.formError = '';
    this.modalMode = 'create';
    this.modalOpen = true;
  }

  openEdit(t: ExtractionTier) {
    this.form = {
      id: t.id, name: t.name, aiProvider: t.aiProvider, modelName: t.modelName,
      customOutputFormatExample: t.customOutputFormatExample ?? '', customInstructions: t.customInstructions ?? ''
    };
    this.formError = '';
    this.modalMode = 'edit';
    this.modalOpen = true;
  }

  closeModal() { this.modalOpen = false; }

  save() {
    if (!this.form.name.trim() || !this.form.modelName.trim()) { this.formError = 'Name and model name are required.'; return; }
    this.formError = '';

    const payload = {
      name: this.form.name.trim(),
      aiProvider: this.form.aiProvider,
      modelName: this.form.modelName.trim(),
      customOutputFormatExample: this.form.customOutputFormatExample.trim() || null,
      customInstructions: this.form.customInstructions.trim() || null
    };

    const request = this.modalMode === 'create'
      ? this.adminService.createExtractionTier(payload)
      : this.adminService.updateExtractionTier(this.form.id!, payload);

    request.subscribe({
      next: () => {
        this.toast.success(this.modalMode === 'create' ? 'Tier created.' : 'Tier updated.');
        this.modalOpen = false;
        this.load();
      },
      error: err => this.toast.error(err?.error?.message || 'Could not save that tier. Please check the values and try again.')
    });
  }

  async remove(t: ExtractionTier) {
    if (t.planCount > 0) {
      this.toast.error(`"${t.name}" is still mapped to ${t.planCount} plan(s) — remap or delete those plans first.`);
      return;
    }
    const confirmed = await this.confirmDialog.ask({
      title: 'Delete this tier?',
      message: `"${t.name}" will be permanently removed. This can't be undone.`,
      confirmLabel: 'Delete tier',
      danger: true
    });
    if (!confirmed) return;

    this.adminService.deleteExtractionTier(t.id).subscribe({
      next: () => { this.tiers = this.tiers.filter(x => x.id !== t.id); this.toast.success('Tier deleted.'); },
      error: err => this.toast.error(err?.error?.message || 'Could not delete that tier.')
    });
  }
}
