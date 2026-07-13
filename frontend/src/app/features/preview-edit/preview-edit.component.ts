import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { ExtractedFieldEdit } from '../../core/models/models';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';
import { ExportModalComponent, ExportModalResult } from '../../shared/components/export-modal/export-modal.component';
import { FieldSectionEditorComponent } from '../../shared/components/field-section-editor/field-section-editor.component';

@Component({
  selector: 'app-preview-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, ExportModalComponent, FieldSectionEditorComponent],
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

      <app-field-section-editor [fields]="fields" (fieldSaved)="saveField($event)"
                                 (includeToggled)="toggleInclude($event)" (reordered)="onReordered($event)"
                                 (sectionRenamed)="onSectionRenamed($event)" />
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
    @media (max-width: 700px) { .header { flex-direction: column; } }
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

  ngOnInit() {
    this.documentId = this.route.snapshot.paramMap.get('id')!;
    this.documentService.getDetail(this.documentId).subscribe({
      next: res => {
        this.fileName = res.originalFileName;
        this.pageCount = res.pageCount;
        this.requiresOcr = res.requiresOcr;
        this.fields = res.fields;
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
    this.documentService.updateField(this.documentId, field.id, field.fieldValue ?? '', field.fieldKey).subscribe({
      next: res => {
        field.wasEditedByUser = res.field.wasEditedByUser;
        field.fieldKey = res.field.fieldKey;
        field.fieldValue = res.field.fieldValue;
      },
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  toggleInclude(field: ExtractedFieldEdit) {
    this.documentService.updateField(this.documentId, field.id, field.fieldValue ?? '', field.fieldKey, field.includeInExport).subscribe({
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  onReordered(fields: ExtractedFieldEdit[]) {
    const payload = fields.map(f => ({ fieldId: f.id, sectionLabel: f.sectionLabel, sortOrder: f.sortOrder }));
    this.documentService.reorderFields(this.documentId, payload).subscribe({
      error: () => this.toast.error('Could not save the new order. Please try again.')
    });
  }

  onSectionRenamed(event: { oldLabel: string; newLabel: string }) {
    this.documentService.renameSection(this.documentId, event.oldLabel, event.newLabel).subscribe({
      error: () => this.toast.error('Could not rename that section. Please try again.')
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
