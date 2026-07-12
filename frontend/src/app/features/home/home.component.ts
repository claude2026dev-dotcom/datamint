import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { DocumentService } from '../../core/services/document.service';
import { SubscriptionStatus } from '../../core/models/models';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { DocumentRowComponent } from '../../shared/components/document-row/document-row.component';
import { DocGroup, groupByUploadBatch } from '../../shared/utils/document-groups';
import { usageLabel, usagePercent } from '../../shared/utils/plan-usage';

/// The logged-in landing spot ("/") redirects here instead of showing the public
/// marketing page a second time to someone who already has an account - a real
/// dashboard (stat cards + recent activity), not just a greeting, matching how
/// Stripe/Vercel/Linear-style apps treat the first screen after sign-in.
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, DocumentRowComponent],
  template: `
    <div class="dm-container page">
      <div class="dash-header">
        <div>
          <h1>{{ greeting() }}, {{ firstName() }} 👋</h1>
          <p class="muted">Here's what's happening with your account.</p>
        </div>
        <a routerLink="/upload" class="dm-btn dm-btn-primary"><app-icon name="upload-cloud" [size]="16" /> Upload new PDF</a>
      </div>

      @if (loading) {
        <div class="stats-grid">
          @for (i of [1,2,3]; track i) { <div class="dm-card stat-card skeleton"></div> }
        </div>
      } @else {
        <div class="stats-grid">
          <div class="dm-card stat-card">
            <span class="stat-label">Current plan</span>
            @if (planStatus?.hasActiveSubscription) {
              <span class="stat-value">{{ planStatus?.planName }}</span>
              <a routerLink="/profile/plan" class="stat-link">Manage <app-icon name="arrow-right" [size]="12" /></a>
            } @else {
              <span class="stat-value">None yet</span>
              <a routerLink="/plans" class="stat-link">Choose a plan <app-icon name="arrow-right" [size]="12" /></a>
            }
          </div>

          <div class="dm-card stat-card">
            <span class="stat-label">Pages used</span>
            @if (planStatus?.hasActiveSubscription) {
              <span class="stat-value">{{ planStatus?.pagesUsedThisCycle }}</span>
              <div class="usage-bar" [attr.aria-label]="usageLabel(planStatus)">
                <div class="usage-fill" [style.width.%]="usagePercent(planStatus)"></div>
              </div>
              <span class="stat-sub">{{ usageLabel(planStatus) }}</span>
            } @else {
              <span class="stat-value">—</span>
            }
          </div>

          <div class="dm-card stat-card">
            <span class="stat-label">Total documents</span>
            <span class="stat-value">{{ totalDocuments }}</span>
            <a routerLink="/documents" class="stat-link">View all <app-icon name="arrow-right" [size]="12" /></a>
          </div>
        </div>

        <div class="recent-section">
          <div class="recent-header">
            <h2>Recent documents</h2>
            @if (recentGroups.length > 0) { <a routerLink="/documents" class="view-all">View all</a> }
          </div>

          @if (recentGroups.length === 0) {
            <div class="dm-card empty-state">
              <div class="icon"><app-icon name="inbox" [size]="26" /></div>
              <p class="muted">No documents yet — upload your first PDF to see it show up here.</p>
              <a routerLink="/upload" class="dm-btn dm-btn-primary"><app-icon name="upload-cloud" [size]="16" /> Upload a PDF</a>
            </div>
          } @else {
            <div class="doc-list">
              @for (group of recentGroups; track group.batchId) {
                <app-document-row [group]="group" />
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    h1 { font-size: 1.7rem; margin-bottom: 6px; }
    h2 { font-size: 1.05rem; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 0; }
    .dash-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }

    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .stat-card { padding: 20px; display: flex; flex-direction: column; gap: 6px; }
    .stat-card.skeleton { height: 108px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); font-weight: 700; }
    .stat-value { font-size: 1.4rem; font-weight: 800; }
    .stat-sub { font-size: 0.76rem; color: var(--dm-text-muted); }
    .stat-link { display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; font-weight: 600; color: var(--dm-primary-light); text-decoration: none; margin-top: 4px; }
    .stat-link:hover { text-decoration: underline; }
    .usage-bar { height: 7px; border-radius: 999px; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); overflow: hidden; margin: 4px 0 2px; }
    .usage-fill { height: 100%; background: var(--dm-gradient-primary); transition: width 0.3s ease; }

    .recent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .view-all { font-size: 0.85rem; font-weight: 600; color: var(--dm-primary-light); text-decoration: none; }
    .view-all:hover { text-decoration: underline; }
    .doc-list { display: flex; flex-direction: column; gap: 10px; }

    .empty-state { padding: 34px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .empty-state .icon { color: var(--dm-text-muted); }

    @media (max-width: 700px) {
      .stats-grid { grid-template-columns: 1fr; }
      .dash-header { flex-direction: column; }
    }
  `]
})
export class HomeComponent implements OnInit {
  usageLabel = usageLabel;
  usagePercent = usagePercent;

  planStatus: SubscriptionStatus | null = null;
  recentGroups: DocGroup[] = [];
  totalDocuments = 0;
  loading = true;

  constructor(
    private auth: AuthService,
    private subscriptionService: SubscriptionService,
    private documentService: DocumentService
  ) {}

  ngOnInit() {
    forkJoin({
      status: this.subscriptionService.getStatus(),
      documents: this.documentService.getMine()
    }).subscribe({
      next: ({ status, documents }) => {
        this.planStatus = status.status;
        this.totalDocuments = documents.documents.length;
        this.recentGroups = groupByUploadBatch(documents.documents).slice(0, 5);
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  firstName(): string {
    const name = this.auth.currentUser()?.displayName?.trim();
    if (name) return name.split(/\s+/)[0];
    return this.auth.currentUser()?.email?.split('@')[0] ?? 'there';
  }

  greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }
}
