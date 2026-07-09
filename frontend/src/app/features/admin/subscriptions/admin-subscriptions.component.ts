import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';

interface PlanForm {
  id: string | null;
  name: string;
  description: string;
  price: number;
  currency: string;
  billingCycle: string;
  monthlyUploadLimit: number;
  unlimited: boolean;
}

@Component({
  selector: 'app-admin-subscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>Plans &amp; pricing</h1>
        <p class="muted">Changes apply immediately to the public pricing page.</p>
      </div>
      <button class="dm-btn dm-btn-primary" (click)="openCreate()">+ Add plan</button>
    </div>

    @if (error) {
      <div class="dm-card error-banner">
        <p>{{ error }}</p>
        <button class="dm-btn dm-btn-ghost" (click)="load()">Retry</button>
      </div>
    } @else if (loading) {
      <div class="plan-grid">
        @for (i of [1,2,3]; track i) { <div class="dm-card plan-card skeleton"></div> }
      </div>
    } @else if (plans.length === 0) {
      <p class="muted">No plans yet — create your first one above.</p>
    } @else {
      <div class="plan-grid">
        @for (p of plans; track p.id) {
          <div class="dm-card plan-card" [class.inactive]="!p.isActive">
            <div class="plan-card-head">
              <span class="plan-name">{{ p.name }}</span>
              <span class="badge" [class.badge-ok]="p.isActive" [class.badge-fail]="!p.isActive">{{ p.isActive ? 'Active' : 'Hidden' }}</span>
            </div>
            @if (p.description) { <p class="plan-desc">{{ p.description }}</p> }

            <div class="plan-price">
              <span class="amount">{{ p.currency }} {{ p.price }}</span>
              <span class="cycle">/ {{ p.billingCycle === 'Monthly' ? 'mo' : 'yr' }}</span>
            </div>

            <div class="plan-meta">
              <div class="meta-item">
                <span class="meta-label">Upload limit</span>
                <span class="meta-value">{{ p.monthlyUploadLimit === -1 ? 'Unlimited' : p.monthlyUploadLimit }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Subscribers</span>
                <span class="meta-value">{{ p.activeSubscribers }}</span>
              </div>
            </div>

            <div class="plan-actions">
              <button class="dm-btn dm-btn-ghost tiny" (click)="openEdit(p)">Edit</button>
              <button class="dm-btn dm-btn-ghost tiny" (click)="toggle(p)">{{ p.isActive ? 'Hide' : 'Show' }}</button>
              <button class="dm-btn dm-btn-ghost tiny danger" (click)="remove(p)">Delete</button>
            </div>
          </div>
        }
      </div>
    }

    @if (modalOpen) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="dm-card modal-panel" (click)="$event.stopPropagation()">
          <h2>{{ modalMode === 'create' ? 'Add a new plan' : 'Edit plan' }}</h2>

          <label class="field">
            <span>Plan name</span>
            <input class="dm-input" [(ngModel)]="form.name" placeholder="e.g. Pro" />
          </label>

          <label class="field">
            <span>Description</span>
            <textarea class="dm-input" rows="2" [(ngModel)]="form.description" placeholder="Shown to customers on the pricing page"></textarea>
          </label>

          <div class="field-row">
            <label class="field">
              <span>Price</span>
              <input class="dm-input" type="number" min="0" [(ngModel)]="form.price" />
            </label>
            <label class="field">
              <span>Currency</span>
              <select class="dm-input" [(ngModel)]="form.currency">
                <option value="INR">INR ₹</option>
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
                <option value="GBP">GBP £</option>
              </select>
            </label>
            <label class="field">
              <span>Billing cycle</span>
              <select class="dm-input" [(ngModel)]="form.billingCycle">
                <option value="Monthly">Monthly</option>
                <option value="Yearly">Yearly</option>
              </select>
            </label>
          </div>

          <label class="field">
            <span>Monthly upload limit</span>
            <input class="dm-input" type="number" min="1" [(ngModel)]="form.monthlyUploadLimit" [disabled]="form.unlimited" />
          </label>
          <label class="checkbox-field">
            <input type="checkbox" [(ngModel)]="form.unlimited" />
            <span>Unlimited uploads</span>
          </label>

          @if (formError) { <p class="form-error">{{ formError }}</p> }

          <div class="modal-actions">
            <button class="dm-btn dm-btn-ghost" (click)="closeModal()">Cancel</button>
            <button class="dm-btn dm-btn-primary" (click)="save()">{{ modalMode === 'create' ? 'Create plan' : 'Save changes' }}</button>
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

    .plan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 18px; }
    .plan-card { padding: 22px; display: flex; flex-direction: column; gap: 14px; transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .plan-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
    .plan-card.inactive { opacity: 0.65; }
    .plan-card.skeleton { height: 220px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .plan-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .plan-name { font-weight: 700; font-size: 1.05rem; }
    .plan-desc { margin: 0; font-size: 0.82rem; color: var(--dm-text-muted); line-height: 1.5; }

    .plan-price { display: flex; align-items: baseline; gap: 4px; }
    .amount { font-size: 1.6rem; font-weight: 800; }
    .cycle { color: var(--dm-text-muted); font-size: 0.85rem; }

    .plan-meta { display: flex; gap: 20px; padding: 12px 0; border-top: 1px solid var(--dm-border); border-bottom: 1px solid var(--dm-border); }
    .meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); }
    .meta-value { font-weight: 700; font-size: 0.92rem; }

    .plan-actions { display: flex; gap: 8px; margin-top: auto; }
    .tiny { padding: 7px 14px; font-size: 0.8rem; }
    .danger { border-color: var(--dm-danger); color: var(--dm-danger); }
    .danger:hover { background: rgba(248,113,113,0.1); }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; }
    .badge-ok { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }

    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(4, 6, 14, 0.6); backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center; z-index: 9000; padding: 20px; overflow-y: auto;
    }
    .modal-panel { padding: 28px; width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 14px; }
    .modal-panel h2 { font-size: 1.15rem; margin: 0 0 4px; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 0.82rem; color: var(--dm-text-muted); flex: 1; }
    .field textarea { resize: vertical; font-family: inherit; }
    .field-row { display: flex; gap: 12px; }
    .checkbox-field { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; color: var(--dm-text); }
    .form-error { color: var(--dm-danger); font-size: 0.82rem; margin: 0; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
    @media (max-width: 520px) { .field-row { flex-direction: column; } }
  `]
})
export class AdminSubscriptionsComponent implements OnInit {
  plans: any[] = [];
  loading = true;
  error = '';

  modalOpen = false;
  modalMode: 'create' | 'edit' = 'create';
  form: PlanForm = this.emptyForm();
  formError = '';

  constructor(
    private adminService: AdminService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService
  ) {}

  ngOnInit() { this.load(); }

  emptyForm(): PlanForm {
    return { id: null, name: '', description: '', price: 0, currency: 'INR', billingCycle: 'Monthly', monthlyUploadLimit: 50, unlimited: false };
  }

  load() {
    this.loading = true;
    this.error = '';
    this.adminService.getPlans().subscribe({
      next: res => { this.plans = res.plans; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load plans. Please try again.'; }
    });
  }

  toggle(p: any) {
    this.adminService.togglePlanActive(p.id).subscribe({
      next: res => { p.isActive = res.isActive; },
      error: () => this.toast.error('Could not update that plan. Please try again.')
    });
  }

  openCreate() {
    this.form = this.emptyForm();
    this.formError = '';
    this.modalMode = 'create';
    this.modalOpen = true;
  }

  openEdit(p: any) {
    this.form = {
      id: p.id, name: p.name, description: p.description ?? '', price: p.price,
      currency: p.currency, billingCycle: p.billingCycle,
      monthlyUploadLimit: p.monthlyUploadLimit === -1 ? 50 : p.monthlyUploadLimit,
      unlimited: p.monthlyUploadLimit === -1
    };
    this.formError = '';
    this.modalMode = 'edit';
    this.modalOpen = true;
  }

  closeModal() { this.modalOpen = false; }

  save() {
    if (!this.form.name.trim()) { this.formError = 'Plan name is required.'; return; }
    if (this.form.price < 0) { this.formError = 'Price can\'t be negative.'; return; }
    if (!this.form.unlimited && this.form.monthlyUploadLimit < 1) { this.formError = 'Upload limit must be at least 1, or mark it unlimited.'; return; }
    this.formError = '';

    const payload = {
      name: this.form.name.trim(),
      description: this.form.description.trim() || null,
      price: this.form.price,
      currency: this.form.currency,
      billingCycle: this.form.billingCycle,
      monthlyUploadLimit: this.form.unlimited ? -1 : this.form.monthlyUploadLimit
    };

    const request = this.modalMode === 'create'
      ? this.adminService.createPlan(payload)
      : this.adminService.updatePlan(this.form.id!, payload);

    request.subscribe({
      next: () => {
        this.toast.success(this.modalMode === 'create' ? 'Plan created.' : 'Plan updated.');
        this.modalOpen = false;
        this.load();
      },
      error: err => this.toast.error(err?.error?.message || 'Could not save that plan. Please check the values and try again.')
    });
  }

  async remove(p: any) {
    if (p.activeSubscribers > 0) {
      this.toast.error(`"${p.name}" has ${p.activeSubscribers} active subscriber(s) — hide it instead of deleting.`);
      return;
    }
    const confirmed = await this.confirmDialog.ask({
      title: 'Delete this plan?',
      message: `"${p.name}" will be permanently removed. This can't be undone.`,
      confirmLabel: 'Delete plan',
      danger: true
    });
    if (!confirmed) return;

    this.adminService.deletePlan(p.id).subscribe({
      next: () => { this.plans = this.plans.filter(x => x.id !== p.id); this.toast.success('Plan deleted.'); },
      error: err => this.toast.error(err?.error?.message || 'Could not delete that plan.')
    });
  }
}
