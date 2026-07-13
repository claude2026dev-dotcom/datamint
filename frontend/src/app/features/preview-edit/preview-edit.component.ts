import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { ExtractedFieldEdit } from '../../core/models/models';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';
import { AutoGrowDirective } from '../../shared/directives/auto-grow.directive';
import { ExportModalComponent, ExportModalResult } from '../../shared/components/export-modal/export-modal.component';

@Component({
  selector: 'app-preview-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, AutoGrowDirective, ExportModalComponent],
  template: `
    <div class="dm-container page">
      <app-back-button fallbackUrl="/documents" />
      @if (notFound) {
        <div class="dm-card not-found-card">
          <div class="icon"><app-icon name="search" [size]="28" /></div>
          <h2>Document not found</h2>
          <p class="muted">We couldn't find that document. It may have been removed, or the link may be incorrect.</p>
          <a routerLink="/" class="dm-btn dm-btn-primary">Back to home</a>
        </div>
      } @else if (loading) {
        <p class="muted">Loading…</p>
      } @else {
      <div class="header">
        <div>
          <h1>{{ fileName }}</h1>
          <p class="muted">{{ pageCount }} page(s) · {{ requiresOcr ? 'OCR applied' : 'Text extracted directly' }}</p>
        </div>
        <div class="actions">
          <button class="dm-btn dm-btn-ghost" (click)="openExportModal('download')">⬇ Export</button>
          <button class="dm-btn dm-btn-primary" (click)="openExportModal('email')">✉ Email export</button>
        </div>
      </div>

      @if (exportModalFor) {
        <app-export-modal [action]="exportModalFor" [busy]="exportBusy"
                           (confirmed)="onExportConfirmed($event)" (cancelled)="exportModalFor = null" />
      }

      @for (page of pageNumbers; track page) {
        <div class="dm-card page-block">
          <h3>Page {{ page === 0 ? '— (document level)' : page }}</h3>
          <div class="field-grid">
            @for (field of fieldsForPage(page); track field.id) {
              <div class="field-row">
                <div class="original-label" [title]="'Detected label: ' + field.originalFieldKey">{{ field.originalFieldKey }}</div>
                <input class="dm-input field-key" [(ngModel)]="field.fieldKey" (blur)="saveField(field)"
                       placeholder="Custom field name" title="Rename this field — used when exporting to Excel" />
                <textarea class="dm-input field-value" rows="1" appAutoGrow [(ngModel)]="field.fieldValue" (blur)="saveField(field)"></textarea>
                @if (field.wasEditedByUser) { <span class="edited-badge">edited</span> }
              </div>
            }
          </div>
        </div>
      }
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .actions { display: flex; gap: 10px; }
    .not-found-card { max-width: 460px; margin: 60px auto; padding: 40px 32px; text-align: center; }
    .not-found-card .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 14px; }
    .not-found-card h2 { margin-bottom: 10px; }
    .not-found-card p { margin-bottom: 20px; }
    .page-block { padding: 20px; margin-bottom: 18px; }
    .field-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 12px; }
    .field-row { display: flex; flex-direction: column; gap: 4px; position: relative; }
    .original-label { font-size: 0.72rem; color: var(--dm-text-muted); text-transform: uppercase; letter-spacing: 0.03em; padding: 0 4px; }
    .field-key { font-size: 0.85rem; font-weight: 600; border: none; background: transparent; padding: 2px 4px; margin-bottom: 2px; }
    .field-key:hover, .field-key:focus { border: 1px solid var(--dm-border); background: var(--dm-surface); }
    /* A long value (an address, a description) needs to wrap and stay readable
       instead of scrolling off inside a single-line box - resize: vertical lets
       the user grow it further if two lines still aren't enough. */
    .field-value { resize: vertical; min-height: 42px; line-height: 1.4; font-family: inherit; overflow-wrap: break-word; }
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
  exportModalFor: 'download' | 'email' | null = null;
  exportBusy = false;
  loading = true;
  notFound = false;

  constructor(private route: ActivatedRoute, private documentService: DocumentService, private toast: ToastService) {}

  get pageNumbers(): number[] {
    const nums = new Set(this.fields.map(f => f.pageNumber ?? 0));
    return Array.from(nums).sort((a, b) => a - b);
  }

  fieldsForPage(page: number) {
    return this.fields.filter(f => (f.pageNumber ?? 0) === page);
  }

  // Snapshot of each field's key/value as last saved (or as loaded) - lets saveField
  // tell "the user actually changed this" apart from "this input was merely clicked
  // into and blurred", which used to save (and mark "edited") on every blur regardless.
  private lastSaved: Record<string, { key: string; value: string | null }> = {};

  ngOnInit() {
    this.documentId = this.route.snapshot.paramMap.get('id')!;
    this.documentService.getDetail(this.documentId).subscribe({
      next: res => {
        this.fileName = res.originalFileName;
        this.pageCount = res.pageCount;
        this.requiresOcr = res.requiresOcr;
        this.fields = res.fields;
        for (const f of this.fields) this.lastSaved[f.id] = { key: f.fieldKey, value: f.fieldValue };
        this.loading = false;
      },
      // 404 here means "doesn't exist, or belongs to someone else's account" -
      // the API deliberately doesn't distinguish the two (see backend comment
      // on GetOwnedDocumentAsync). A 401/LOGIN_REQUIRED is handled globally by
      // the error interceptor, which redirects to /login before this fires.
      error: () => { this.loading = false; this.notFound = true; }
    });
  }

  saveField(field: ExtractedFieldEdit) {
    const previous = this.lastSaved[field.id];
    if (previous && previous.key === field.fieldKey && previous.value === field.fieldValue) return;

    this.documentService.updateField(this.documentId, field.id, field.fieldValue ?? '', field.fieldKey).subscribe({
      next: res => {
        field.wasEditedByUser = res.field.wasEditedByUser;
        field.fieldKey = res.field.fieldKey;
        field.fieldValue = res.field.fieldValue;
        this.lastSaved[field.id] = { key: field.fieldKey, value: field.fieldValue };
      },
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  openExportModal(action: 'download' | 'email') {
    this.exportModalFor = this.exportModalFor === action ? null : action;
  }

  onExportConfirmed(result: ExportModalResult) {
    this.exportBusy = true;
    if (result.toAddress) {
      this.documentService.sendEmail(this.documentId, result.toAddress, undefined, result.options).subscribe({
        next: () => { this.toast.success('Export emailed successfully.'); this.exportModalFor = null; this.exportBusy = false; },
        error: () => { this.toast.error('Could not send that email. Please try again.'); this.exportBusy = false; }
      });
      return;
    }

    this.documentService.exportDocument(this.documentId, result.options).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = result.options.format === 'Json' ? 'json' : 'xlsx';
        a.download = `${this.fileName.replace(/\.[^.]+$/, '')}-export.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.exportModalFor = null;
        this.exportBusy = false;
        this.toast.success('Export downloaded.');
      },
      error: () => { this.exportBusy = false; this.toast.error('Could not export. Please try again.'); }
    });
  }
}
