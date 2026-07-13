import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BatchExportMode, ExportFormat, ExportLayout, ExportOptions } from '../../../core/models/models';

export interface ExportModalResult {
  options: ExportOptions;
  exportMode: BatchExportMode;
  toAddress?: string;
}

export interface ExportModalDocument {
  id: string;
  fileName: string;
}

/// Shared "how should this be exported" dialog for both the single-document review page
/// and the batch review page - format (Excel/JSON), layout (rows-per-field/columns-per-field,
/// Excel only), export mode + a document checklist (batch only), and an optional recipient
/// field when opened for "email" rather than "download". Field-level selection isn't re-picked
/// here - it respects each field's own inline "include in export" toggle.
@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dm-card export-modal">
      <h3>{{ action === 'email' ? 'Email export' : 'Export' }}{{ isBatch ? ' — ' + documents.length + ' file(s)' : '' }}</h3>

      <div class="field-block">
        <label>Format</label>
        <div class="segmented">
          <button type="button" class="seg-option" [class.active]="format === 'Excel'" (click)="format = 'Excel'">Excel (.xlsx)</button>
          <button type="button" class="seg-option" [class.active]="format === 'Json'" (click)="format = 'Json'">JSON</button>
        </div>
      </div>

      @if (format === 'Excel') {
        <div class="field-block">
          <label>Layout</label>
          <div class="mode-options">
            <label class="mode-option" [class.active]="layout === 'RowsPerField'">
              <input type="radio" name="layout" value="RowsPerField" [(ngModel)]="layout" />
              <div>
                <strong>Fields as rows</strong>
                <p class="muted small">One row per field{{ isBatch ? ', grouped in blocks per document' : '' }} — good for reading top to bottom.</p>
              </div>
            </label>
            <label class="mode-option" [class.active]="layout === 'ColumnsPerField'">
              <input type="radio" name="layout" value="ColumnsPerField" [(ngModel)]="layout" />
              <div>
                <strong>Fields as columns</strong>
                <p class="muted small">One column per field{{ isBatch ? ', one row per document' : '' }} — good for comparing values side by side.</p>
              </div>
            </label>
          </div>
        </div>

        @if (isBatch) {
          <div class="field-block">
            <label>How should the files be combined?</label>
            <div class="mode-options">
              <label class="mode-option" [class.active]="exportMode === 'SingleSheet'">
                <input type="radio" name="exportMode" value="SingleSheet" [(ngModel)]="exportMode" />
                <div>
                  <strong>One combined sheet</strong>
                  <p class="muted small">A single sheet holding every selected document.</p>
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
          </div>
        }
      }

      @if (isBatch) {
        <div class="field-block">
          <div class="doc-checklist-head">
            <label>Include</label>
            <button type="button" class="link-btn" (click)="selectAll()">Select all</button>
            <button type="button" class="link-btn" (click)="selectNone()">Select none</button>
          </div>
          <div class="doc-checklist">
            @for (doc of documents; track doc.id) {
              <label class="doc-check">
                <input type="checkbox" [checked]="selectedDocIds.has(doc.id)" (change)="toggleDoc(doc.id)" />
                <span [title]="doc.fileName">{{ doc.fileName }}</span>
              </label>
            }
          </div>
        </div>
      }

      @if (action === 'email') {
        <div class="field-block">
          <label>Send to</label>
          <input class="dm-input" type="email" [(ngModel)]="toAddress" placeholder="recipient@company.com" />
        </div>
      }

      <div class="chooser-actions">
        <button class="dm-btn dm-btn-ghost" (click)="cancelled.emit()" [disabled]="busy">Cancel</button>
        <button class="dm-btn dm-btn-primary" (click)="confirm()" [disabled]="busy || !canConfirm()">
          {{ busy ? (action === 'email' ? 'Sending…' : 'Exporting…') : (action === 'email' ? 'Send' : 'Export') }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .export-modal { padding: 20px; margin-bottom: 22px; }
    .export-modal h3 { font-size: 0.98rem; margin-bottom: 16px; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.8rem; }
    .field-block { margin-bottom: 18px; }
    .field-block > label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--dm-text-muted); margin-bottom: 8px; }

    .segmented { display: flex; gap: 8px; }
    .seg-option { flex: 1; padding: 10px 12px; border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border); background: var(--dm-surface); cursor: pointer; font-size: 0.88rem; font-weight: 600; color: var(--dm-text); }
    .seg-option.active { border-color: var(--dm-primary); background: rgba(99,102,241,0.1); color: var(--dm-primary); }

    .mode-options { display: flex; flex-direction: column; gap: 4px; }
    .mode-option { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: var(--dm-radius-sm); cursor: pointer; border: 1px solid transparent; }
    .mode-option:hover { background: var(--dm-surface-hover); }
    .mode-option.active { border-color: var(--dm-primary); background: rgba(99,102,241,0.08); }
    .mode-option input[type="radio"] { margin-top: 4px; accent-color: var(--dm-primary); flex-shrink: 0; }
    .mode-option strong { font-size: 0.9rem; }

    .doc-checklist-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .doc-checklist-head label { margin-bottom: 0 !important; }
    .link-btn { background: none; border: none; padding: 0; color: var(--dm-primary); font-size: 0.78rem; cursor: pointer; }
    .doc-checklist { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow-y: auto; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); padding: 6px; }
    .doc-check { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--dm-radius-sm); font-size: 0.85rem; }
    .doc-check:hover { background: var(--dm-surface-hover); }
    .doc-check input { accent-color: var(--dm-primary); flex-shrink: 0; }
    .doc-check span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .chooser-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--dm-border); }
  `]
})
export class ExportModalComponent implements OnChanges {
  @Input() action: 'download' | 'email' = 'download';
  @Input() isBatch = false;
  @Input() documents: ExportModalDocument[] = [];
  @Input() busy = false;

  @Output() confirmed = new EventEmitter<ExportModalResult>();
  @Output() cancelled = new EventEmitter<void>();

  format: ExportFormat = 'Excel';
  layout: ExportLayout = 'RowsPerField';
  exportMode: BatchExportMode = 'SingleSheet';
  selectedDocIds = new Set<string>();
  toAddress = '';

  ngOnChanges(changes: SimpleChanges) {
    if (changes['documents']) this.selectAll();
  }

  selectAll() {
    this.selectedDocIds = new Set(this.documents.map(d => d.id));
  }

  selectNone() {
    this.selectedDocIds = new Set();
  }

  toggleDoc(id: string) {
    if (this.selectedDocIds.has(id)) this.selectedDocIds.delete(id);
    else this.selectedDocIds.add(id);
  }

  canConfirm(): boolean {
    if (this.isBatch && this.selectedDocIds.size === 0) return false;
    if (this.action === 'email' && !this.toAddress) return false;
    return true;
  }

  confirm() {
    if (!this.canConfirm()) return;
    const options: ExportOptions = {
      format: this.format,
      layout: this.layout,
      includedDocumentIds: this.isBatch ? Array.from(this.selectedDocIds) : undefined
    };
    this.confirmed.emit({
      options,
      exportMode: this.exportMode,
      toAddress: this.action === 'email' ? this.toAddress : undefined
    });
  }
}
