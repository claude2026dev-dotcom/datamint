import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExtractedFieldEdit, FieldEditorDocument } from '../../../core/models/models';
import { IconComponent } from '../icon/icon.component';

interface RepeatingTable {
  columns: string[];
  rows: (ExtractedFieldEdit | undefined)[][];
}

interface TableSection {
  label: string;
  fields: ExtractedFieldEdit[];
  // Set when this section's fields look like AI-extracted repeating line items (the same field
  // key appearing more than once, e.g. "Item Description" x3 for a 3-line invoice) - rendered as
  // a proper mini-table (columns=field names, one row per item) instead of a flat key/value list
  // that would otherwise interleave "Item Description"/"Item Quantity" pairs with no visual
  // grouping between one line item and the next.
  repeating: RepeatingTable | null;
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
    @if (viewMode === 'rows') {
      @for (doc of tableDocuments; track doc.id) {
        <div class="dm-card table-card">
          @if (tableDocuments.length > 1) {
            <div class="doc-head">{{ doc.fileName }}</div>
          }
          <div class="table-scroll">
            <table class="plain-table rows-table">
              <thead>
                <tr><th class="col-key">Field</th><th class="col-val">Value</th><th class="col-type">Type</th></tr>
              </thead>
              <tbody>
                @for (section of doc.sections; track section.label) {
                  @if (!isUnsectioned(doc)) {
                    <tr class="section-row"><td colspan="3">{{ section.label }}</td></tr>
                  }
                  @if (section.repeating; as rep) {
                    <tr class="line-items-row">
                      <td colspan="3">
                        <div class="mini-table-scroll">
                          <table class="mini-table">
                            <thead><tr>@for (col of rep.columns; track col) { <th>{{ col }}</th> }</tr></thead>
                            <tbody>
                              @for (row of rep.rows; track $index) {
                                <tr>@for (cell of row; track $index) { <td>{{ cell?.fieldValue || '—' }}</td> }</tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  } @else {
                    @for (field of section.fields; track field.id; let odd = $odd) {
                      <tr [class.odd]="odd">
                        <td class="col-key">{{ field.fieldKey }}</td>
                        <td class="col-val">{{ field.fieldValue || '—' }}</td>
                        <td class="col-type"><span class="type-pill">{{ field.semanticType }}</span></td>
                      </tr>
                    }
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    } @else {
      @if (documents.length > 1) {
        <!-- Only shown on a narrow screen (see the media query below) - the desktop grid makes
             the row-per-document comparison shape obvious on its own, but once it reshapes into
             stacked per-document cards for mobile, nothing else on screen explains that these
             cards are still the same side-by-side comparison table underneath, just one column's
             values stacked as label/value pairs per card instead of true side-by-side columns. -->
        <p class="mobile-columns-hint">
          <app-icon name="sparkles" [size]="13" />
          Each card below is one document - same comparison table as your Excel/JSON export, reshaped to fit this screen.
        </p>
      }
      <div class="dm-card table-card">
        <div class="table-scroll">
          <table class="plain-table cols-table">
            <thead>
              @if (hasRealSections()) {
                <tr>
                  <th class="doc-col">Document</th>
                  @for (group of sectionGroups; track group.label) {
                    <th [attr.colspan]="group.columns.length" class="section-head"><span class="section-head-label">{{ group.label }}</span></th>
                  }
                </tr>
                <tr>
                  <th class="doc-col-spacer"></th>
                  @for (col of columns; track col.key) { <th>{{ col.key }}</th> }
                </tr>
              } @else {
                <tr>
                  <th class="doc-col single-row">Document</th>
                  @for (col of columns; track col.key) { <th class="single-row">{{ col.key }}</th> }
                </tr>
              }
            </thead>
            <tbody>
              @for (doc of documents; track doc.id) {
                <tr class="doc-row">
                  <td class="doc-col" [title]="doc.fileName">{{ doc.fileName }}</td>
                  @for (col of columns; track col.key) {
                    <td [attr.data-label]="col.key">{{ findValue(doc, col.key) }}</td>
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
    /* A grid of borders on every cell compounds much more heavily than a single border around a
       card - the standard --dm-border reads noticeably darker/harsher here than it does used
       once around a card elsewhere in the app. This lighter, blended variant is scoped to just
       this component's internal grid lines (not the outer card border, which stays as-is) so
       rows/columns still read as clearly separated without looking like a heavy grid. */
    :host { --grid-line: color-mix(in srgb, var(--dm-border) 55%, transparent); }
    /* Always spans the container's full width, matching every other card in the app (the edit
       view's field cards, upload page, etc.) - a fit-content/centered card used to leave large,
       empty gutters on both sides for a document with only a few short fields, which read as
       unfinished/unprofessional rather than deliberate page margins. A document with genuinely
       many columns still scrolls horizontally inside .table-scroll instead of being squeezed. */
    .table-card { padding: 0; margin: 0 0 20px; overflow: hidden; width: 100%; }
    .table-card .plain-table { width: 100%; }
    .doc-head { padding: 13px 16px; font-weight: 700; font-size: 0.94rem; border-bottom: 1px solid var(--dm-border); background: color-mix(in srgb, var(--dm-primary) 7%, var(--dm-surface)); }
    /* Thin, theme-matched scrollbar instead of the browser's default chunky one - transparent
       track so it only shows visual weight where the thumb actually is. */
    /* scrollbar-gutter:stable reserves the scrollbar's width whether or not a vertical scrollbar
       actually appears - without it, a shorter document (no scrollbar) renders a few pixels
       wider than a taller stacked document that DOES need one, shifting the Field/Value/Type
       column boundaries out of alignment between cards even though both use the same fixed
       column widths. */
    .table-scroll { max-height: 72vh; overflow: auto; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: var(--dm-scrollbar-thumb) transparent; }
    .table-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
    .table-scroll::-webkit-scrollbar-track { background: transparent; }
    .table-scroll::-webkit-scrollbar-thumb { background: var(--dm-scrollbar-thumb); border-radius: 4px; }
    .table-scroll::-webkit-scrollbar-thumb:hover { background: var(--dm-scrollbar-thumb-hover); }
    /* border-collapse:collapse + position:sticky cells is a well-documented Chromium/WebKit
       rendering bug: adjacent cell borders and backgrounds can repaint incorrectly during
       scroll, leaving ghosted/overlapping text right at the sticky boundary - exactly the
       "text overlapping the header" artifacts this replaced. border-collapse:separate with
       per-cell bottom/right borders (instead of all four sides) draws the same clean grid
       without tripping that bug, since collapsed cells never need to be reconciled. */
    .plain-table { border-collapse: separate; border-spacing: 0; table-layout: auto; width: auto; }
    .plain-table th, .plain-table td { border-bottom: 1px solid var(--grid-line); border-right: 1px solid var(--grid-line); padding: 14px 18px; text-align: left; vertical-align: top; font-size: 1rem; line-height: 1.45; background: var(--dm-bg, var(--dm-surface)); overflow-wrap: break-word; }
    .plain-table th:first-child, .plain-table td:first-child { border-left: 1px solid var(--grid-line); }
    /* Plain --dm-bg-elevated (near-white on top of a near-white body in light mode) barely read
       as a "header" at all - a soft primary-tinted wash makes the column-name row clearly its
       own band at a glance, in both themes, without going as loud as a solid accent color. */
    .plain-table thead th { position: sticky; top: 0; z-index: 3; background: color-mix(in srgb, var(--dm-primary) 8%, var(--dm-bg-elevated)); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); font-weight: 700; border-top: 1px solid var(--grid-line); will-change: transform; }
    /* table-layout:auto sizes each <table> to ITS OWN content, independently of any sibling
       table - fine for a single document, but in bulk Rows view every document gets its own
       <table> stacked one after another, and each one would end up with a different Field/Type
       column width depending on that one document's own longest label, leaving the Field/Value
       boundary drift visibly from card to card down the page. table-layout:fixed with an
       explicit width on Field/Type (col-val left unset, so it fills whatever's left) forces every
       .rows-table to use the exact same column boundaries, since they all now share the same
       full-bleed table width from .table-card - the alignment is then guaranteed by construction,
       not by coincidence of similar content.
       min-width matters just as much as the fixed widths themselves: without it, a narrow mobile
       viewport (e.g. 375px) is well under Field(260)+Type(190)=450px alone, so the unset Value
       column's "remainder" share of the table's width goes negative - the browser still renders
       it, but at a sliver of a width, wrapping every single character of the value onto its own
       line. min-width keeps the table itself wider than the viewport instead, so .table-scroll's
       existing horizontal scroll kicks in (the same swipe-to-see-more pattern the Columns view
       already relies on) rather than ever collapsing a column to unreadable vertical text. */
    .rows-table { table-layout: fixed; min-width: 640px; }
    .rows-table .col-key { width: 260px; }
    .rows-table .col-type { width: 190px; }
    .col-key { font-weight: 600; }
    .col-type { white-space: nowrap; }
    .type-pill { display: inline-block; font-size: 0.76rem; font-weight: 600; padding: 4px 12px; border-radius: 999px; background: rgba(99,102,241,0.1); color: var(--dm-primary); white-space: nowrap; }
    .section-row td { background: color-mix(in srgb, var(--dm-primary) 7%, var(--dm-surface)); font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--dm-primary); border-left: 3px solid var(--dm-primary); }
    tbody tr.odd td { background: var(--dm-surface); }

    /* Repeating line items (AI-extracted duplicate field keys, e.g. multiple "Item Description"
       entries for a multi-line invoice) render as a real nested table - columns=field names,
       one row per item - instead of a flat key/value list that would otherwise interleave every
       item's fields with no visual separation between one line item and the next. */
    .line-items-row td { padding: 10px 16px; background: var(--dm-bg, var(--dm-surface)); }
    .mini-table-scroll { overflow-x: auto; }
    .mini-table { width: 100%; border-collapse: collapse; }
    .mini-table th, .mini-table td { padding: 10px 14px; text-align: left; font-size: 0.88rem; border-bottom: 1px solid var(--grid-line); white-space: nowrap; }
    .mini-table th { background: var(--dm-surface); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--dm-text-muted); font-weight: 700; }
    .mini-table tbody tr:last-child td { border-bottom: none; }
    .mini-table tbody tr:nth-child(odd) td { background: var(--dm-surface); }
    /* tbody tr.odd td (3 type selectors) otherwise outranks td.doc-col (1 type selector) at
       equal class-count, silently overwriting the frozen column's elevated background back to
       the plain row color on every odd row - a real, provable cause of "ghosting" right at the
       frozen-column boundary, not just a hunch. Re-assert it here with matching specificity. */
    tbody tr.odd td.doc-col { background: var(--dm-bg-elevated); }

    /* The Columns table is meant to size to its content and scroll horizontally when there are
       many field columns. */
    .cols-table { table-layout: auto; width: auto; min-width: max-content; }
    .cols-table thead tr:first-child th { top: 0; height: 38px; }
    .cols-table thead tr:nth-child(2) th { top: 38px; height: 38px; }
    /* When the document(s) have no real sections, the two-row header (group band + column
       names) collapses to one plain row - it needs its own sticky-top rule since the generic
       ".plain-table thead th" already covers top:0, but nothing sets a sensible row height. */
    .single-row { top: 0; height: 38px; }
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
    .plain-table th.section-head { padding: 0; text-align: left; background: color-mix(in srgb, var(--dm-primary) 7%, var(--dm-surface)); box-shadow: inset 0 -1px 0 var(--dm-border); }
    .section-head-label {
      position: sticky; left: 220px; z-index: 4; display: inline-block;
      padding: 9px 15px; color: var(--dm-primary); font-weight: 700;
    }
    /* box-shadow, not just border - separate border-collapse means a plain border alone
       reads faint against scrolled content sliding directly underneath. The shadow gives the
       frozen column a clear, unmistakable edge, the same visual cue Excel/Sheets use for a
       frozen-pane boundary. z-index sits above the sticky header row (3) so the frozen
       column's own header cell ("Document") always wins the corner intersection. Width is a
       fixed value (not max-width) so the sticky section-head cells above have a known, matching
       left offset to dock against - a variable/content-sized frozen column would misalign them. */
    .doc-col, .doc-col-spacer { position: sticky; left: 0; background: var(--dm-bg-elevated); font-weight: 600; z-index: 5; width: 220px; min-width: 220px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-shadow: 2px 0 6px rgba(0,0,0,0.15); will-change: transform; }
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
      .plain-table th, .plain-table td { padding: 10px 13px; font-size: 0.88rem; }
    }

    /* Columns view is a real spreadsheet grid - great on a wide screen, but on a phone it can
       easily have more field columns than the screen can ever show at once, forcing a sideways
       scroll where a column's header/value trails off the edge mid-word (unreadable, and easy to
       mistake for a bug in the data itself). Rather than fight that with the grid intact, the
       standard responsive-table answer applies here: below this width, stop rendering it as a
       table at all and let each document become its own stacked "Field: Value" card instead -
       exactly what a phone screen is actually good at scrolling (vertically), with nothing ever
       cut off sideways. thead is hidden entirely (its column names move onto each value via
       data-label, see below); each <tr> becomes a bordered card and each <td> a flex row with its
       field name as a label. .doc-col becomes the card's own heading instead of a frozen sticky
       column, so it needs its sticky/frozen styling turned off here too. */
    .mobile-columns-hint { display: none; }
    @media (max-width: 700px) {
      .mobile-columns-hint {
        display: flex; align-items: center; gap: 7px; margin: 0 0 12px; padding: 10px 14px;
        border-radius: var(--dm-radius-sm); background: color-mix(in srgb, var(--dm-primary) 6%, var(--dm-surface));
        color: var(--dm-text-muted); font-size: 0.82rem; line-height: 1.4;
      }
      .mobile-columns-hint app-icon { color: var(--dm-primary); flex-shrink: 0; }
      .cols-table { display: block; width: 100%; min-width: 0; table-layout: auto; }
      .cols-table thead { display: none; }
      .cols-table tbody { display: block; }
      /* A stronger card boundary (thicker border, real shadow, more breathing room between
         cards) than the desktop grid needs - on a phone, this card IS the whole visual unit that
         says "everything below belongs to this one document", so it has to read clearly as its
         own block at a glance, not just another table row. */
      .cols-table .doc-row {
        display: block; margin-bottom: 20px; border: 1px solid var(--dm-border);
        border-radius: var(--dm-radius-md); overflow: hidden; background: var(--dm-bg-elevated);
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      }
      .cols-table .doc-row:last-child { margin-bottom: 0; }
      /* Label above value (not side-by-side) - a side-by-side row forces the field name and its
         value to compete for the same line, and looks broken the moment a longer field name wraps
         to two lines while its value stays pinned to the right on one line, with the two no longer
         reading as a clear pair. Stacking them stays readable regardless of either one's length,
         and matches the label-above-value shape already used everywhere else in the app's edit
         view instead of inventing a new side-by-side pattern just for this one case. */
      .cols-table .doc-row td { display: block; padding: 12px 16px; border: none; border-bottom: 1px solid var(--grid-line); text-align: left; }
      .cols-table .doc-row td:last-child { border-bottom: none; }
      /* content:attr() reads the column name straight from the data-label attribute set on each
         <td> in the template - no separate label markup needed, and it can never drift out of
         sync with the real column list the way a manually-duplicated label element could. */
      .cols-table .doc-row td:not(.doc-col)::before {
        content: attr(data-label); display: block; font-weight: 700; font-size: 0.7rem;
        text-transform: uppercase; letter-spacing: 0.03em; color: var(--dm-text-muted); margin-bottom: 4px;
      }
      .cols-table .doc-col, .cols-table td.doc-col {
        position: static; display: flex; align-items: center; gap: 8px; width: auto; min-width: 0; max-width: none;
        padding: 13px 16px; background: color-mix(in srgb, var(--dm-primary) 9%, var(--dm-surface));
        border-bottom: 1px solid var(--dm-border); font-weight: 700; font-size: 0.96rem;
        box-shadow: none; white-space: normal; overflow-wrap: break-word;
      }
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
      return {
        id: doc.id, fileName: doc.fileName,
        sections: order.map(label => {
          const fields = byLabel.get(label)!;
          return { label, fields, repeating: this.detectRepeatingTable(fields) };
        })
      };
    });
  }

  /// A section reads as repeating line items only when EVERY distinct key repeats the exact same
  /// number of times, at least twice, with at least 2 columns - a true uniform grid (e.g. "Item
  /// Description"/"Item Quantity"/"Item Unit Price" each appearing 3 times over for a 3-line
  /// invoice). Anything looser than that is deliberately rejected: a section can easily contain
  /// ONE coincidentally-duplicated key without being a real repeating structure at all - e.g. a
  /// messy extraction with "Total Amount" appearing twice ("$5.90" and "$5.90 USD") alongside a
  /// "Tax Amount" that only appears once. Treating that as a table would misalign every column
  /// after the stray duplicate, which is worse than just leaving it as a flat list.
  private detectRepeatingTable(fields: ExtractedFieldEdit[]): RepeatingTable | null {
    const columns: string[] = [];
    const counts = new Map<string, number>();
    for (const f of fields) {
      if (!counts.has(f.fieldKey)) { counts.set(f.fieldKey, 0); columns.push(f.fieldKey); }
      counts.set(f.fieldKey, counts.get(f.fieldKey)! + 1);
    }
    if (columns.length < 2) return null;
    const expectedRows = fields.length / columns.length;
    if (!Number.isInteger(expectedRows) || expectedRows < 2) return null;
    for (const c of counts.values()) if (c !== expectedRows) return null;

    const colIndex = new Map<string, number>();
    columns.forEach((key, i) => colIndex.set(key, i));

    const rows: (ExtractedFieldEdit | undefined)[][] = [];
    let current: (ExtractedFieldEdit | undefined)[] = new Array(columns.length).fill(undefined);
    for (const f of fields) {
      const idx = colIndex.get(f.fieldKey)!;
      if (current[idx] !== undefined) {
        rows.push(current);
        current = new Array(columns.length).fill(undefined);
      }
      current[idx] = f;
    }
    if (current.some(c => c !== undefined)) rows.push(current);
    return { columns, rows };
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
