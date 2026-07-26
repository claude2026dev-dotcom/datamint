import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DocumentService } from '../../core/services/document.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { DocumentRowComponent } from '../../shared/components/document-row/document-row.component';
import { DocGroup, groupByUploadBatch } from '../../shared/utils/document-groups';
import { SubscriptionStatus } from '../../core/models/models';
import { usageLabel, usagePercent } from '../../shared/utils/plan-usage';

/// The logged-in landing spot ("/") - a working dashboard rather than a bare greeting: quick
/// actions into the two things a returning user does most (upload, browse past documents),
/// an at-a-glance plan usage bar, and a peek at the most recent uploads.
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, DocumentRowComponent],
  template: `
    <div class="dm-container page">
      <h1>{{ greeting() }}, {{ firstName() }} 👋</h1>
      <p class="muted">Here's what's happening with your documents.</p>

      <div class="quick-actions">
        <a routerLink="/upload" class="dm-card quick-card primary">
          <div class="quick-icon"><app-icon name="upload-cloud" [size]="20" /></div>
          <div>
            <strong>Upload documents</strong>
            <p class="muted small">Extract fields from a new PDF or scan</p>
          </div>
        </a>
        <a routerLink="/documents" class="dm-card quick-card">
          <div class="quick-icon"><app-icon name="inbox" [size]="20" /></div>
          <div>
            <strong>My documents</strong>
            <p class="muted small">Browse and re-export past uploads</p>
          </div>
        </a>
        <a routerLink="/field-templates" class="dm-card quick-card">
          <div class="quick-icon"><app-icon name="file-text" [size]="20" /></div>
          <div>
            <strong>Field templates</strong>
            <p class="muted small">Reuse a saved field list</p>
          </div>
        </a>
      </div>

      @if (planStatus?.hasActiveSubscription) {
        <div class="dm-card plan-strip">
          <div class="plan-strip-head">
            <span class="plan-name">{{ planStatus?.planName }} plan</span>
            <a routerLink="/profile/plan" class="manage-link">Manage →</a>
          </div>
          <div class="usage-bar" [attr.aria-label]="usageLabelText()">
            <div class="usage-fill" [style.width.%]="usagePercentValue()"></div>
          </div>
          <p class="muted small">{{ usageLabelText() }}</p>
        </div>
      }

      <div class="recent-head">
        <h2>Recent documents</h2>
        @if (groups.length > 0) { <a routerLink="/documents" class="see-all-link">See all →</a> }
      </div>

      @if (loading) {
        <div class="doc-list">
          @for (i of [1,2]; track i) { <div class="dm-card skeleton"></div> }
        </div>
      } @else if (groups.length === 0) {
        <div class="dm-card empty-state">
          <div class="icon"><app-icon name="inbox" [size]="26" /></div>
          <h3>No documents yet</h3>
          <p class="muted">Upload your first PDF or scan to see it show up here.</p>
          <a routerLink="/upload" class="dm-btn dm-btn-primary"><app-icon name="upload-cloud" [size]="16" /> Upload a document</a>
        </div>
      } @else {
        <div class="doc-list">
          @for (group of groups; track group.batchId) { <app-document-row [group]="group" /> }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    h1 { font-size: 1.7rem; margin-bottom: 6px; }
    h2 { font-size: 1.05rem; margin: 0; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 0; }
    .small { font-size: 0.8rem; }

    .quick-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 24px 0; }
    .quick-card { display: flex; align-items: center; gap: 12px; padding: 18px; text-decoration: none; color: var(--dm-text); transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; }
    .quick-card:hover { transform: translateY(-2px); box-shadow: var(--dm-shadow); border-color: var(--dm-primary); }
    .quick-card.primary { border-color: var(--dm-primary); background: rgba(99,102,241,0.06); }
    .quick-icon { width: 38px; height: 38px; border-radius: 10px; background: var(--dm-gradient-primary); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .quick-card strong { font-size: 0.92rem; }

    .plan-strip { padding: 18px 20px; margin-bottom: 28px; }
    .plan-strip-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .plan-name { font-weight: 700; font-size: 0.95rem; }
    .manage-link { font-size: 0.82rem; color: var(--dm-primary); text-decoration: none; }
    .manage-link:hover { text-decoration: underline; }
    .usage-bar { height: 7px; border-radius: 999px; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); overflow: hidden; margin-bottom: 6px; }
    .usage-fill { height: 100%; background: var(--dm-gradient-primary); transition: width 0.3s ease; }

    .recent-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
    .see-all-link { font-size: 0.85rem; color: var(--dm-primary); text-decoration: none; }
    .see-all-link:hover { text-decoration: underline; }

    .doc-list { display: flex; flex-direction: column; gap: 10px; }
    .skeleton { height: 68px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .empty-state { padding: 36px 28px; text-align: center; }
    .empty-state .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 12px; }
    .empty-state h3 { margin-bottom: 8px; }
    .empty-state p { margin-bottom: 18px; }
    .empty-state .dm-btn { display: inline-flex; align-items: center; gap: 6px; }

    @media (max-width: 760px) { .quick-actions { grid-template-columns: 1fr; } }
  `]
})
export class HomeComponent implements OnInit, OnDestroy {
  // Computed once at construction and otherwise never touched again, so leaving this
  // tab open across an hour boundary (say from 6pm through to 1am) kept showing
  // whatever greeting was true at page load - "Good evening" all night - since nothing
  // was re-evaluating it. A signal + a periodic tick keeps it honest for as long as
  // the tab stays open, no reload required.
  private greetingSignal = signal(this.computeGreeting());
  private greetingTimer?: ReturnType<typeof setInterval>;

  groups: DocGroup[] = [];
  loading = true;
  planStatus: SubscriptionStatus | null = null;

  constructor(
    private auth: AuthService,
    private documentService: DocumentService,
    private subscriptionService: SubscriptionService
  ) {}

  ngOnInit() {
    this.greetingTimer = setInterval(() => this.greetingSignal.set(this.computeGreeting()), 60_000);

    this.documentService.getMine().subscribe({
      next: res => { this.groups = groupByUploadBatch(res.documents).slice(0, 3); this.loading = false; },
      error: () => { this.loading = false; }
    });

    this.subscriptionService.getStatus().subscribe({
      next: res => { this.planStatus = res.status; },
      error: () => {}
    });
  }

  ngOnDestroy() {
    if (this.greetingTimer) clearInterval(this.greetingTimer);
  }

  firstName(): string {
    const name = this.auth.currentUser()?.displayName?.trim();
    if (name) return name.split(/\s+/)[0];
    return this.auth.currentUser()?.email?.split('@')[0] ?? 'there';
  }

  greeting(): string {
    return this.greetingSignal();
  }

  usagePercentValue(): number {
    return usagePercent(this.planStatus);
  }

  usageLabelText(): string {
    return usageLabel(this.planStatus);
  }

  // new Date() always reads the machine's own local clock/timezone (there's no UTC
  // conversion happening, and none is needed) - ranges follow the usual everyday sense
  // of the words rather than a rigid noon/6pm split, so late night genuinely reads as
  // "night" instead of "evening" or "morning".
  private computeGreeting(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 21) return 'Good evening';
    return 'Good night';
  }
}
