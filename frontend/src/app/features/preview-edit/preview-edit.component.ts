import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { ExtractedFieldEdit, ExportFormat, ExportLayout } from '../../core/models/models';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';
import { ExportModalComponent, EmailModalResult } from '../../shared/components/export-modal/export-modal.component';
import { FieldSectionEditorComponent } from '../../shared/components/field-section-editor/field-section-editor.component';
import { FieldColumnsEditorComponent } from '../../shared/components/field-columns-editor/field-columns-editor.component';

@Component({
  selector: 'app-preview-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, ExportModalComponent,
            FieldSectionEditorComponent, FieldColumnsEditorComponent],
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
          <p class="muted">{{ pageCount }} page(s)</p>
        </div>
        <div class="actions">
          <div class="view-toggle">
            <button type="button" class="view-option" [class.active]="viewMode === 'rows'" (click)="viewMode = 'rows'">Rows</button>
            <button type="button" class="view-option" [class.active]="viewMode === 'columns'" (click)="viewMode = 'columns'">Columns</button>
          </div>
          <button class="dm-btn dm-btn-ghost" [disabled]="exporting" (click)="downloadExport('Excel')"><app-icon name="file-text" [size]="15" /> Excel</button>
          <button class="dm-btn dm-btn-ghost" [disabled]="exporting" (click)="downloadExport('Json')">{{ '{ }' }} JSON</button>
          <button class="dm-btn dm-btn-primary" (click)="emailModalOpen = !emailModalOpen"><app-icon name="inbox" [size]="15" /> Email</button>
        </div>
      </div>

      @if (emailModalOpen) {
        <app-export-modal [busy]="emailBusy" (confirmed)="onEmailConfirmed($event)" (cancelled)="emailModalOpen = false" />
      }

      @if (viewMode === 'rows') {
        <app-field-section-editor [fields]="fields" (fieldSaved)="saveField($event)"
                                   (includeToggled)="toggleInclude($event)" (reordered)="onReordered($event)"
                                   (sectionRenamed)="onSectionRenamed($event)" />
      } @else {
        <app-field-columns-editor [documents]="[{ id: documentId, fileName: fileName, fields: fields }]"
                                   (fieldSaved)="saveField($event.field)" />
      }
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .actions .dm-btn { display: inline-flex; align-items: center; gap: 6px; }
    .view-toggle { display: flex; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); overflow: hidden; }
    .view-option { padding: 8px 14px; font-size: 0.82rem; font-weight: 600; background: var(--dm-surface); color: var(--dm-text-muted); border: none; cursor: pointer; }
    .view-option.active { background: var(--dm-gradient-primary); color: white; }
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
  fields: ExtractedFieldEdit[] = [];
  viewMode: 'rows' | 'columns' = 'rows';
  emailModalOpen = false;
  emailBusy = false;
  exporting = false;
  loading = true;
  notFound = false;

  constructor(private route: ActivatedRoute, private documentService: DocumentService, private toast: ToastService) {}

  ngOnInit() {
    this.documentId = this.route.snapshot.paramMap.get('id')!;
    this.documentService.getDetail(this.documentId).subscribe({
      next: res => {
        this.fileName = res.originalFileName;
        this.pageCount = res.pageCount;
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

  /// Export/download never re-asks anything - it uses whatever layout is already on screen
  /// (Rows/Columns) right now, matching what the user is already looking at.
  downloadExport(format: ExportFormat) {
    this.exporting = true;
    const layout: ExportLayout = this.viewMode === 'columns' ? 'ColumnsPerField' : 'RowsPerField';
    this.documentService.exportDocument(this.documentId, { format, layout }).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = format === 'Json' ? 'json' : 'xlsx';
        a.download = `${this.fileName.replace(/\.[^.]+$/, '')}-export.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.exporting = false;
        this.toast.success('Export downloaded.');
      },
      error: () => { this.exporting = false; this.toast.error('Could not export. Please try again.'); }
    });
  }

  onEmailConfirmed(result: EmailModalResult) {
    this.emailBusy = true;
    const layout: ExportLayout = this.viewMode === 'columns' ? 'ColumnsPerField' : 'RowsPerField';
    this.documentService.sendEmail(this.documentId, result.toAddress, result.cc, undefined, { format: result.format, layout }).subscribe({
      next: () => { this.toast.success('Export emailed successfully.'); this.emailModalOpen = false; this.emailBusy = false; },
      error: () => { this.toast.error('Could not send that email. Please try again.'); this.emailBusy = false; }
    });
  }
}
