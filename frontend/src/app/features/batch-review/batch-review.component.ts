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
import { FieldCardEditorComponent, FieldCardEvent, FieldCardReorderEvent, FieldCardSectionRenameEvent } from '../../shared/components/field-card-editor/field-card-editor.component';
import { FieldTableViewComponent } from '../../shared/components/field-table-view/field-table-view.component';
import { FieldJsonViewComponent } from '../../shared/components/field-json-view/field-json-view.component';

interface BatchDocument {
  id: string;
  fileName: string;
  fields: ExtractedFieldEdit[];
}

type SheetMode = 'combined' | 'byFile' | 'separateFiles';

/// Shown instead of the single-document preview when several files were uploaded together. Like
/// the single-document page, this is two distinct steps: "Edit" (default landing view, the
/// card-based editor - never a spreadsheet grid) and a separate "Preview & export" step where the
/// Rows/Columns layout and the sheet-shape choice (one combined sheet, one workbook with a tab
/// per document, or a zip of individual files - the on-screen equivalent of the export's three
/// batch modes) actually matter.
@Component({
  selector: 'app-batch-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, ExportModalComponent,
            FieldCardEditorComponent, FieldTableViewComponent, FieldJsonViewComponent],
  template: `
    <div class="dm-container page page-wide">
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
        <div class="header-title">
          <h1>Combined preview — {{ documents.length }} file(s)</h1>
          <p class="muted">Edit any field below. Each file keeps its own labels and values.</p>
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

      @if (loading) {
        <p class="muted">Loading documents…</p>
      } @else {

      @if (mode === 'preview') {
        <div class="toolbar">
          <div class="toggle-group">
            <div class="view-toggle">
              <button type="button" class="view-option" [class.active]="sheetMode === 'combined'" (click)="sheetMode = 'combined'" title="One combined sheet">Combined</button>
              <button type="button" class="view-option" [class.active]="sheetMode === 'byFile'" (click)="sheetMode = 'byFile'" title="One workbook, one tab per document">Multi-sheet</button>
              <button type="button" class="view-option" [class.active]="sheetMode === 'separateFiles'" (click)="sheetMode = 'separateFiles'" title="A zip with one file per document">Separate files</button>
            </div>
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

        <!-- Combined/Multi-sheet/Separate files look identical as buttons - this line is the
             only thing that actually explains what pressing "Excel"/"Email" will produce for
             whichever one is currently selected, since the preview below (a single combined
             table either way) can't show that difference on its own. -->
        <p class="mode-caption muted small">
          <app-icon name="sparkles" [size]="13" />
          @if (sheetMode === 'combined') {
            All {{ documents.length }} document(s) will export as one combined sheet/file.
          } @else if (sheetMode === 'byFile') {
            Exports as one workbook with a separate tab per document ({{ documents.length }} tabs).
          } @else {
            Exports as a .zip containing one separate file per document ({{ documents.length }} files).
          }
        </p>

        @if (emailModalOpen) {
          <app-export-modal [busy]="emailBusy" (confirmed)="onEmailConfirmed($event)" (cancelled)="emailModalOpen = false" />
        }
      }

      @if (mode === 'preview' && sheetMode === 'combined') {
        @if (previewKind === 'json') {
          <app-field-json-view [documents]="documents" [pageCounts]="pageCounts" />
        } @else {
          <app-field-table-view [documents]="documents" [viewMode]="viewMode" />
        }
      } @else if (mode === 'edit' && sheetMode === 'combined') {
        <app-field-card-editor [documents]="documents" (fieldSaved)="saveField($event)" (includeToggled)="toggleInclude($event)"
                                (reordered)="onReordered($event)" (sectionRenamed)="onSectionRenamed($event)"
                                (sectionsFlattened)="onSectionsFlattened($event)" (sectionsRestored)="onSectionsRestored($event)" />
      } @else {
        <div class="tab-bar">
          @for (doc of documents; track doc.id) {
            <button type="button" class="tab" [class.active]="doc.id === activeDocId" [title]="doc.fileName" (click)="activeDocId = doc.id">
              <app-icon name="file-text" [size]="14" /> {{ doc.fileName }}
            </button>
          }
        </div>
        @if (activeDocument(); as active) {
          @if (mode === 'preview') {
            @if (previewKind === 'json') {
              <app-field-json-view [documents]="[active]" [pageCounts]="pageCounts" />
            } @else {
              <app-field-table-view [documents]="[active]" [viewMode]="viewMode" />
            }
          } @else {
            <app-field-card-editor [documents]="[active]" (fieldSaved)="saveField($event)" (includeToggled)="toggleInclude($event)"
                                    (reordered)="onReordered($event)" (sectionRenamed)="onSectionRenamed($event)"
                                    (sectionsFlattened)="onSectionsFlattened($event)" (sectionsRestored)="onSectionsRestored($event)" />
          }
        }
      }
      }
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    /* Widening this page's container used to be the fix for a cramped table, but any max-width
       short of the viewport's actual width just renders full-bleed anyway - measured at a common
       1280px viewport, a 1440px cap left only 8px of margin versus every other page's ~50px,
       a real, measured mismatch. Now that the table itself sizes to its own content (fit-content,
       not a forced 100%) instead of needing a wide container to avoid looking cramped, there's no
       real reason for this page to have different side margins from any other page at all -
       .page-wide is intentionally a no-op, kept only so the class name in the template still
       makes sense to read; matching the site-wide 1180px container exactly is the actual fix. */
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
    /* Same fix as preview-edit.component.ts: let the title shrink/wrap instead of forcing the
       Edit/Preview toggle onto its own row whenever the title text happens to be long, so the
       toggle sits in the same spot on both pages regardless of title length. */
    .header-title { flex: 1 1 320px; min-width: 0; }
    .header-title h1 { overflow-wrap: break-word; word-break: break-word; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }
    /* No custom size override here on purpose - the previous 46px/18px/0.88rem override made
       these read as noticeably smaller than a plain .dm-btn elsewhere in the app (measured: a
       standard button is 42.4px tall with 22px padding and 0.95rem text). Just inheriting the
       global .dm-btn styling guarantees an exact match instead of an approximated one. */
    .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .actions .dm-btn { display: inline-flex; align-items: center; gap: 6px; }

    /* Same border-radius scale as .view-toggle elsewhere in the app (a soft rectangle, not a
       pill) - the outer wrapper and inner buttons previously used different radii, which read
       as a much rounder "pill" shape that stood out against the rest of the app's controls.
       Height is tuned to land close to the standard .dm-btn's measured 42.4px once its own
       padding is added, so the two-line mode-toggle and the single-line action buttons read as
       one consistent row instead of one looking oversized or undersized next to the other. */
    .mode-toggle { display: flex; gap: 6px; padding: 6px; border-radius: var(--dm-radius-sm); background: var(--dm-surface); border: 1px solid var(--dm-border); flex-wrap: wrap; }
    .mode-option { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; background: transparent; color: var(--dm-text-muted); border: 1px solid transparent; border-radius: var(--dm-radius-sm); cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; white-space: nowrap; text-align: left; }
    .mode-option span { display: flex; flex-direction: column; gap: 1px; }
    .mode-option strong { font-size: 0.9rem; font-weight: 700; }
    .mode-option small { font-size: 0.7rem; font-weight: 500; opacity: 0.85; }
    .mode-option:hover { color: var(--dm-text); border-color: var(--dm-border); }
    .mode-option.active { background: var(--dm-primary); color: white; box-shadow: 0 3px 10px rgba(99,102,241,0.35); }
    .btn-excel { border-color: #1D9E75; color: #0F6E56; }
    .btn-excel:hover { background: rgba(29,158,117,0.08); }
    .btn-json { border-color: #378ADD; color: #185FA5; }
    .btn-json:hover { background: rgba(55,138,221,0.08); }

    .mode-caption { display: flex; align-items: center; gap: 6px; margin: -10px 0 16px; }
    .mode-caption app-icon { color: var(--dm-primary); flex-shrink: 0; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
    .toggle-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .view-toggle { display: flex; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); overflow: hidden; }
    .view-option { padding: 8px 14px; font-size: 0.82rem; font-weight: 600; background: var(--dm-surface); color: var(--dm-text-muted); border: none; cursor: pointer; white-space: nowrap; }
    .view-option.active { background: var(--dm-gradient-primary); color: white; }
    .not-found-card { max-width: 460px; margin: 60px auto; padding: 40px 32px; text-align: center; }
    .not-found-card .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 14px; }
    .not-found-card h2 { margin-bottom: 10px; }
    .not-found-card p { margin-bottom: 20px; }

    .tab-bar { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 18px; padding-bottom: 2px; border-bottom: 1px solid var(--dm-border); }
    .tab { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border: none; border-bottom: 2px solid transparent; background: none; color: var(--dm-text-muted); font-size: 0.85rem; font-weight: 600; cursor: pointer; white-space: nowrap; border-radius: var(--dm-radius-sm) var(--dm-radius-sm) 0 0; }
    .tab:hover { background: var(--dm-surface-hover); }
    .tab.active { color: var(--dm-primary); border-bottom-color: var(--dm-primary); background: rgba(99,102,241,0.06); }

    @media (max-width: 700px) {
      .header { flex-direction: column; }
      .toolbar { flex-direction: column; align-items: stretch; }
    }
  `]
})
export class BatchReviewComponent implements OnInit {
  documents: BatchDocument[] = [];
  loading = true;
  notFound = false;
  mode: 'edit' | 'preview' = 'edit';
  previewKind: 'table' | 'json' = 'table';
  viewMode: 'rows' | 'columns' = 'rows';
  sheetMode: SheetMode = 'combined';
  activeDocId = '';
  pageCounts: Record<string, number> = {};

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
        this.pageCounts = Object.fromEntries(results.map(res => [res.id, res.pageCount]));
        this.activeDocId = this.documents[0]?.id ?? '';
        this.loading = false;
      },
      error: () => { this.loading = false; this.notFound = true; }
    });
  }

  activeDocument(): BatchDocument | undefined {
    return this.documents.find(d => d.id === this.activeDocId);
  }

  private findDoc(docId: string): BatchDocument | undefined {
    return this.documents.find(d => d.id === docId);
  }

  // See preview-edit.component.ts's identical comment: two overlapping saves for the same field
  // can have their responses arrive out of order, and applying whichever lands last regardless of
  // which was SENT last can stomp a newer edit back to a stale one. A per-field sequence number
  // guards against ever applying a response for a save that's since been superseded.
  private saveSeq: Record<string, number> = {};

  saveField(event: FieldCardEvent) {
    const doc = this.findDoc(event.docId);
    if (!doc) return;
    const field = event.field;
    const seq = (this.saveSeq[field.id] = (this.saveSeq[field.id] ?? 0) + 1);
    this.documentService.updateField(doc.id, field.id, field.fieldValue ?? '', field.fieldKey, undefined, field.semanticType).subscribe({
      next: res => {
        if (this.saveSeq[field.id] !== seq) return;
        field.wasEditedByUser = res.field.wasEditedByUser;
        field.fieldKey = res.field.fieldKey;
        field.fieldValue = res.field.fieldValue;
        field.semanticType = res.field.semanticType;
      },
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  toggleInclude(event: FieldCardEvent) {
    const doc = this.findDoc(event.docId);
    if (!doc) return;
    const field = event.field;
    this.documentService.updateField(doc.id, field.id, field.fieldValue ?? '', field.fieldKey, field.includeInExport).subscribe({
      error: () => this.toast.error('Could not save that change. Please try again.')
    });
  }

  onReordered(event: FieldCardReorderEvent) {
    const payload = event.fields.map(f => ({ fieldId: f.id, sectionLabel: f.sectionLabel, sortOrder: f.sortOrder }));
    this.documentService.reorderFields(event.docId, payload).subscribe({
      error: () => this.toast.error('Could not save the new order. Please try again.')
    });
  }

  onSectionRenamed(event: FieldCardSectionRenameEvent) {
    this.documentService.renameSection(event.docId, event.oldLabel, event.newLabel).subscribe({
      error: () => this.toast.error('Could not rename that section. Please try again.')
    });
  }

  /// Flattening/restoring reshapes every field's grouping for ONE document at once - simplest
  /// and safest to refetch just that document afterward and splice it back into `documents`,
  /// rather than trying to reconstruct the new grouping locally.
  private refetchDoc(docId: string) {
    this.documentService.getDetail(docId).subscribe({
      next: res => {
        const idx = this.documents.findIndex(d => d.id === docId);
        if (idx >= 0) this.documents[idx] = { id: res.id, fileName: res.originalFileName, fields: res.fields };
        this.documents = [...this.documents];
      },
      error: () => this.toast.error('Could not refresh this document. Please reload the page.')
    });
  }

  onSectionsFlattened(event: { docId: string }) {
    this.documentService.flattenSections(event.docId).subscribe({
      next: () => { this.toast.success('Sections removed - fields now show as one plain list.'); this.refetchDoc(event.docId); },
      error: () => this.toast.error('Could not remove sections. Please try again.')
    });
  }

  onSectionsRestored(event: { docId: string }) {
    this.documentService.restoreSections(event.docId).subscribe({
      next: () => { this.toast.success('Original sections restored.'); this.refetchDoc(event.docId); },
      error: () => this.toast.error('Could not restore sections. Please try again.')
    });
  }

  /// "Combined" maps to a single sheet holding every document; "Multi-sheet" maps to one workbook
  /// tab per document; "Separate files" maps to a zip with one file per document - the same three
  /// modes the backend's export already supports, just no longer re-asked once it's already the
  /// on-screen view.
  private currentExportMode(): BatchExportMode {
    if (this.sheetMode === 'byFile') return 'MultipleSheets';
    if (this.sheetMode === 'separateFiles') return 'SeparateFiles';
    return 'SingleSheet';
  }

  private currentLayout(): ExportLayout {
    return this.viewMode === 'columns' ? 'ColumnsPerField' : 'RowsPerField';
  }

  downloadExport(format: ExportFormat) {
    this.exporting = true;
    const documentIds = this.documents.map(d => d.id);
    const mode = this.currentExportMode();
    this.documentService.batchExport(documentIds, mode, { format, layout: this.currentLayout() }).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = mode === 'SeparateFiles' ? 'zip' : (format === 'Json' ? 'json' : 'xlsx');
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
