import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExtractedFieldEdit, FieldEditorDocument } from '../../../core/models/models';
import { IconComponent } from '../icon/icon.component';

interface TableSection {
  label: string;
  fields: ExtractedFieldEdit[];
}

interface TableDocument {
  id: string;
  fileName: string;
  sections: TableSection[];
}

interface ColumnDef {
  key: string;
}

interface SectionGroup {
  label: string;
  columns: ColumnDef[];
}

/// The clean, read-only counterpart to app-field-section-editor / app-field-columns-editor:
/// exactly the field/value data that ends up in an export, with none of the editing chrome
/// (no drag handles, no type picker, no edited indicators, no original-value comparison) - so a
/// user can preview precisely what they're about to download or email before switching back to
/// the Edit tab to make changes. Rows mode renders one plain two-column table per document;
/// Columns mode mirrors field-columns-editor's spreadsheet-comparison layout, just non-editable.
@Component({
  selector: 'app-field-table-view',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <button type="button" class="expand-btn" (click)="expanded = !expanded">
      <app-icon name="grid" [size]="13" />
      {{ expanded ? 'Collapse view' : 'Expand view' }}
    </button>

    @if (viewMode === 'rows') {
      @for (doc of tableDocuments; track doc.id) {
        <div class="dm-card table-card">
          @if (tableDocuments.length > 1) {
            <div class="doc-head">{{ doc.fileName }}</div>
          }
          <div class="table-scroll" [class.expanded]="expanded">
            <table class="plain-table">
              <thead>
                <tr><th class="col-key">Field</th><th class="col-val">Value</th><th class="col-type">Type</th></tr>
              </thead>
              <tbody>
                @for (section of doc.sections; track section.label) {
                  <tr class="section-row"><td colspan="3">{{ section.label }}</td></tr>
                  @for (field of section.fields; track field.id; let odd = $odd) {
                    <tr [class.odd]="odd">
                      <td class="col-key">{{ field.fieldKey }}</td>
                      <td class="col-val">{{ field.fieldValue || '—' }}</td>
                      <td class="col-type"><span class="type-pill">{{ field.semanticType }}</span></td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    } @else {
      <div class="dm-card table-card">
        <div class="table-scroll" [class.expanded]="expanded">
          <table class="plain-table cols-table">
            <thead>
              <tr>
                <th class="doc-col">Document</th>
                @for (group of sectionGroups; track group.label) {
                  <th [attr.colspan]="group.columns.length" class="section-head">{{ group.label }}</th>
                }
              </tr>
              <tr>
                <th class="doc-col-spacer"></th>
                @for (col of columns; track col.key) { <th>{{ col.key }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (doc of documents; track doc.id) {
                <tr>
                  <td class="doc-col" [title]="doc.fileName">{{ doc.fileName }}</td>
                  @for (col of columns; track col.key) {
                    <td>{{ findValue(doc, col.key) }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [`
    .expand-btn { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 12px; padding: 7px 14px; font-size: 0.8rem; font-weight: 600; color: var(--dm-primary); background: var(--dm-surface); border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); cursor: pointer; }
    .expand-btn:hover { background: var(--dm-surface-hover); }
    .table-card { padding: 0; margin-bottom: 20px; overflow: hidden; }
    .doc-head { padding: 13px 16px; font-weight: 700; font-size: 0.94rem; border-bottom: 1px solid var(--dm-border); background: var(--dm-surface); }
    .table-scroll { max-height: 65vh; overflow: auto; transition: max-height 0.2s ease; }
    .table-scroll.expanded { max-height: 85vh; }
    /* border-collapse:collapse + position:sticky cells is a well-documented Chromium/WebKit
       rendering bug: adjacent cell borders and backgrounds can repaint incorrectly during
       scroll, leaving ghosted/overlapping text right at the sticky boundary - exactly the
       "text overlapping the header" artifacts this replaced. border-collapse:separate with
       per-cell bottom/right borders (instead of all four sides) draws the same clean grid
       without tripping that bug, since collapsed cells never need to be reconciled. */
    /* table-layout:fixed + explicit widths (Field/Type fixed, Value takes the remainder) so the
       Type column is always visible without needing a horizontal scroll first, no matter how
       long a value is - a long value wraps inside its own cell instead of stretching the whole
       table wider and pushing Type off-screen. */
    .plain-table { border-collapse: separate; border-spacing: 0; width: 100%; table-layout: fixed; }
    .plain-table th, .plain-table td { border-bottom: 1px solid var(--dm-border); border-right: 1px solid var(--dm-border); padding: 11px 16px; text-align: left; vertical-align: top; font-size: 0.92rem; background: var(--dm-bg, var(--dm-surface)); overflow-wrap: break-word; }
    .plain-table th:first-child, .plain-table td:first-child { border-left: 1px solid var(--dm-border); }
    .plain-table thead th { position: sticky; top: 0; z-index: 3; background: var(--dm-bg-elevated); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); font-weight: 700; border-top: 1px solid var(--dm-border); will-change: transform; }
    .col-key { font-weight: 600; width: 26%; }
    .col-type { width: 110px; }
    .type-pill { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: rgba(99,102,241,0.1); color: var(--dm-primary); white-space: nowrap; }
    .section-row td { background: var(--dm-surface); font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--dm-primary); border-left: 3px solid var(--dm-primary); }
    tbody tr.odd td { background: var(--dm-surface); }
    /* tbody tr.odd td (3 type selectors) otherwise outranks td.doc-col (1 type selector) at
       equal class-count, silently overwriting the frozen column's elevated background back to
       the plain row color on every odd row - a real, provable cause of "ghosting" right at the
       frozen-column boundary, not just a hunch. Re-assert it here with matching specificity. */
    tbody tr.odd td.doc-col { background: var(--dm-bg-elevated); }

    /* The Rows table above is fixed-width so Field/Value/Type always fit without scrolling
       first: the Columns table is the opposite case on purpose - it can have many field
       columns and is meant to size to its content and scroll horizontally, so it overrides
       back to natural auto-sizing. */
    .cols-table { table-layout: auto; width: auto; min-width: max-content; }
    .cols-table thead tr:first-child th { top: 0; height: 34px; }
    .cols-table thead tr:nth-child(2) th { top: 34px; height: 34px; }
    .section-head { text-align: center; color: var(--dm-primary); background: rgba(99,102,241,0.08); }
    /* box-shadow, not just border - separate border-collapse means a plain border alone
       reads faint against scrolled content sliding directly underneath. The shadow gives the
       frozen column a clear, unmistakable edge, the same visual cue Excel/Sheets use for a
       frozen-pane boundary. z-index sits above the sticky header row (3) so the frozen
       column's own header cell ("Document") always wins the corner intersection. */
    .doc-col, .doc-col-spacer { position: sticky; left: 0; background: var(--dm-bg-elevated); font-weight: 600; z-index: 5; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-shadow: 2px 0 6px rgba(0,0,0,0.15); will-change: transform; }
    td.doc-col { background: var(--dm-bg-elevated); }
    /* The corner cells (<th class="doc-col">/<th class="doc-col-spacer"> inside thead) are
       matched by BOTH ".doc-col" (z-index:5) and ".plain-table thead th" (z-index:3, but wins
       on specificity: 2 type selectors vs 0 at equal class-count) - so the corner silently
       resolved to z-index:3, LOWER than a scrolling body row's frozen-column cell (z-index:5).
       That let a body row's sticky-left cell paint in front of the sticky-top corner/header
       while scrolling vertically past it - the "row hiding/overlapping the frozen column"
       symptom. The corner must always be the topmost layer since it's sticky on both axes. */
    .plain-table thead th.doc-col, .plain-table thead th.doc-col-spacer { z-index: 6; }

    @media (max-width: 640px) {
      .plain-table th, .plain-table td { padding: 9px 12px; font-size: 0.86rem; }
    }
  `]
})
export class FieldTableViewComponent implements OnChanges {
  @Input() documents: FieldEditorDocument[] = [];
  @Input() viewMode: 'rows' | 'columns' = 'rows';

  tableDocuments: TableDocument[] = [];
  columns: ColumnDef[] = [];
  sectionGroups: SectionGroup[] = [];
  expanded = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['documents'] || changes['viewMode']) {
      this.rebuildRowsView();
      this.rebuildColumnsView();
    }
  }

  private rebuildRowsView() {
    this.tableDocuments = this.documents.map(doc => {
      const order: string[] = [];
      const byLabel = new Map<string, ExtractedFieldEdit[]>();
      for (const field of [...doc.fields].filter(f => f.includeInExport).sort((a, b) => a.sortOrder - b.sortOrder)) {
        const label = field.sectionLabel || 'General';
        if (!byLabel.has(label)) { byLabel.set(label, []); order.push(label); }
        byLabel.get(label)!.push(field);
      }
      return { id: doc.id, fileName: doc.fileName, sections: order.map(label => ({ label, fields: byLabel.get(label)! })) };
    });
  }

  private rebuildColumnsView() {
    const firstSortOrder = new Map<string, number>();
    const sectionOf = new Map<string, string>();
    for (const doc of this.documents) {
      for (const field of doc.fields) {
        if (!field.includeInExport) continue;
        if (!firstSortOrder.has(field.fieldKey) || field.sortOrder < firstSortOrder.get(field.fieldKey)!) {
          firstSortOrder.set(field.fieldKey, field.sortOrder);
          sectionOf.set(field.fieldKey, field.sectionLabel || 'General');
        }
      }
    }
    const orderedKeys = Array.from(firstSortOrder.keys()).sort((a, b) => firstSortOrder.get(a)! - firstSortOrder.get(b)!);
    this.columns = orderedKeys.map(key => ({ key }));

    const groupOrder: string[] = [];
    const bySection = new Map<string, ColumnDef[]>();
    for (const col of this.columns) {
      const label = sectionOf.get(col.key) || 'General';
      if (!bySection.has(label)) { bySection.set(label, []); groupOrder.push(label); }
      bySection.get(label)!.push(col);
    }
    this.sectionGroups = groupOrder.map(label => ({ label, columns: bySection.get(label)! }));
  }

  findValue(doc: FieldEditorDocument, key: string): string {
    return doc.fields.find(f => f.fieldKey === key)?.fieldValue || '—';
  }
}
