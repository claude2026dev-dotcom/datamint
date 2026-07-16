import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { ExtractedFieldEdit } from '../../core/models/models';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';
import { ExportModalComponent, ExportModalResult } from '../../shared/components/export-modal/export-modal.component';
import { FieldSectionEditorComponent } from '../../shared/components/field-section-editor/field-section-editor.component';
import { JsonTreeViewComponent } from '../../shared/components/json-tree-view/json-tree-view.component';
import { buildFieldTree } from '../../shared/utils/build-field-tree';

interface BatchDocument {
  id: string;
  fileName: string;
  fields: ExtractedFieldEdit[];
  showJson: boolean;
}

/// Shown instead of the single-document preview when several files were uploaded together:
/// one card per document, each using the same shared, AI-grouped field editor as the
/// single-document review page.
@Component({
  selector: 'app-batch-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, ExportModalComponent, FieldSectionEditorComponent, JsonTreeViewComponent],
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
          <button class="dm-btn dm-btn-ghost" (click)="openExportChooser('download')" [disabled]="loading">⬇ Export</button>
          <button class="dm-btn dm-btn-primary" (click)="openExportChooser('email')" [disabled]="loading">✉ Email export</button>
        </div>
      </div>

      @if (exportChooserFor) {
        <app-export-modal [action]="exportChooserFor" [isBatch]="true"
                           [documents]="exportModalDocuments()" [busy]="exportBusy"
                           (confirmed)="onExportConfirmed($event)" (cancelled)="exportChooserFor = null" />
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
              <button type="button" class="dm-btn dm-btn-ghost json-toggle" (click)="doc.showJson = !doc.showJson">{{ '{ } ' }}JSON</button>
            </div>

            @if (doc.showJson) {
              <div class="json-preview">
                <app-json-tree-view [data]="jsonPreview(doc)" rootLabel="document" />
              </div>
            }

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
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .not-found-card { max-width: 460px; margin: 60px auto; padding: 40px 32px; text-align: center; }
    .not-found-card .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 14px; }
    .not-found-card h2 { margin-bottom: 10px; }
    .not-found-card p { margin-bottom: 20px; }

    .doc-card { padding: 20px; margin-bottom: 18px; }
    .doc-card-head { display: flex; align-items: center; gap: 8px; padding-bottom: 14px; margin-bottom: 6px; border-bottom: 1px solid var(--dm-border); }
    .doc-card-head app-icon { color: var(--dm-text-muted); flex-shrink: 0; }
    .doc-name { font-weight: 700; overflow-wrap: break-word; word-break: break-word; flex: 1; min-width: 0; }
    .json-toggle { flex-shrink: 0; padding: 4px 10px; font-size: 0.78rem; }
    .json-preview { margin-bottom: 16px; padding: 14px; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); max-height: 400px; overflow: auto; }

    @media (max-width: 700px) {
      .header { flex-direction: column; }
    }
  `]
})
export class BatchReviewComponent implements OnInit {
  documents: BatchDocument[] = [];
  loading = true;
  notFound = false;

  exportChooserFor: 'download' | 'email' | null = null;
  exportBusy = false;

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
        this.documents = results.map(res => ({ id: res.id, fileName: res.originalFileName, fields: res.fields, showJson: false }));
        this.loading = false;
      },
      error: () => { this.loading = false; this.notFound = true; }
    });
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

  jsonPreview(doc: BatchDocument) {
    return buildFieldTree(doc.fileName, doc.fields);
  }

  openExportChooser(target: 'download' | 'email') {
    this.exportChooserFor = this.exportChooserFor === target ? null : target;
  }

  exportModalDocuments() {
    return this.documents.map(d => ({ id: d.id, fileName: d.fileName }));
  }

  onExportConfirmed(result: ExportModalResult) {
    const documentIds = result.options.includedDocumentIds ?? this.documents.map(d => d.id);
    this.exportBusy = true;

    if (result.toAddress) {
      this.documentService.batchSendEmail(documentIds, result.toAddress, result.exportMode, result.options).subscribe({
        next: () => {
          this.toast.success('Export emailed successfully.');
          this.exportChooserFor = null;
          this.exportBusy = false;
        },
        error: () => { this.exportBusy = false; this.toast.error('Could not send that email. Please try again.'); }
      });
      return;
    }

    this.documentService.batchExport(documentIds, result.exportMode, result.options).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = result.options.format === 'Json' ? 'json' : (result.exportMode === 'SeparateFiles' ? 'zip' : 'xlsx');
        a.download = `datamint-batch-export.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.exportBusy = false;
        this.exportChooserFor = null;
        this.toast.success('Export downloaded.');
      },
      error: () => { this.exportBusy = false; this.toast.error('Could not export. Please try again.'); }
    });
  }
}
