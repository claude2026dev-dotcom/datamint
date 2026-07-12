import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';
import { DocumentRowComponent } from '../../shared/components/document-row/document-row.component';
import { DocGroup, groupByUploadBatch } from '../../shared/utils/document-groups';

/// Read-only browsing of everything a user has ever uploaded - the only way back
/// to a past document once you've navigated away from the post-upload review flow,
/// since preview-edit/batch-review are only ever reached right after an upload.
/// Files uploaded together (sharing a DocumentSummary.uploadBatchId) are grouped
/// into one bulk entry here, matching how they were reviewed right after that
/// upload, instead of showing up as unrelated single-file rows.
@Component({
  selector: 'app-documents-list',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, BackButtonComponent, DocumentRowComponent],
  template: `
    <div class="dm-container page">
      <app-back-button />
      <div class="header">
        <div>
          <h1>My documents</h1>
          <p class="muted">Everything you've uploaded, most recent first. Open one to view, edit, or export it.</p>
        </div>
        <a routerLink="/upload" class="dm-btn dm-btn-primary"><app-icon name="upload-cloud" [size]="16" /> Upload new</a>
      </div>

      @if (loading) {
        <div class="doc-list">
          @for (i of [1,2,3,4]; track i) { <div class="dm-card skeleton"></div> }
        </div>
      } @else if (error) {
        <div class="dm-card empty-state">
          <div class="icon"><app-icon name="alert-triangle" [size]="28" /></div>
          <h2>Couldn't load your documents</h2>
          <p class="muted">Please try again.</p>
          <button class="dm-btn dm-btn-primary" (click)="load()">Retry</button>
        </div>
      } @else if (groups.length === 0) {
        <div class="dm-card empty-state">
          <div class="icon"><app-icon name="inbox" [size]="28" /></div>
          <h2>No documents yet</h2>
          <p class="muted">Upload a PDF to see it show up here.</p>
          <a routerLink="/upload" class="dm-btn dm-btn-primary"><app-icon name="upload-cloud" [size]="16" /> Upload your first PDF</a>
        </div>
      } @else {
        <div class="doc-list">
          @for (group of groups; track group.batchId) {
            <app-document-row [group]="group" />
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 6px 0 0; }

    .empty-state { max-width: 460px; margin: 40px auto; padding: 40px 32px; text-align: center; }
    .empty-state .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 14px; }
    .empty-state h2 { margin-bottom: 10px; }
    .empty-state p { margin-bottom: 20px; }

    .doc-list { display: flex; flex-direction: column; gap: 10px; }
    .skeleton { height: 68px; background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  `]
})
export class DocumentsListComponent implements OnInit {
  groups: DocGroup[] = [];
  loading = true;
  error = false;

  constructor(private documentService: DocumentService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.error = false;
    this.documentService.getMine().subscribe({
      next: res => { this.groups = groupByUploadBatch(res.documents); this.loading = false; },
      error: () => { this.loading = false; this.error = true; }
    });
  }
}
