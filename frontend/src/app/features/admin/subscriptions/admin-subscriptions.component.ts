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
  monthlyPageLimit: number;
  unlimited: boolean;
  isRecurring: boolean;
  isFreeTrial: boolean;
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
              <div class="badges">
                @if (p.isFreeTrial) { <span class="badge badge-trial">Free trial</span> }
                <span class="badge" [class.badge-ok]="p.isActive" [class.badge-fail]="!p.isActive">{{ p.isActive ? 'Active' : 'Hidden' }}</span>
              </div>
            </div>
            @if (p.isFreeTrial) {
              <p class="plan-desc trial-note">Auto-granted once at sign-up — never shown on the public pricing page.</p>
            }
            @if (p.description) { <p class="plan-desc">{{ p.description }}</p> }

            <div class="plan-price">
              <span class="amount">{{ p.currency }} {{ p.price }}</span>
              <span class="cycle">{{ p.isRecurring ? '/ ' + (p.billingCycle === 'Monthly' ? 'mo' : 'yr') : '(one-time)' }}</span>
            </div>

            <div class="plan-meta">
              <div class="meta-item">
                <span class="meta-label">{{ p.isRecurring ? 'Page limit' : 'Lifetime pages' }}</span>
                <span class="meta-value">{{ p.monthlyPageLimit === -1 ? 'Unlimited' : p.monthlyPageLimit }}</span>
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

    <div class="section-head">
      <h2>Recent transactions</h2>
      <p class="muted">Full refunds immediately revoke the subscription that payment activated.</p>
    </div>

    @if (txLoading) {
      <div class="dm-card tx-card skeleton"></div>
    } @else if (transactions.length === 0) {
      <p class="muted">No transactions yet.</p>
    } @else {
      <div class="dm-card tx-table-wrap">
        <table class="tx-table">
          <thead>
            <tr>
              <th>User</th><th>Provider</th><th>Amount</th><th>Status</th><th>Date</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (t of transactions; track t.id) {
              <tr>
                <td data-label="User">{{ t.userEmail }}</td>
                <td data-label="Provider">{{ t.provider }}</td>
                <td data-label="Amount">{{ t.currency }} {{ t.amount }}</td>
                <td data-label="Status">
                  <span class="badge" [class.badge-ok]="t.status === 'paid'" [class.badge-fail]="t.status === 'failed'" [class.badge-refunded]="t.status === 'refunded'">
                    {{ t.status }}
                  </span>
                </td>
                <td data-label="Date">{{ t.createdAtUtc | date: 'medium' }}</td>
                <td data-label="">
                  @if (t.status === 'paid') {
                    <button class="dm-btn dm-btn-ghost tiny danger" (click)="refund(t)">Refund</button>
                  } @else if (t.status === 'refunded') {
                    <span class="muted refund-note">Refunded {{ t.refundedAtUtc | date: 'medium' }}</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
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
            <span>{{ form.isRecurring ? 'Monthly page limit' : 'Lifetime page limit' }}</span>
            <input class="dm-input" type="number" min="1" [(ngModel)]="form.monthlyPageLimit" [disabled]="form.unlimited" />
          </label>
          <label class="checkbox-field">
            <input type="checkbox" [(ngModel)]="form.unlimited" />
            <span>Unlimited pages</span>
          </label>
          <label class="checkbox-field">
            <input type="checkbox" [(ngModel)]="form.isRecurring" />
            <span>Renews each billing cycle (uncheck for a one-time lifetime allowance, e.g. a free trial)</span>
          </label>
          <label class="checkbox-field">
            <input type="checkbox" [(ngModel)]="form.isFreeTrial" />
            <span>This is the free trial plan — auto-granted once at sign-up, hidden from the pricing page, and can't be re-activated once used. Only one plan should have this checked.</span>
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

    .badges { display: flex; align-items: center; gap: 6px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.76rem; font-weight: 600; }
    .badge-ok { background: rgba(52, 211, 153, 0.15); color: var(--dm-success); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--dm-danger); }
    .badge-trial { background: rgba(99, 102, 241, 0.15); color: var(--dm-primary-light); }
    .badge-refunded { background: rgba(148, 163, 184, 0.15); color: var(--dm-text-muted); }
    .trial-note { font-style: italic; }

    .section-head { margin: 34px 0 14px; }
    .section-head h2 { font-size: 1.1rem; margin: 0; }
    .tx-card.skeleton { height: 140px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    .tx-table-wrap { padding: 0; overflow-x: auto; }
    .tx-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; white-space: nowrap; }
    .tx-table th { text-align: left; padding: 12px 16px; color: var(--dm-text-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--dm-border); }
    .tx-table td { padding: 12px 16px; border-bottom: 1px solid var(--dm-border); }
    .tx-table tr:last-child td { border-bottom: none; }
    /* Below this width a horizontally-scrolling table is an awkward way to read a handful of
       fields per row - restack each row as label/value pairs instead, same pattern used for
       the plan cards above. */
    @media (max-width: 640px) {
      .tx-table-wrap { overflow-x: visible; }
      .tx-table, .tx-table thead, .tx-table tbody, .tx-table tr, .tx-table td { display: block; white-space: normal; width: 100%; }
      .tx-table thead { display: none; }
      .tx-table tr { padding: 14px 16px; border-bottom: 1px solid var(--dm-border); }
      .tx-table tr:last-child { border-bottom: none; }
      .tx-table td { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 0; border-bottom: none; text-align: right; }
      .tx-table td[data-label]:not([data-label=""])::before { content: attr(data-label); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); text-align: left; }
      .tx-table td[data-label=""] { justify-content: flex-end; }
    }
    .refund-note { font-size: 0.78rem; }

    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(4, 6, 14, 0.6); backdrop-filter: blur(2px);
      display: flex; align-items: flex-start; justify-content: center; z-index: 9000; padding: 40px 20px; overflow-y: auto;
    }
    /* align-items: flex-start (not center) is deliberate - a centered flex item taller
       than its container overflows equally above AND below, and content pushed above
       the scroll container's natural top can never be scrolled back into view. Anchoring
       to the top means a tall form (e.g. this one on a short mobile viewport) just grows
       downward into the already-scrollable backdrop instead of clipping its own heading. */
    .modal-panel { padding: 28px; width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 14px; margin: auto 0; }
    .modal-panel h2 { font-size: 1.15rem; margin: 0 0 4px; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 0.82rem; color: var(--dm-text-muted); flex: 1; min-width: 0; }
    .field textarea { resize: vertical; font-family: inherit; }
    .field-row { display: flex; gap: 12px; }
    .checkbox-field { display: flex; align-items: flex-start; gap: 8px; font-size: 0.86rem; color: var(--dm-text); }
    .checkbox-field input { margin-top: 3px; flex-shrink: 0; }
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
export class AdminSubscriptionsComponent implements OnInit {
  plans: any[] = [];
  loading = true;
  error = '';

