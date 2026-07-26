import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExtractedFieldEdit } from '../../../core/models/models';

export interface ColumnsEditorDocument {
  id: string;
  fileName: string;
  fields: ExtractedFieldEdit[];
}

interface ColumnDef {
  key: string;
  semanticType: string;
}

interface SectionGroup {
  label: string;
  columns: ColumnDef[];
}

/// The spreadsheet-comparison counterpart to app-field-section-editor: one row per document,
/// one column per distinct field key (union across every document passed in), columns grouped
/// under their section name in a two-level sticky header exactly like a real spreadsheet's
/// grouped columns - the natural layout for comparing the same fields across a bulk batch side
/// by side. A lone document just renders as a single row. A document missing a given key shows
/// an empty, disabled cell rather than a fabricated field - this view only edits existing
/// intersecting fields, it never creates one.
@Component({
  selector: 'app-field-columns-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dm-card columns-wrap">
      <div class="table-scroll">
        <table class="cols-table">
          <thead>
            <tr class="section-row">
              <th class="doc-col" rowspan="2">Document</th>
              @for (group of sectionGroups; track group.label) {
                <th [attr.colspan]="group.columns.length" class="section-head">{{ group.label }}</th>
              }
            </tr>
            <tr>
              @for (col of columns; track col.key) {
                <th>
                  <span class="col-key">{{ col.key }}</span>
                  <span class="col-type">{{ col.semanticType }}</span>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (doc of documents; track doc.id) {
              <tr>
                <td class="doc-col" [title]="doc.fileName">{{ doc.fileName }}</td>
                @for (col of columns; track col.key) {
                  <td>
                    @if (findField(doc, col.key); as field) {
                      <div class="cell" [class.cell-edited]="field.wasEditedByUser">
                        <textarea class="cell-input" rows="1" [ngModel]="field.fieldValue"
                                  (ngModelChange)="field.fieldValue = $event"
                                  (blur)="emitSave(doc, field)"></textarea>
                      </div>
                    } @else {
                      <span class="cell-empty">—</span>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .columns-wrap { padding: 4px; margin-bottom: 16px; }
    /* overflow-y: visible is deliberate, not redundant - setting only overflow-x forces the
       browser to compute overflow-y as 'auto' too (per the CSS overflow spec), turning this
       into its own nested vertical scroll container. That breaks the sticky header below (it
       sticks to THIS div's scroll position, not the page's) and can show a second, easy-to-miss
       scrollbar. Explicitly pinning overflow-y keeps only the intended horizontal scroll. */
    .table-scroll { overflow-x: auto; overflow-y: visible; }
    .cols-table { border-collapse: collapse; width: 100%; min-width: max-content; }
    .cols-table th, .cols-table td { border: 1px solid var(--dm-border); padding: 8px 10px; text-align: left; vertical-align: top; }
    .cols-table thead th { background: var(--dm-surface); position: sticky; z-index: 2; }
    .cols-table thead tr:first-child th { top: 0; }
    .cols-table thead tr:nth-child(2) th { top: 33px; }
    .section-head { text-align: center; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-primary); background: rgba(99,102,241,0.08); }
    .doc-col { position: sticky; left: 0; background: var(--dm-surface); font-weight: 600; font-size: 0.85rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; z-index: 3; }
    td.doc-col { background: var(--dm-bg-elevated); font-weight: 500; }
    .col-key { display: block; font-size: 0.8rem; font-weight: 700; white-space: nowrap; }
    .col-type { display: block; font-size: 0.68rem; color: var(--dm-text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.02em; }
    .cell { position: relative; }
    .cell.cell-edited::before { content: ""; position: absolute; top: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background: var(--dm-accent); }
    .cell-input {
      width: 220px; min-width: 160px; resize: vertical; min-height: 34px; line-height: 1.4;
      font-family: inherit; font-size: 0.85rem; border: 1px solid transparent; border-radius: var(--dm-radius-sm);
      background: transparent; color: var(--dm-text); padding: 4px 6px;
    }
    .cell-input:hover, .cell-input:focus { border-color: var(--dm-border); background: var(--dm-surface); }
    .cell-empty { color: var(--dm-text-muted); font-size: 0.85rem; }
  `]
})
export class FieldColumnsEditorComponent implements OnChanges {
  @Input() documents: ColumnsEditorDocument[] = [];

  @Output() fieldSaved = new EventEmitter<{ docId: string; field: ExtractedFieldEdit }>();

  columns: ColumnDef[] = [];
  sectionGroups: SectionGroup[] = [];
  private lastSaved = new Map<string, string | null>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['documents']) this.rebuildColumns();
  }

  private rebuildColumns() {
    const firstSortOrder = new Map<string, number>();
    const semanticType = new Map<string, string>();
    const sectionOf = new Map<string, string>();
    for (const doc of this.documents) {
      for (const field of doc.fields) {
        if (!firstSortOrder.has(field.fieldKey) || field.sortOrder < firstSortOrder.get(field.fieldKey)!) {
          firstSortOrder.set(field.fieldKey, field.sortOrder);
          semanticType.set(field.fieldKey, field.semanticType);
          sectionOf.set(field.fieldKey, field.sectionLabel || 'General');
        }
        this.lastSaved.set(`${doc.id}:${field.id}`, field.fieldValue);
      }
    }
    const orderedKeys = Array.from(firstSortOrder.keys()).sort((a, b) => firstSortOrder.get(a)! - firstSortOrder.get(b)!);
    this.columns = orderedKeys.map(key => ({ key, semanticType: semanticType.get(key) || 'Generic' }));

    const groupOrder: string[] = [];
    const bySection = new Map<string, ColumnDef[]>();
    for (const col of this.columns) {
      const label = sectionOf.get(col.key) || 'General';
      if (!bySection.has(label)) { bySection.set(label, []); groupOrder.push(label); }
      bySection.get(label)!.push(col);
    }
    this.sectionGroups = groupOrder.map(label => ({ label, columns: bySection.get(label)! }));
  }

  findField(doc: ColumnsEditorDocument, key: string): ExtractedFieldEdit | undefined {
    return doc.fields.find(f => f.fieldKey === key);
  }

  emitSave(doc: ColumnsEditorDocument, field: ExtractedFieldEdit) {
    const cacheKey = `${doc.id}:${field.id}`;
    if (this.lastSaved.get(cacheKey) === field.fieldValue) return;
    this.lastSaved.set(cacheKey, field.fieldValue);
    this.fieldSaved.emit({ docId: doc.id, field });
  }
}
