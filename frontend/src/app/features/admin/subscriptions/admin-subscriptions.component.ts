import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-subscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="dm-container page">
      <div class="admin-tabs">
        <a routerLink="/admin" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="active">Overview</a>
        <a routerLink="/admin/audits" routerLinkActive="active">Audit logs</a>
        <a routerLink="/admin/users" routerLinkActive="active">Users</a>
        <a routerLink="/admin/subscriptions" routerLinkActive="active">Plans</a>
      </div>

      <h1>Plans & pricing</h1>
      <p class="muted">Prices seeded as placeholders — edit here once real pricing is decided. Changes apply immediately to the public pricing page.</p>

      <div class="dm-card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Price</th><th>Cycle</th><th>Upload limit</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (p of plans; track p.id) {
              <tr>
                <td>{{ p.name }}</td>
                <td>{{ p.currency }} {{ p.price }}</td>
                <td>{{ p.billingCycle }}</td>
                <td>{{ p.monthlyUploadLimit === -1 ? 'Unlimited' : p.monthlyUploadLimit }}</td>
                <td><span [class.ok]="p.isActive" [class.fail]="!p.isActive">{{ p.isActive ? 'Active' : 'Hidden' }}</span></td>
                <td><button class="dm-btn dm-btn-ghost small" (click)="toggle(p)">{{ p.isActive ? 'Hide' : 'Show' }}</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="dm-card new-plan">
        <h3>Add a new plan</h3>
        <div class="form-grid">
          <input class="dm-input" placeholder="Name" [(ngModel)]="newPlan.name" />
          <input class="dm-input" type="number" placeholder="Price" [(ngModel)]="newPlan.price" />
          <input class="dm-input" placeholder="Currency (INR)" [(ngModel)]="newPlan.currency" />
          <select class="dm-input" [(ngModel)]="newPlan.billingCycle">
            <option value="Monthly">Monthly</option>
            <option value="Yearly">Yearly</option>
          </select>
          <input class="dm-input" type="number" placeholder="Monthly upload limit (-1 = unlimited)" [(ngModel)]="newPlan.monthlyUploadLimit" />
        </div>
        <button class="dm-btn dm-btn-primary" (click)="create()">Create plan</button>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 40px 0 80px; }
    .admin-tabs { display: flex; gap: 8px; margin-bottom: 26px; border-bottom: 1px solid var(--dm-border); flex-wrap: wrap; }
    .admin-tabs a { padding: 10px 14px; color: var(--dm-text-muted); text-decoration: none; font-size: 0.9rem; border-bottom: 2px solid transparent; }
    .admin-tabs a.active { color: var(--dm-text); border-color: var(--dm-primary); }
    .muted { color: var(--dm-text-muted); font-size: 0.88rem; margin-bottom: 20px; }
    .table-wrap { overflow-x: auto; padding: 8px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--dm-border); white-space: nowrap; }
    th { color: var(--dm-text-muted); font-weight: 600; }
    .ok { color: var(--dm-success); } .fail { color: var(--dm-danger); }
    .small { padding: 6px 12px; font-size: 0.8rem; }
    .new-plan { padding: 22px; }
    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 14px 0; }
    @media (max-width: 700px) { .form-grid { grid-template-columns: 1fr; } }
  `]
})
export class AdminSubscriptionsComponent implements OnInit {
  plans: any[] = [];
  newPlan = { name: '', price: 0, currency: 'INR', billingCycle: 'Monthly', monthlyUploadLimit: 50 };

  constructor(private adminService: AdminService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load() { this.adminService.getPlans().subscribe(res => this.plans = res.plans); }

  toggle(p: any) {
    this.adminService.togglePlanActive(p.id).subscribe(res => { p.isActive = res.isActive; });
  }

  create() {
    this.adminService.createPlan(this.newPlan).subscribe(() => {
      this.toast.success('Plan created.');
      this.load();
    });
  }
}
