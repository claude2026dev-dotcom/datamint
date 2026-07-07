import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { ExtractedFieldEdit } from '../../core/models/models';

interface BatchDocument {
  id: string;
  fileName: string;
  fields: ExtractedFieldEdit[];
}

/// Shown instead of the single-document preview when several files were uploaded
/// together: one combined table, columns = every distinct field key seen across
/// the batch (first-seen order), rows = documents. Editing a cell edits that one
/// field on that one document — same underlying PUT as the single-document view.
@Component({
  selector: 'app-batch-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="dm-container page">
      @if (notFound) {
        <div class="dm-card not-found-card">
          <div class="icon">🔍</div>
          <h2>Some of these documents aren't available</h2>
          <p class="muted">One or more links in this batch don't point to documents we can show you — they may not exist, or belong to someone else's account.</p>
          <a routerLink="/upload" class="dm-btn dm-btn-primary">Upload new PDFs</a>
        </div>
      } @else {
      <div class="header">
        <div>
          <h1>Combined preview — {{ documents.length }} file(s)</h1>
          <p class="muted">Edit any cell below. Blank cells mean that field wasn't found in that document.</p>
        </div>
        <div class="actions">
          <button class="dm-btn dm-btn-ghost" (click)="exportExcel()" [disabled]="loading">⬇ Export Excel</button>
          <button class="dm-btn dm-btn-primary" (click)="showEmailBox = !showEmailBox" [disabled]="loading">✉ Email export</button>
        </div>
      </div>

      @if (showEmailBox) {
        <div class="dm-card email-box">
          <input class="dm-input" type="email" [(ngModel)]="emailAddress" placeholder="recipient@company.com" />
          <button class="dm-btn dm-btn-primary" (click)="sendEmail()" [disabled]="sendingEmail">
            {{ sendingEmail ? 'Sending…' : 'Send' }}
          </button>
        </div>
      }

      @if (loading) {
        <p class="muted">Loading documents…</p>
      } @else {
        <div class="dm-card table-wrap">
          <table class="batch-table">
            <thead>
              <tr>
                <th class="file-col">File</th>
                @for (col of columns; track col) { <th>{{ col }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (doc of documents; track doc.id) {
                <tr>
                  <td class="file-col" [title]="doc.fileName">{{ doc.fileName }}</td>
                  @for (col of columns; track col) {
                    <td>
                      @if (fieldFor(doc, col); as field) {
                        <input class="dm-input cell-input" [(ngModel)]="field.fieldValue" (blur)="saveField(doc, field)" />
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      }
    </div>
  `,
  styles: [`
    .page { padding: 40px 0 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .actions { display: flex; gap: 10px; }
    .email-box { display: flex; gap: 10px; padding: 16px; margin-bottom: 20px; }
    .not-found-card { max-width: 460px; margin: 60px auto; padding: 40px 32px; text-align: center; }
    .not-found-card .icon { font-size: 2.6rem; margin-bottom: 14px; }
    .not-found-card h2 { margin-bottom: 10px; }
    .not-found-card p { margin-bottom: 20px; }
    .table-wrap { padding: 0; overflow-x: auto; }
    .batch-table { border-collapse: collapse; width: 100%; min-width: max-content; }
    .batch-table th, .batch-table td { padding: 10px 14px; border-bottom: 1px solid var(--dm-border); text-align: left; white-space: nowrap; }
    .batch-table th { font-size: 0.78rem; color: var(--dm-text-muted); text-transform: uppercase; letter-spacing: 0.03em; background: var(--dm-surface); position: sticky; top: 0; }
    .file-col { position: sticky; left: 0; background: var(--dm-surface); max-width: 220px; overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem; }
    .cell-input { min-width: 140px; }
    @media (max-width: 700px) { .header { flex-direction: column; } }
  `]
})
export class BatchReviewComponent implements OnInit {
  documents: BatchDocument[] = [];
  columns: string[] = [];
  loading = true;
  notFound = false;
  showEmailBox = false;
  emailAddress = '';
  sendingEmail = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private documentService: DocumentService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    const idsParam = this.route.snapshot.queryParamMap.get('ids');
    const ids = idsParam ? idsParam.split(',').filter(Boolean) : [];
    if (ids.length === 0) { this.router.navigateByUrl('/upload'); return; }

    forkJoin(ids.map(id => this.documentService.getDetail(id))).subscribe({
      next: results => {
        this.documents = results.map(res => ({ id: res.id, fileName: res.originalFileName, fields: res.fields }));

        const seen = new Set<string>();
        for (const doc of this.documents) {
          for (const field of doc.fields) {
            if (!seen.has(field.fieldKey)) { seen.add(field.fieldKey); this.columns.push(field.fieldKey); }
          }
        }
        this.loading = false;
      },
      error: () => { this.loading = false; this.notFound = true; }
    });
  }

  fieldFor(doc: BatchDocument, column: string): ExtractedFieldEdit | undefined {
    return doc.fields.find(f => f.fieldKey === column);
  }

  saveField(doc: BatchDocument, field: ExtractedFieldEdit) {
    this.documentService.updateField(doc.id, field.id, field.fieldValue ?? '', field.fieldKey).subscribe({
      next: () => { field.wasEditedByUser = true; },
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  exportExcel() {
    this.documentService.batchExport(this.documents.map(d => d.id)).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'datamint-batch-export.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      this.toast.success('Excel file downloaded.');
    });
  }

  sendEmail() {
    if (!this.emailAddress) return;
    this.sendingEmail = true;
    this.documentService.batchSendEmail(this.documents.map(d => d.id), this.emailAddress).subscribe({
      next: () => { this.toast.success('Export emailed successfully.'); this.showEmailBox = false; this.sendingEmail = false; },
      error: () => this.sendingEmail = false
    });
  }
}
