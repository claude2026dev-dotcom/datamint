import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { BatchExportMode, ExportFormat, ExportLayout, ExtractedFieldEdit } from '../../core/models/models';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';
import { ExportModalComponent, EmailModalResult } from '../../shared/components/export-modal/export-modal.component';
import { FieldSectionEditorComponent } from '../../shared/components/field-section-editor/field-section-editor.component';
import { FieldColumnsEditorComponent } from '../../shared/components/field-columns-editor/field-columns-editor.component';

interface BatchDocument {
  id: string;
  fileName: string;
  fields: ExtractedFieldEdit[];
}

type SheetMode = 'combined' | 'byFile';

/// Shown instead of the single-document preview when several files were uploaded together.
/// Mirrors how a real spreadsheet handles multiple files: "Combined" puts every document into
/// one continuous sheet (rows-grouped-by-section, or the columns-comparison table), "By file"
/// switches to one sheet-tab per document, each showing just that document's own table - the
/// on-screen equivalent of the export's single-sheet vs separate-sheets choice, available here
/// only because a batch is more than one document.
@Component({
  selector: 'app-batch-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, ExportModalComponent,
            FieldSectionEditorComponent, FieldColumnsEditorComponent],
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
          <div class="view-toggle">
            <button type="button" class="view-option" [class.active]="sheetMode === 'combined'" (click)="sheetMode = 'combined'">Combined</button>
            <button type="button" class="view-option" [class.active]="sheetMode === 'byFile'" (click)="sheetMode = 'byFile'">By file</button>
          </div>
          <div class="view-toggle">
            <button type="button" class="view-option" [class.active]="viewMode === 'rows'" (click)="viewMode = 'rows'">Rows</button>
            <button type="button" class="view-option" [class.active]="viewMode === 'columns'" (click)="viewMode = 'columns'">Columns</button>
          </div>
          <button class="dm-btn dm-btn-ghost" [disabled]="loading || exporting" (click)="downloadExport('Excel')"><app-icon name="file-text" [size]="15" /> Excel</button>
          <button class="dm-btn dm-btn-ghost" [disabled]="loading || exporting" (click)="downloadExport('Json')">{{ '{ }' }} JSON</button>
          <button class="dm-btn dm-btn-primary" [disabled]="loading" (click)="emailModalOpen = !emailModalOpen"><app-icon name="inbox" [size]="15" /> Email</button>
        </div>
      </div>

      @if (emailModalOpen) {
        <app-export-modal [busy]="emailBusy" (confirmed)="onEmailConfirmed($event)" (cancelled)="emailModalOpen = false" />
      }

      @if (loading) {
        <p class="muted">Loading documents…</p>
      } @else if (sheetMode === 'byFile') {
        <div class="tab-bar">
          @for (doc of documents; track doc.id) {
            <button type="button" class="tab" [class.active]="doc.id === activeDocId" [title]="doc.fileName" (click)="activeDocId = doc.id">
              <app-icon name="file-text" [size]="14" /> {{ doc.fileName }}
            </button>
          }
        </div>
        @if (activeDocument()) {
          @if (viewMode === 'rows') {
            <app-field-section-editor [fields]="activeDocument()!.fields" (fieldSaved)="saveField(activeDocument()!, $event)"
                                       (includeToggled)="toggleInclude(activeDocument()!, $event)" (reordered)="onReordered(activeDocument()!, $event)"
                                       (sectionRenamed)="onSectionRenamed(activeDocument()!, $event)" />
          } @else {
            <app-field-columns-editor [documents]="[activeDocument()!]" (fieldSaved)="onColumnsFieldSaved($event)" />
          }
        }
      } @else if (viewMode === 'columns') {
        <app-field-columns-editor [documents]="documents" (fieldSaved)="onColumnsFieldSaved($event)" />
      } @else {
        @for (doc of documents; track doc.id) {
          <div class="dm-card doc-card">
            <div class="doc-card-head">
              <app-icon name="file-text" [size]="17" />
              <span class="doc-name" [title]="doc.fileName">{{ doc.fileName }}</span>
              <span class="muted small">{{ doc.fields.length }} field(s)</span>
            </div>
            <app-field-section-editor [fields]="doc.fields" (fieldSaved)="saveField(doc, $event)"
                                       (includeToggled)="toggleInclude(doc, $event)" (reordered)="onReordered(doc, $event)"
                                       (sectionRenamed)="onSectionRenamed(doc, $event)" />
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
    .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .actions .dm-btn { display: inline-flex; align-items: center; gap: 6px; }
    .view-toggle { display: flex; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); overflow: hidden; }
    .view-option { padding: 8px 14px; font-size: 0.82rem; font-weight: 600; background: var(--dm-surface); color: var(--dm-text-muted); border: none; cursor: pointer; }
    .view-option.active { background: var(--dm-gradient-primary); color: white; }
    .not-found-card { max-width: 460px; margin: 60px auto; padding: 40px 32px; text-align: center; }
    .not-found-card .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 14px; }
    .not-found-card h2 { margin-bottom: 10px; }
    .not-found-card p { margin-bottom: 20px; }

    .tab-bar { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 18px; padding-bottom: 2px; border-bottom: 1px solid var(--dm-border); }
    .tab { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border: none; border-bottom: 2px solid transparent; background: none; color: var(--dm-text-muted); font-size: 0.85rem; font-weight: 600; cursor: pointer; white-space: nowrap; border-radius: var(--dm-radius-sm) var(--dm-radius-sm) 0 0; }
    .tab:hover { background: var(--dm-surface-hover); }
    .tab.active { color: var(--dm-primary); border-bottom-color: var(--dm-primary); background: rgba(99,102,241,0.06); }

    .doc-card { padding: 20px; margin-bottom: 18px; }
    .doc-card-head { display: flex; align-items: center; gap: 8px; padding-bottom: 14px; margin-bottom: 6px; border-bottom: 1px solid var(--dm-border); }
    .doc-card-head app-icon { color: var(--dm-text-muted); flex-shrink: 0; }
    .doc-name { font-weight: 700; overflow-wrap: break-word; word-break: break-word; flex: 1; min-width: 0; }

    @media (max-width: 700px) {
      .header { flex-direction: column; }
    }
  `]
})
export class BatchReviewComponent implements OnInit {
  documents: BatchDocument[] = [];
  loading = true;
  notFound = false;
  viewMode: 'rows' | 'columns' = 'rows';
  sheetMode: SheetMode = 'combined';
  activeDocId = '';

  emailModalOpen = false;
  emailBusy = false;
  exporting = false;

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
        this.activeDocId = this.documents[0]?.id ?? '';
        this.loading = false;
      },
      error: () => { this.loading = false; this.notFound = true; }
    });
  }

  activeDocument(): BatchDocument | undefined {
    return this.documents.find(d => d.id === this.activeDocId);
  }

  saveField(doc: BatchDocument, field: ExtractedFieldEdit) {
    this.documentService.updateField(doc.id, field.id, field.fieldValue ?? '', field.fieldKey).subscribe({
      next: res => {
        field.wasEditedByUser = res.field.wasEditedByUser;
        field.fieldKey = res.field.fieldKey;
        field.fieldValue = res.field.fieldValue;
      },
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  onColumnsFieldSaved(event: { docId: string; field: ExtractedFieldEdit }) {
    const doc = this.documents.find(d => d.id === event.docId);
    if (doc) this.saveField(doc, event.field);
  }

  toggleInclude(doc: BatchDocument, field: ExtractedFieldEdit) {
    this.documentService.updateField(doc.id, field.id, field.fieldValue ?? '', field.fieldKey, field.includeInExport).subscribe({
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  onReordered(doc: BatchDocument, fields: ExtractedFieldEdit[]) {
    const payload = fields.map(f => ({ fieldId: f.id, sectionLabel: f.sectionLabel, sortOrder: f.sortOrder }));
    this.documentService.reorderFields(doc.id, payload).subscribe({
      error: () => this.toast.error('Could not save the new order. Please try again.')
    });
  }

  onSectionRenamed(doc: BatchDocument, event: { oldLabel: string; newLabel: string }) {
    this.documentService.renameSection(doc.id, event.oldLabel, event.newLabel).subscribe({
      error: () => this.toast.error('Could not rename that section. Please try again.')
    });
  }

  /// "Combined" maps to a single sheet holding every document; "By file" maps to one workbook
  /// tab per document - the same distinction the backend's export modes already made, just no
  /// longer re-asked once it's already the on-screen view.
  private currentExportMode(): BatchExportMode {
    return this.sheetMode === 'byFile' ? 'MultipleSheets' : 'SingleSheet';
  }

  private currentLayout(): ExportLayout {
    return this.viewMode === 'columns' ? 'ColumnsPerField' : 'RowsPerField';
  }

  downloadExport(format: ExportFormat) {
    this.exporting = true;
    const documentIds = this.documents.map(d => d.id);
    this.documentService.batchExport(documentIds, this.currentExportMode(), { format, layout: this.currentLayout() }).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = format === 'Json' ? 'json' : 'xlsx';
        a.download = `datamint-batch-export.${ext}`;
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
    const documentIds = this.documents.map(d => d.id);
    this.documentService.batchSendEmail(documentIds, result.toAddress, result.cc, this.currentExportMode(), { format: result.format, layout: this.currentLayout() }).subscribe({
      next: () => {
        this.toast.success('Export emailed successfully.');
        this.emailModalOpen = false;
        this.emailBusy = false;
      },
      error: () => { this.emailBusy = false; this.toast.error('Could not send that email. Please try again.'); }
    });
  }
}