  transactions: any[] = [];
  txLoading = true;

  modalOpen = false;
  modalMode: 'create' | 'edit' = 'create';
  form: PlanForm = this.emptyForm();
  formError = '';

  constructor(
    private adminService: AdminService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService
  ) {}

  ngOnInit() { this.load(); this.loadTransactions(); }

  loadTransactions() {
    this.txLoading = true;
    this.adminService.getTransactions({ pageSize: 20 }).subscribe({
      next: res => { this.transactions = res.items; this.txLoading = false; },
      error: () => { this.txLoading = false; }
    });
  }

  async refund(t: any) {
    const confirmed = await this.confirmDialog.ask({
      title: 'Refund this payment?',
      message: `${t.currency} ${t.amount} will be refunded to ${t.userEmail}, and their subscription from this payment will be revoked immediately. This can't be undone.`,
      confirmLabel: 'Issue refund',
      danger: true
    });
    if (!confirmed) return;

    this.adminService.refundTransaction(t.id).subscribe({
      next: () => { this.toast.success('Refund issued and access revoked.'); this.loadTransactions(); },
      error: err => this.toast.error(err?.error?.message || 'Could not issue this refund. Please try again.')
    });
  }

  emptyForm(): PlanForm {
    return { id: null, name: '', description: '', price: 0, currency: 'INR', billingCycle: 'Monthly', monthlyPageLimit: 50, unlimited: false, isRecurring: true, isFreeTrial: false };
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
      monthlyPageLimit: p.monthlyPageLimit === -1 ? 50 : p.monthlyPageLimit,
      unlimited: p.monthlyPageLimit === -1,
      isRecurring: p.isRecurring,
      isFreeTrial: p.isFreeTrial
    };
    this.formError = '';
    this.modalMode = 'edit';
    this.modalOpen = true;
  }

  closeModal() { this.modalOpen = false; }

  save() {
    if (!this.form.name.trim()) { this.formError = 'Plan name is required.'; return; }
    if (this.form.price < 0) { this.formError = 'Price can\'t be negative.'; return; }
    if (!this.form.unlimited && this.form.monthlyPageLimit < 1) { this.formError = 'Page limit must be at least 1, or mark it unlimited.'; return; }
    this.formError = '';

    const payload = {
      name: this.form.name.trim(),
      description: this.form.description.trim() || null,
      price: this.form.price,
      currency: this.form.currency,
      billingCycle: this.form.billingCycle,
      monthlyPageLimit: this.form.unlimited ? -1 : this.form.monthlyPageLimit,
      isRecurring: this.form.isRecurring,
      isFreeTrial: this.form.isFreeTrial
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
