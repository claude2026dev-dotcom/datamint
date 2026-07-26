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

/// The "spreadsheet" counterpart to app-field-section-editor: one row per document, one
/// column per distinct field key (union across every document passed in) - the natural
/// layout for comparing the same fields across a bulk batch side by side, mirroring the
/// export modal's existing ColumnsPerField layout but live and editable on screen. A lone
/// document just renders as a single row. Column order follows each key's first-seen
/// sortOrder; a document missing a given key shows an empty, disabled cell rather than a
/// fabricated field (this view only edits existing intersecting fields, it never creates one).
@Component({
  selector: 'app-field-columns-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dm-card columns-wrap">
      <div class="table-scroll">
        <table class="cols-table">
          <thead>
            <tr>
              <th class="doc-col">Document</th>
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
                      <textarea class="cell-input" rows="1" [ngModel]="field.fieldValue"
                                (ngModelChange)="field.fieldValue = $event"
                                (blur)="emitSave(doc, field)"></textarea>
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
    .table-scroll { overflow-x: auto; }
    .cols-table { border-collapse: collapse; width: 100%; min-width: max-content; }
    .cols-table th, .cols-table td { border: 1px solid var(--dm-border); padding: 8px 10px; text-align: left; vertical-align: top; }
    .cols-table thead th { background: var(--dm-surface); position: sticky; top: 0; z-index: 1; }
    .doc-col { position: sticky; left: 0; background: var(--dm-surface); font-weight: 600; font-size: 0.85rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; z-index: 2; }
    td.doc-col { background: var(--dm-bg-elevated); font-weight: 500; }
    .col-key { display: block; font-size: 0.8rem; font-weight: 700; white-space: nowrap; }
    .col-type { display: block; font-size: 0.68rem; color: var(--dm-text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.02em; }
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
  private lastSaved = new Map<string, string | null>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['documents']) this.rebuildColumns();
  }

  private rebuildColumns() {
    const firstSortOrder = new Map<string, number>();
    const semanticType = new Map<string, string>();
    for (const doc of this.documents) {
      for (const field of doc.fields) {
        if (!firstSortOrder.has(field.fieldKey) || field.sortOrder < firstSortOrder.get(field.fieldKey)!) {
          firstSortOrder.set(field.fieldKey, field.sortOrder);
          semanticType.set(field.fieldKey, field.semanticType);
        }
        this.lastSaved.set(`${doc.id}:${field.id}`, field.fieldValue);
      }
    }
    this.columns = Array.from(firstSortOrder.keys())
      .sort((a, b) => firstSortOrder.get(a)! - firstSortOrder.get(b)!)
      .map(key => ({ key, semanticType: semanticType.get(key) || 'Generic' }));
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
