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
import { FieldCardEditorComponent, FieldCardEvent, FieldCardReorderEvent, FieldCardSectionRenameEvent } from '../../shared/components/field-card-editor/field-card-editor.component';
import { FieldTableViewComponent } from '../../shared/components/field-table-view/field-table-view.component';
import { FieldJsonViewComponent } from '../../shared/components/field-json-view/field-json-view.component';

/// A document's review is two distinct steps, not one screen doing both: "Edit" (the default
/// landing view - a card-based editor, never a spreadsheet grid) is where corrections actually
/// happen, and "Preview & Export" is a separate step for choosing Rows/Columns layout and
/// downloading/emailing - so the export-shape controls don't clutter the screen while someone is
/// just fixing a value.
@Component({
  selector: 'app-preview-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, ExportModalComponent,
            FieldCardEditorComponent, FieldTableViewComponent, FieldJsonViewComponent],
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
        <div class="mode-toggle">
          <button type="button" class="mode-option" [class.active]="mode === 'edit'" (click)="mode = 'edit'">
            <app-icon name="edit" [size]="16" />
            <span><strong>Edit</strong><small>Fix values, types, sections</small></span>
          </button>
          <button type="button" class="mode-option" [class.active]="mode === 'preview'" (click)="mode = 'preview'">
            <app-icon name="grid" [size]="16" />
            <span><strong>Preview &amp; export</strong><small>Download or email</small></span>
          </button>
        </div>
      </div>

      @if (mode === 'edit') {
        <app-field-card-editor [documents]="[{ id: documentId, fileName: fileName, fields: fields }]"
                                (fieldSaved)="saveField($event)" (includeToggled)="toggleInclude($event)"
                                (reordered)="onReordered($event)" (sectionRenamed)="onSectionRenamed($event)" />
      } @else {
        <div class="toolbar">
          <div class="toggle-group">
            <div class="view-toggle">
              <button type="button" class="view-option" [class.active]="previewKind === 'table'" (click)="previewKind = 'table'">Table</button>
              <button type="button" class="view-option" [class.active]="previewKind === 'json'" (click)="previewKind = 'json'">{{ '{ }' }} JSON</button>
            </div>
            @if (previewKind === 'table') {
              <div class="view-toggle">
                <button type="button" class="view-option" [class.active]="viewMode === 'rows'" (click)="viewMode = 'rows'">Rows</button>
                <button type="button" class="view-option" [class.active]="viewMode === 'columns'" (click)="viewMode = 'columns'">Columns</button>
              </div>
            }
          </div>
          <div class="actions">
            <button class="dm-btn dm-btn-ghost btn-excel" [disabled]="exporting" (click)="downloadExport('Excel')" title="Download as an Excel spreadsheet">
              <app-icon name="file-text" [size]="15" /> Excel
            </button>
            <button class="dm-btn dm-btn-ghost btn-json" [disabled]="exporting" (click)="downloadExport('Json')" title="Download as a structured JSON file">
              {{ '{ }' }} JSON
            </button>
            <button class="dm-btn dm-btn-primary" (click)="emailModalOpen = !emailModalOpen" title="Email this export to someone">
              <app-icon name="inbox" [size]="15" /> Email
            </button>
          </div>
        </div>

        @if (emailModalOpen) {
          <app-export-modal [busy]="emailBusy" (confirmed)="onEmailConfirmed($event)" (cancelled)="emailModalOpen = false" />
        }

        @if (previewKind === 'json') {
          <app-field-json-view [documents]="[{ id: documentId, fileName: fileName, fields: fields }]" [pageCounts]="pageCounts" />
        } @else {
          <app-field-table-view [documents]="[{ id: documentId, fileName: fileName, fields: fields }]" [viewMode]="viewMode" />
        }
      }
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .actions .dm-btn { display: inline-flex; align-items: center; gap: 6px; }

    .mode-toggle { display: flex; gap: 6px; padding: 6px; border-radius: var(--dm-radius-lg); background: var(--dm-surface); border: 1px solid var(--dm-border); flex-wrap: wrap; }
    .mode-option { display: inline-flex; align-items: center; gap: 10px; padding: 10px 18px; background: transparent; color: var(--dm-text-muted); border: 1px solid transparent; border-radius: var(--dm-radius-sm); cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; white-space: nowrap; text-align: left; }
    .mode-option span { display: flex; flex-direction: column; gap: 1px; }
    .mode-option strong { font-size: 0.9rem; font-weight: 700; }
    .mode-option small { font-size: 0.7rem; font-weight: 500; opacity: 0.85; }
    .mode-option:hover { color: var(--dm-text); border-color: var(--dm-border); }
    .mode-option.active { background: var(--dm-gradient-primary); color: white; box-shadow: 0 3px 10px rgba(99,102,241,0.35); }

    .toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
    .toggle-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .view-toggle { display: flex; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); overflow: hidden; }
    .view-option { padding: 8px 14px; font-size: 0.82rem; font-weight: 600; background: var(--dm-surface); color: var(--dm-text-muted); border: none; cursor: pointer; }
    .view-option.active { background: var(--dm-gradient-primary); color: white; }
    .btn-excel { border-color: #1D9E75; color: #0F6E56; }
    .btn-excel:hover { background: rgba(29,158,117,0.08); }
    .btn-json { border-color: #378ADD; color: #185FA5; }
    .btn-json:hover { background: rgba(55,138,221,0.08); }
    .not-found-card { max-width: 460px; margin: 60px auto; padding: 40px 32px; text-align: center; }
    .not-found-card .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 14px; }
    .not-found-card h2 { margin-bottom: 10px; }
    .not-found-card p { margin-bottom: 20px; }
    @media (max-width: 700px) { .header { flex-direction: column; } .toolbar { flex-direction: column; align-items: stretch; } }
  `]
})
export class PreviewEditComponent implements OnInit {
  documentId = '';
  fileName = '';
  pageCount = 0;
  fields: ExtractedFieldEdit[] = [];
  mode: 'edit' | 'preview' = 'edit';
  previewKind: 'table' | 'json' = 'table';
  viewMode: 'rows' | 'columns' = 'rows';
  pageCounts: Record<string, number> = {};
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
        this.pageCounts = { [this.documentId]: res.pageCount };
        this.loading = false;
      },
      // 404 here means "doesn't exist, or belongs to someone else's account" -
      // the API deliberately doesn't distinguish the two (see backend comment
      // on GetOwnedDocumentAsync). A 401/LOGIN_REQUIRED is handled globally by
      // the error interceptor, which redirects to /login before this fires.
      error: () => { this.loading = false; this.notFound = true; }
    });
  }

  saveField(event: FieldCardEvent) {
    const field = event.field;
    this.documentService.updateField(this.documentId, field.id, field.fieldValue ?? '', field.fieldKey, undefined, field.semanticType).subscribe({
      next: res => {
        field.wasEditedByUser = res.field.wasEditedByUser;
        field.fieldKey = res.field.fieldKey;
        field.fieldValue = res.field.fieldValue;
        field.semanticType = res.field.semanticType;
      },
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  toggleInclude(event: FieldCardEvent) {
    const field = event.field;
    this.documentService.updateField(this.documentId, field.id, field.fieldValue ?? '', field.fieldKey, field.includeInExport).subscribe({
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  onReordered(event: FieldCardReorderEvent) {
    const payload = event.fields.map(f => ({ fieldId: f.id, sectionLabel: f.sectionLabel, sortOrder: f.sortOrder }));
    this.documentService.reorderFields(this.documentId, payload).subscribe({
      error: () => this.toast.error('Could not save the new order. Please try again.')
    });
  }

  onSectionRenamed(event: FieldCardSectionRenameEvent) {
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
