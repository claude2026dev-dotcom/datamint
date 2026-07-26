import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExtractedFieldEdit, FieldEditorDocument } from '../../../core/models/models';

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
  imports: [CommonModule],
  template: `
    @if (viewMode === 'rows') {
      @for (doc of tableDocuments; track doc.id) {
        <div class="dm-card table-card">
          @if (tableDocuments.length > 1) {
            <div class="doc-head">{{ doc.fileName }}</div>
          }
          <div class="table-scroll">
            <table class="plain-table">
              <thead>
                <tr><th class="col-key">Field</th><th class="col-val">Value</th><th class="col-type">Type</th></tr>
              </thead>
              <tbody>
                @for (section of doc.sections; track section.label) {
                  @if (!isUnsectioned(doc)) {
                    <tr class="section-row"><td colspan="3">{{ section.label }}</td></tr>
                  }
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
        <div class="table-scroll">
          <table class="plain-table cols-table" [class.no-doc-col]="documents.length <= 1">
            <thead>
              @if (hasRealSections()) {
                <tr>
                  @if (documents.length > 1) { <th class="doc-col">Document</th> }
                  @for (group of sectionGroups; track group.label) {
                    <th [attr.colspan]="group.columns.length" class="section-head"><span class="section-head-label">{{ group.label }}</span></th>
                  }
                </tr>
                <tr>
                  @if (documents.length > 1) { <th class="doc-col-spacer"></th> }
                  @for (col of columns; track col.key) { <th>{{ col.key }}</th> }
                </tr>
              } @else {
                <tr>
                  @if (documents.length > 1) { <th class="doc-col single-row">Document</th> }
                  @for (col of columns; track col.key) { <th class="single-row">{{ col.key }}</th> }
                </tr>
              }
            </thead>
            <tbody>
              @for (doc of documents; track doc.id) {
                <tr>
                  @if (documents.length > 1) { <td class="doc-col" [title]="doc.fileName">{{ doc.fileName }}</td> }
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
    /* Fit-content (not a flat 100%) so a document with only 2-3 short fields renders a compact
       card instead of a mostly-empty box stretched to the full width of a wide page container -
       the card only ever grows as wide as it actually needs to, up to the available space. */
    .table-card { padding: 0; margin-bottom: 20px; overflow: hidden; width: fit-content; max-width: 100%; }
    .doc-head { padding: 13px 16px; font-weight: 700; font-size: 0.94rem; border-bottom: 1px solid var(--dm-border); background: var(--dm-surface); }
    .table-scroll { max-height: 72vh; overflow: auto; }
    /* border-collapse:collapse + position:sticky cells is a well-documented Chromium/WebKit
       rendering bug: adjacent cell borders and backgrounds can repaint incorrectly during
       scroll, leaving ghosted/overlapping text right at the sticky boundary - exactly the
       "text overlapping the header" artifacts this replaced. border-collapse:separate with
       per-cell bottom/right borders (instead of all four sides) draws the same clean grid
       without tripping that bug, since collapsed cells never need to be reconciled. */
    /* table-layout:auto (content-driven), not fixed+100% - a fixed-percentage Value column
       looks absurdly wide for a document with only a couple of short fields, stretched across
       whatever width the page container happens to have. Auto layout sizes the table to its
       own content instead (paired with .table-card's fit-content above), while col-type keeps
       an explicit width the algorithm treats as a strong preference and col-key/col-val cap
       their own growth with max-width + wrapping - so Type still can't get squeezed off-screen
       by a long value, it just wraps within its own bound instead of growing the table wider. */
    .plain-table { border-collapse: separate; border-spacing: 0; table-layout: auto; width: auto; }
    .plain-table th, .plain-table td { border-bottom: 1px solid var(--dm-border); border-right: 1px solid var(--dm-border); padding: 11px 16px; text-align: left; vertical-align: top; font-size: 0.92rem; background: var(--dm-bg, var(--dm-surface)); overflow-wrap: break-word; }
    .plain-table th:first-child, .plain-table td:first-child { border-left: 1px solid var(--dm-border); }
    .plain-table thead th { position: sticky; top: 0; z-index: 3; background: var(--dm-bg-elevated); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); font-weight: 700; border-top: 1px solid var(--dm-border); will-change: transform; }
    .col-key { font-weight: 600; max-width: 320px; }
    .col-val { max-width: 640px; }
    .col-type { width: 110px; white-space: nowrap; }
    .type-pill { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: rgba(99,102,241,0.1); color: var(--dm-primary); white-space: nowrap; }
    .section-row td { background: var(--dm-surface); font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--dm-primary); border-left: 3px solid var(--dm-primary); }
    tbody tr.odd td { background: var(--dm-surface); }
    /* tbody tr.odd td (3 type selectors) otherwise outranks td.doc-col (1 type selector) at
       equal class-count, silently overwriting the frozen column's elevated background back to
       the plain row color on every odd row - a real, provable cause of "ghosting" right at the
       frozen-column boundary, not just a hunch. Re-assert it here with matching specificity. */
    tbody tr.odd td.doc-col { background: var(--dm-bg-elevated); }

    /* The Columns table is meant to size to its content and scroll horizontally when there are
       many field columns. */
    .cols-table { table-layout: auto; width: auto; min-width: max-content; }
    .cols-table thead tr:first-child th { top: 0; height: 34px; }
    .cols-table thead tr:nth-child(2) th { top: 34px; height: 34px; }
    /* When the document(s) have no real sections, the two-row header (group band + column
       names) collapses to one plain row - it needs its own sticky-top rule since the generic
       ".plain-table thead th" already covers top:0, but nothing sets a sensible row height. */
    .single-row { top: 0; height: 34px; }
    /* No frozen "Document" column at all in the single-document case (it would just repeat one
       filename down every row) - the section-head label's sticky anchor has nothing to dock
       against then, so it should sit flush left instead of leaving a 200px gap for a column
       that was never rendered. */
    .cols-table.no-doc-col .section-head-label { left: 0; }
    /* Sticky on the <th colspan> ITSELF doesn't hand off cleanly between adjacent sections: a
       table cell's sticky containing block is the whole scrolling area, not its own column
       span, so once a cell's natural position scrolls past the anchor it stays stuck there
       FOREVER (not just until its own columns end) - every later section eventually also
       activates at the same spot and they all pile up on top of each other. The fix is the
       standard one for "sticky sub-header within a bounded region": leave the <th> itself
       unpositioned (it just scrolls normally with its columns) and make an INNER element
       sticky instead - a normal <th> is a containing block for its own children, so the
       label's sticky range is correctly bounded to this cell's own width, and it naturally
       scrolls away with the cell once that section's columns are fully passed, at which point
       the next section's own label (now within the visible/sticky range) takes over. */
    /* .plain-table th's own padding rule has higher specificity (class+type vs. class alone) so
       overriding it here needs a matching-or-higher selector, not just ".section-head" alone. */
    .plain-table th.section-head { padding: 0; text-align: left; background: var(--dm-surface); box-shadow: inset 0 -1px 0 var(--dm-border); }
    .section-head-label {
      position: sticky; left: 200px; z-index: 4; display: inline-block;
      padding: 8px 14px; color: var(--dm-primary); font-weight: 700;
    }
    /* box-shadow, not just border - separate border-collapse means a plain border alone
       reads faint against scrolled content sliding directly underneath. The shadow gives the
       frozen column a clear, unmistakable edge, the same visual cue Excel/Sheets use for a
       frozen-pane boundary. z-index sits above the sticky header row (3) so the frozen
       column's own header cell ("Document") always wins the corner intersection. Width is a
       fixed value (not max-width) so the sticky section-head cells above have a known, matching
       left offset to dock against - a variable/content-sized frozen column would misalign them. */
    .doc-col, .doc-col-spacer { position: sticky; left: 0; background: var(--dm-bg-elevated); font-weight: 600; z-index: 5; width: 200px; min-width: 200px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-shadow: 2px 0 6px rgba(0,0,0,0.15); will-change: transform; }
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

  /// True when every field in this document sits in the single default "General" bucket - i.e.
  /// nobody ever grouped this document into real sections. Showing a lone "GENERAL" banner row
  /// in that case is just noise (there's nothing being distinguished from), so both this and the
  /// Columns view's equivalent check skip the section chrome entirely and render a flat table.
  isUnsectioned(doc: TableDocument): boolean {
    return doc.sections.length === 1 && doc.sections[0].label === 'General';
  }

  /// Same "nothing to distinguish" check as isUnsectioned, for the Columns view's own grouping
  /// (built from all documents combined rather than per-document).
  hasRealSections(): boolean {
    return this.sectionGroups.length > 1 || (this.sectionGroups.length === 1 && this.sectionGroups[0].label !== 'General');
  }
}
