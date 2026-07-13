import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { formatFileSize } from '../../utils/format-file-size';
import {
  DocGroup, totalPages, totalSize, fileNames, groupStatusLabel, groupStatusClass
} from '../../utils/document-groups';

/// One row in a document list - a bulk upload (several files sharing an
/// uploadBatchId) renders as a single grouped row linking to the combined batch
/// review; a lone upload renders as a normal single-file row. Shared between the
/// full "My documents" list and the dashboard's "recent documents" preview so
/// both look and behave identically instead of drifting apart over time.
@Component({
  selector: 'app-document-row',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  template: `
    @if (group.isBulk) {
      <a [routerLink]="['/documents/batch-review']" [queryParams]="{ ids: batchIds() }" class="dm-card doc-row bulk-row">
        <div class="doc-icon bulk-icon"><app-icon name="grid" [size]="20" /></div>
        <div class="doc-info">
          <span class="doc-name">{{ group.documents.length }} files uploaded together</span>
          <span class="doc-meta">
            {{ totalPages(group) }} page(s) total · {{ formatFileSize(totalSize(group)) }} · {{ group.documents[0].createdAtUtc | date:'MMM d, h:mm a' }}
          </span>
          <span class="doc-meta file-names" [title]="fileNames(group)">{{ fileNames(group) }}</span>
        </div>
        <span class="status-badge" [class]="'status-' + groupStatusClass(group)">{{ groupStatusLabel(group) }}</span>
        <app-icon name="arrow-right" [size]="16" class="chevron" />
      </a>
    } @else {
      <a [routerLink]="['/documents', group.documents[0].id, 'review']" class="dm-card doc-row">
        <div class="doc-icon"><app-icon name="file-text" [size]="20" /></div>
        <div class="doc-info">
          <span class="doc-name" [title]="group.documents[0].originalFileName">{{ group.documents[0].originalFileName }}</span>
          <span class="doc-meta">
            {{ group.documents[0].pageCount }} page(s) · {{ formatFileSize(group.documents[0].fileSizeBytes) }} · {{ group.documents[0].createdAtUtc | date:'MMM d, h:mm a' }}
            @if (group.documents[0].requiresOcr) { · OCR }
          </span>
          @if (group.documents[0].status === 'Failed' && group.documents[0].failureReason) {
            <span class="failure-reason">{{ group.documents[0].failureReason }}</span>
          }
        </div>
        <span class="status-badge" [class]="'status-' + group.documents[0].status.toLowerCase()">{{ group.documents[0].status }}</span>
        <app-icon name="arrow-right" [size]="16" class="chevron" />
      </a>
    }
  `,
  styles: [`
    .doc-row {
      display: flex; align-items: center; gap: 14px; padding: 16px 18px; text-decoration: none; color: var(--dm-text);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .doc-row:hover { transform: translateY(-1px); box-shadow: var(--dm-shadow); border-color: var(--dm-primary); }
    .doc-row.bulk-row { border-color: var(--dm-primary); }
    .bulk-icon { color: var(--dm-primary); }

    .doc-icon { color: var(--dm-primary-light); flex-shrink: 0; }
    .doc-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
    .doc-name { font-weight: 600; font-size: 0.94rem; overflow-wrap: break-word; word-break: break-word; }
    .doc-meta { font-size: 0.78rem; color: var(--dm-text-muted); overflow-wrap: break-word; word-break: break-word; }
    .file-names { overflow-wrap: break-word; word-break: break-word; }
    .failure-reason { font-size: 0.78rem; color: var(--dm-danger); overflow-wrap: break-word; word-break: break-word; }

    .status-badge { flex-shrink: 0; font-size: 0.72rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--dm-bg-elevated); color: var(--dm-text-muted); white-space: nowrap; }
    .status-extracted, .status-reviewed { background: rgba(99,102,241,0.14); color: var(--dm-primary-light); }
    .status-exported { background: rgba(52,211,153,0.14); color: var(--dm-success); }
    .status-failed { background: rgba(248,113,113,0.14); color: var(--dm-danger); }
    .status-mixed { background: rgba(251,191,36,0.14); color: var(--dm-warning); }
    .chevron { color: var(--dm-text-muted); flex-shrink: 0; }

    @media (max-width: 560px) {
      .doc-row { flex-wrap: wrap; }
      .doc-info { order: 1; width: 100%; }
      .doc-icon { order: 0; }
      .status-badge { order: 2; }
      .chevron { order: 3; margin-left: auto; }
    }
  `]
})
export class DocumentRowComponent {
  @Input({ required: true }) group!: DocGroup;

  formatFileSize = formatFileSize;
  totalPages = totalPages;
  totalSize = totalSize;
  fileNames = fileNames;
  groupStatusLabel = groupStatusLabel;
  groupStatusClass = groupStatusClass;

  batchIds(): string {
    return this.group.documents.map(d => d.id).join(',');
  }
}
