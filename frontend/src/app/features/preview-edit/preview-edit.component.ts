import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { ExtractedFieldEdit } from '../../core/models/models';

@Component({
  selector: 'app-preview-edit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dm-container page">
      <div class="header">
        <div>
          <h1>{{ fileName }}</h1>
          <p class="muted">{{ pageCount }} page(s) · {{ requiresOcr ? 'OCR applied' : 'Text extracted directly' }}</p>
        </div>
        <div class="actions">
          <button class="dm-btn dm-btn-ghost" (click)="exportExcel()">⬇ Export Excel</button>
          <button class="dm-btn dm-btn-primary" (click)="showEmailBox = !showEmailBox">✉ Email export</button>
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

      @for (page of pageNumbers; track page) {
        <div class="dm-card page-block">
          <h3>Page {{ page === 0 ? '— (document level)' : page }}</h3>
          <div class="field-grid">
            @for (field of fieldsForPage(page); track field.id) {
              <div class="field-row">
                <input class="dm-input field-key" [(ngModel)]="field.fieldKey" (blur)="saveField(field)"
                       title="Rename this field — the name used when exporting to Excel" />
                <input class="dm-input" [(ngModel)]="field.fieldValue" (blur)="saveField(field)" />
                @if (field.wasEditedByUser) { <span class="edited-badge">edited</span> }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 40px 0 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .actions { display: flex; gap: 10px; }
    .email-box { display: flex; gap: 10px; padding: 16px; margin-bottom: 20px; }
    .page-block { padding: 20px; margin-bottom: 18px; }
    .field-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 12px; }
    .field-row { display: flex; flex-direction: column; gap: 6px; position: relative; }
    .field-key { font-size: 0.8rem; color: var(--dm-text-muted); border: none; background: transparent; padding: 2px 4px; }
    .field-key:hover, .field-key:focus { border: 1px solid var(--dm-border); background: var(--dm-surface); }
    .edited-badge { position: absolute; top: 0; right: 0; font-size: 0.7rem; color: var(--dm-accent); }
    @media (max-width: 700px) { .field-grid { grid-template-columns: 1fr; } .header { flex-direction: column; } }
  `]
})
export class PreviewEditComponent implements OnInit {
  documentId = '';
  fileName = '';
  pageCount = 0;
  requiresOcr = false;
  fields: ExtractedFieldEdit[] = [];
  showEmailBox = false;
  emailAddress = '';
  sendingEmail = false;

  constructor(private route: ActivatedRoute, private documentService: DocumentService, private toast: ToastService) {}

  get pageNumbers(): number[] {
    const nums = new Set(this.fields.map(f => f.pageNumber ?? 0));
    return Array.from(nums).sort((a, b) => a - b);
  }

  fieldsForPage(page: number) {
    return this.fields.filter(f => (f.pageNumber ?? 0) === page);
  }

  ngOnInit() {
    this.documentId = this.route.snapshot.paramMap.get('id')!;
    this.documentService.getDetail(this.documentId).subscribe(res => {
      this.fileName = res.originalFileName;
      this.pageCount = res.pageCount;
      this.requiresOcr = res.requiresOcr;
      this.fields = res.fields;
    });
  }

  saveField(field: ExtractedFieldEdit) {
    this.documentService.updateField(this.documentId, field.id, field.fieldValue ?? '', field.fieldKey).subscribe({
      next: () => { field.wasEditedByUser = true; },
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  exportExcel() {
    this.documentService.exportExcel(this.documentId).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.fileName.replace('.pdf', '')}-export.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      this.toast.success('Excel file downloaded.');
    });
  }

  sendEmail() {
    if (!this.emailAddress) return;
    this.sendingEmail = true;
    this.documentService.sendEmail(this.documentId, this.emailAddress).subscribe({
      next: () => { this.toast.success('Export emailed successfully.'); this.showEmailBox = false; this.sendingEmail = false; },
      error: () => this.sendingEmail = false
    });
  }
}
