import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { BatchExportMode, ExtractedFieldEdit } from '../../core/models/models';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';
import { AutoGrowDirective } from '../../shared/directives/auto-grow.directive';

interface BatchDocument {
  id: string;
  fileName: string;
  fields: ExtractedFieldEdit[];
}

/// Shown instead of the single-document preview when several files were uploaded
/// together: one card per document, each with the same page-grouped field editor
/// as the single-document review page (original label, editable label, editable
/// value) - a table-of-many-columns doesn't survive mobile widths, so this never
/// tries to be one.
@Component({
  selector: 'app-batch-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, AutoGrowDirective],
  template: `
    <div class="dm-container page">
      <app-back-button fallbackUrl="/documents" />
      @if (notFound) {
        <div class="dm-card not-found-card">
          <div class="icon"><app-icon name="search" [size]="28" /></div>
          <h2>Some of these documents aren't available</h2>
          <p class="muted">We couldn't find one or more documents in this batch. They may have been removed, or the link may be incorrect.</p>
          <a routerLink="/" class="dm-btn dm-btn-primary">Back to home</a>
        </div>
      } @else {
      <div class="header">
        <div>
          <h1>Combined preview — {{ documents.length }} file(s)</h1>
          <p class="muted">Edit any field below. Each file keeps its own labels and values.</p>
        </div>
        <div class="actions">
          <button class="dm-btn dm-btn-ghost" (click)="openExportChooser('download')" [disabled]="loading">⬇ Export Excel</button>
          <button class="dm-btn dm-btn-primary" (click)="openExportChooser('email')" [disabled]="loading">✉ Email export</button>
        </div>
      </div>

      @if (exportChooserFor) {
        <div class="dm-card export-chooser">
          <h3>How should these {{ documents.length }} files be exported?</h3>
          <div class="mode-options">
            <label class="mode-option" [class.active]="exportMode === 'SingleSheet'">
              <input type="radio" name="exportMode" value="SingleSheet" [(ngModel)]="exportMode" />
              <div>
                <strong>One combined sheet</strong>
                <p class="muted small">A single table — one row per file, one column per field.</p>
              </div>
            </label>
            <label class="mode-option" [class.active]="exportMode === 'MultipleSheets'">
              <input type="radio" name="exportMode" value="MultipleSheets" [(ngModel)]="exportMode" />
              <div>
                <strong>One workbook, separate sheets</strong>
                <p class="muted small">A single .xlsx file with one tab per document.</p>
              </div>
            </label>
            <label class="mode-option" [class.active]="exportMode === 'SeparateFiles'">
              <input type="radio" name="exportMode" value="SeparateFiles" [(ngModel)]="exportMode" />
              <div>
                <strong>Separate files</strong>
                <p class="muted small">A .zip with one standalone spreadsheet per document.</p>
              </div>
            </label>
          </div>

          @if (exportChooserFor === 'email') {
            <div class="field email-field">
              <label>Send to</label>
              <input class="dm-input" type="email" [(ngModel)]="emailAddress" placeholder="recipient@company.com" />
            </div>
          }

          <div class="chooser-actions">
            <button class="dm-btn dm-btn-ghost" (click)="exportChooserFor = null">Cancel</button>
            @if (exportChooserFor === 'download') {
              <button class="dm-btn dm-btn-primary" (click)="exportExcel()" [disabled]="exporting">{{ exporting ? 'Exporting…' : 'Export' }}</button>
            } @else {
              <button class="dm-btn dm-btn-primary" (click)="sendEmail()" [disabled]="sendingEmail || !emailAddress">{{ sendingEmail ? 'Sending…' : 'Send' }}</button>
            }
          </div>
        </div>
      }

      @if (loading) {
        <p class="muted">Loading documents…</p>
      } @else {
        @for (doc of documents; track doc.id) {
          <div class="dm-card doc-card">
            <div class="doc-card-head">
              <app-icon name="file-text" [size]="17" />
              <span class="doc-name" [title]="doc.fileName">{{ doc.fileName }}</span>
              <span class="muted small">{{ doc.fields.length }} field(s)</span>
            </div>

            @for (page of pageNumbers(doc); track page) {
              <div class="page-block">
                @if (pageNumbers(doc).length > 1) { <h4>Page {{ page === 0 ? '— (document level)' : page }}</h4> }
                <div class="field-grid">
                  @for (field of fieldsForPage(doc, page); track field.id) {
                    <div class="field-row">
                      <div class="original-label" [title]="'Detected label: ' + field.originalFieldKey">{{ field.originalFieldKey }}</div>
                      <input class="dm-input field-key" [(ngModel)]="field.fieldKey" (blur)="saveField(doc, field)"
                             placeholder="Custom field name" title="Rename this field — used when exporting to Excel" />
                      <textarea class="dm-input field-value" rows="1" appAutoGrow [(ngModel)]="field.fieldValue" (blur)="saveField(doc, field)"></textarea>
                      @if (field.wasEditedByUser) { <span class="edited-badge">edited</span> }
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      }
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .small { font-size: 0.8rem; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .not-found-card { max-width: 460px; margin: 60px auto; padding: 40px 32px; text-align: center; }
    .not-found-card .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 14px; }
    .not-found-card h2 { margin-bottom: 10px; }
    .not-found-card p { margin-bottom: 20px; }

    .export-chooser { padding: 20px; margin-bottom: 22px; }
    .export-chooser h3 { font-size: 0.98rem; margin-bottom: 14px; }
    .mode-options { display: flex; flex-direction: column; gap: 4px; }
    .mode-option { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: var(--dm-radius-sm); cursor: pointer; border: 1px solid transparent; }
    .mode-option:hover { background: var(--dm-surface-hover); }
    .mode-option.active { border-color: var(--dm-primary); background: rgba(99,102,241,0.08); }
    .mode-option input[type="radio"] { margin-top: 4px; accent-color: var(--dm-primary); flex-shrink: 0; }
    .mode-option strong { font-size: 0.9rem; }
    .email-field { margin-top: 14px; }
    .email-field label { display: block; font-size: 0.82rem; color: var(--dm-text-muted); margin-bottom: 6px; }
    .chooser-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--dm-border); }

    .doc-card { padding: 20px; margin-bottom: 18px; }
    .doc-card-head { display: flex; align-items: center; gap: 8px; padding-bottom: 14px; margin-bottom: 6px; border-bottom: 1px solid var(--dm-border); }
    .doc-card-head app-icon { color: var(--dm-text-muted); flex-shrink: 0; }
    .doc-name { font-weight: 700; overflow-wrap: break-word; word-break: break-word; flex: 1; min-width: 0; }
    .page-block { margin-top: 14px; }
    .page-block h4 { font-size: 0.82rem; color: var(--dm-text-muted); margin-bottom: 8px; }
    .field-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .field-row { display: flex; flex-direction: column; gap: 4px; position: relative; min-width: 0; }
    .original-label { font-size: 0.72rem; color: var(--dm-text-muted); text-transform: uppercase; letter-spacing: 0.03em; padding: 0 4px; overflow-wrap: break-word; word-break: break-word; }
    .field-key { font-size: 0.85rem; font-weight: 600; border: none; background: transparent; padding: 2px 4px; margin-bottom: 2px; }
    .field-key:hover, .field-key:focus { border: 1px solid var(--dm-border); background: var(--dm-surface); }
    .field-value { resize: vertical; min-height: 42px; line-height: 1.4; font-family: inherit; overflow-wrap: break-word; }
    .edited-badge { position: absolute; top: 0; right: 0; font-size: 0.7rem; color: var(--dm-accent); }

    @media (max-width: 700px) {
      .header { flex-direction: column; }
      .field-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class BatchReviewComponent implements OnInit {
  documents: BatchDocument[] = [];
  loading = true;
  notFound = false;

  exportChooserFor: 'download' | 'email' | null = null;
  exportMode: BatchExportMode = 'SingleSheet';
  emailAddress = '';
  exporting = false;
  sendingEmail = false;

  private lastSaved: Record<string, { key: string; value: string | null }> = {};

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
        for (const doc of this.documents) {
          for (const f of doc.fields) this.lastSaved[f.id] = { key: f.fieldKey, value: f.fieldValue };
        }
        this.loading = false;
      },
      error: () => { this.loading = false; this.notFound = true; }
    });
  }

  pageNumbers(doc: BatchDocument): number[] {
    const nums = new Set(doc.fields.map(f => f.pageNumber ?? 0));
    return Array.from(nums).sort((a, b) => a - b);
  }

  fieldsForPage(doc: BatchDocument, page: number) {
    return doc.fields.filter(f => (f.pageNumber ?? 0) === page);
  }

  saveField(doc: BatchDocument, field: ExtractedFieldEdit) {
    const previous = this.lastSaved[field.id];
    if (previous && previous.key === field.fieldKey && previous.value === field.fieldValue) return;

    this.documentService.updateField(doc.id, field.id, field.fieldValue ?? '', field.fieldKey).subscribe({
      next: res => {
        field.wasEditedByUser = res.field.wasEditedByUser;
        field.fieldKey = res.field.fieldKey;
        field.fieldValue = res.field.fieldValue;
        this.lastSaved[field.id] = { key: field.fieldKey, value: field.fieldValue };
      },
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  openExportChooser(target: 'download' | 'email') {
    this.exportChooserFor = this.exportChooserFor === target ? null : target;
  }

  exportExcel() {
    this.exporting = true;
    this.documentService.batchExport(this.documents.map(d => d.id), this.exportMode).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.exportMode === 'SeparateFiles' ? 'datamint-batch-export.zip' : 'datamint-batch-export.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        this.exporting = false;
        this.exportChooserFor = null;
        this.toast.success('Export downloaded.');
      },
      error: () => { this.exporting = false; this.toast.error('Could not export. Please try again.'); }
    });
  }

  sendEmail() {
    if (!this.emailAddress) return;
    this.sendingEmail = true;
    this.documentService.batchSendEmail(this.documents.map(d => d.id), this.emailAddress, this.exportMode).subscribe({
      next: () => {
        this.toast.success('Export emailed successfully.');
        this.exportChooserFor = null;
        this.sendingEmail = false;
      },
      error: () => this.sendingEmail = false
    });
  }
}
