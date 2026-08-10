import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ExtractedFieldEdit, FieldEditorDocument, SEMANTIC_TYPES } from '../../../core/models/models';
import { IconComponent } from '../icon/icon.component';
import { AutoGrowDirective } from '../../directives/auto-grow.directive';

export interface FieldCardEvent { docId: string; field: ExtractedFieldEdit; }
export interface FieldCardReorderEvent { docId: string; fields: ExtractedFieldEdit[]; }
export interface FieldCardSectionRenameEvent { docId: string; oldLabel: string; newLabel: string; }

const CUSTOM_TYPE = '__custom__';

interface CardSection {
  label: string;
  fields: ExtractedFieldEdit[];
}

interface CardDocument {
  id: string;
  fileName: string;
  sections: CardSection[];
}

/// The primary editing surface for extracted data - a dense, professional record list (label
/// left, value right, one thin divider per field), the kind of layout a real financial statement
/// or ledger reads like, rather than a spreadsheet grid or a scattered card wall. Sections are
/// drag-reorderable groups; the type picker is a real dropdown listing every known type (plus a
/// "Custom" option) so every SemanticType value is always visible and selectable, never just a
/// free-text guess. Shows the AI's original value inline once a value has actually changed, and
/// offers section-level and whole-document Select all/Unselect all for the export checkbox.
@Component({
  selector: 'app-field-card-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, IconComponent, AutoGrowDirective],
  template: `
    <div class="filter-bar">
      <div class="filter-row">
        <div class="filter-field">
          <app-icon name="search" [size]="14" />
          <input class="filter-input" [(ngModel)]="fieldSearchTerm" placeholder="Filter by field name…" />
        </div>
        <div class="filter-field">
          <app-icon name="search" [size]="14" />
          <input class="filter-input" [(ngModel)]="valueSearchTerm" placeholder="Filter by value…" />
        </div>
        @if (fieldSearchTerm || valueSearchTerm) {
          <button type="button" class="dm-btn dm-btn-ghost clear-filter-btn" (click)="fieldSearchTerm = ''; valueSearchTerm = ''">
            <app-icon name="close" [size]="13" /> Clear filters
          </button>
        }
      </div>
      @if (fieldSearchTerm || valueSearchTerm) {
        <p class="filter-summary muted small">Showing fields matching {{ fieldSearchTerm ? 'name "' + fieldSearchTerm + '"' : '' }}{{ fieldSearchTerm && valueSearchTerm ? ' and ' : '' }}{{ valueSearchTerm ? 'value "' + valueSearchTerm + '"' : '' }}.</p>
      }
    </div>

    <div class="usage-tip">
      <app-icon name="sparkles" [size]="14" />
      <span>Drag <app-icon name="grip" [size]="12" /> to reorder fields or move them between sections. "Select all"/"Unselect all" controls which fields are included when you export or email.</span>
    </div>

    @for (doc of docModels; track doc.id; let docIndex = $index) {
      <div class="doc-group">
        @if (docModels.length > 1) {
          <div class="doc-group-head">
            <span class="doc-badge">{{ docIndex + 1 }}</span>
            <app-icon name="file-text" [size]="16" />
            <span class="doc-name" [title]="doc.fileName">{{ doc.fileName }}</span>
            <span class="doc-progress">{{ includedCount(doc) }} of {{ totalCount(doc) }} included in export</span>
          </div>
        }

        <div class="doc-toolbar">
          <button type="button" class="link-btn" (click)="setDocIncluded(doc, true)">Select all</button>
          <span class="dot">·</span>
          <button type="button" class="link-btn" (click)="setDocIncluded(doc, false)">Unselect all</button>
          <span class="muted small toolbar-hint">for export</span>
          <span class="dot">·</span>
          <!-- Strictly one or the other, never both and never neither - exactly one control is
               ever visible for this toggle, in the same spot each time, so it reads as a single
               real-world switch flipping (like Undo) instead of two independent buttons that
               could each seem to randomly appear or vanish. -->
          @if (isFlatDoc(doc)) {
            <button type="button" class="link-btn muted-link" (click)="restoreSections(doc)"
                    title="Undo - bring back the original AI-detected sections">
              ↺ Restore sections
            </button>
          } @else {
            <button type="button" class="link-btn muted-link" (click)="flattenSections(doc)"
                    title="Show every field in one plain list, with no section groupings">
              Remove all sections
            </button>
          }
        </div>

        @if (searchTerm && !docHasMatch(doc)) {
          <p class="muted small no-match">No fields match "{{ searchTerm }}" in this document.</p>
        }

        <div cdkDropListGroup>
          @for (section of doc.sections; track section.label) {
            @if (sectionMatches(section)) {
              <div class="dm-card section-card">
              @if (!isFlatDoc(doc)) {
                <div class="section-head">
                  <input class="section-title" #titleInput [ngModel]="section.label" (blur)="renameSection(doc, section, titleInput.value)"
                         title="Rename this section" />
                  <div class="section-actions">
                    <span class="muted small">{{ editedCount(section) }} of {{ section.fields.length }} edited</span>
                    <button type="button" class="link-btn" (click)="setSectionIncluded(doc, section, true)">All</button>
                    <button type="button" class="link-btn" (click)="setSectionIncluded(doc, section, false)">None</button>
                  </div>
                </div>
              }

              <div class="field-list" cdkDropList [cdkDropListData]="section.fields" [cdkDropListDisabled]="!!searchTerm"
                   (cdkDropListDropped)="onDrop($event, doc, section)">
                @for (field of section.fields; track field.id) {
                  @if (fieldMatches(field)) {
                  <div class="field-row" cdkDrag [cdkDragData]="field" [class.excluded]="!field.includeInExport">
                    <span class="drag-handle" cdkDragHandle title="Drag to reorder or move to another section">
                      <app-icon name="grip" [size]="14" />
                    </span>

                    <div class="field-label">
                      <input class="dm-input field-key" [(ngModel)]="field.fieldKey" (blur)="emitSave(doc, field)" placeholder="Field name" />
                      <span class="original-label" [title]="'Detected label: ' + field.originalFieldKey">{{ field.originalFieldKey }}</span>
                    </div>

                    <div class="field-value-col">
                      @if (field.semanticType === 'Date' && canUseDatePicker(field)) {
                        <input type="date" class="dm-input field-value-compact" [ngModel]="toIsoDate(field.fieldValue)"
                               (ngModelChange)="onDateValueChange(doc, field, $event)" />
                      } @else if (field.semanticType === 'Boolean') {
                        <select class="dm-input field-value-compact" [ngModel]="normalizeBoolean(field.fieldValue)"
                                (ngModelChange)="onBooleanValueChange(doc, field, $event)">
                          <option value="">—</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      } @else if (isNumericType(field.semanticType)) {
                        <input type="text" inputmode="decimal" class="dm-input field-value-compact"
                               [(ngModel)]="field.fieldValue" (blur)="emitSave(doc, field)" />
                      } @else {
                        <textarea class="dm-input field-value" rows="1" appAutoGrow [(ngModel)]="field.fieldValue" (blur)="emitSave(doc, field)"></textarea>
                      }
                      @if (field.wasEditedByUser && field.originalAiValue && field.originalAiValue !== field.fieldValue) {
                        <span class="original-hint" [title]="'AI originally extracted: ' + field.originalAiValue">
                          Originally: {{ field.originalAiValue }}
                        </span>
                      }
                    </div>

                    <div class="field-type-col">
                      <select class="type-select" [ngModel]="isKnownType(field.semanticType) ? field.semanticType : customSentinel"
                              (ngModelChange)="onTypeSelect(doc, field, $event)">
                        @for (type of semanticTypes; track type) { <option [value]="type">{{ type }}</option> }
                        <option [value]="customSentinel">Custom…</option>
                      </select>
                      @if (!isKnownType(field.semanticType)) {
                        <input class="dm-input custom-type-input" [(ngModel)]="field.semanticType" (blur)="emitSave(doc, field)" placeholder="Custom type" />
                      }
                      @if (field.wasEditedByUser && field.originalSemanticType && field.originalSemanticType !== field.semanticType) {
                        <span class="original-hint" [title]="'AI originally classified as: ' + field.originalSemanticType">
                          Was: {{ field.originalSemanticType }}
                        </span>
                      }
                    </div>

                    <div class="field-meta-col">
                      @if (field.pageNumber) { <span class="page-chip">p.{{ field.pageNumber }}</span> }
                      @if (field.wasEditedByUser) { <span class="edited-dot" title="Edited"></span> }
                      <label class="export-toggle" title="Include this field in exports">
                        <input type="checkbox" [(ngModel)]="field.includeInExport" (change)="includeToggled.emit({ docId: doc.id, field })" />
                      </label>
                    </div>
                  </div>
                  }
                }
              </div>
              </div>
            }
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .filter-bar { padding: 14px; margin-bottom: 20px; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-lg); background: var(--dm-surface); }
    .filter-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .filter-field { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; min-width: 180px; padding: 8px 12px; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); background: var(--dm-bg, var(--dm-surface)); color: var(--dm-text-muted); }
    .filter-field:focus-within { border-color: var(--dm-primary); }
    .filter-input { flex: 1; border: none; background: transparent; padding: 2px; font-size: 0.86rem; color: var(--dm-text); min-width: 0; }
    .filter-input:focus { outline: none; }
    .clear-filter-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; padding: 8px 12px; flex-shrink: 0; }
    .filter-summary { margin: 10px 0 0; }
    .no-match { padding: 10px 4px; font-style: italic; }

    .usage-tip {
      display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; margin-bottom: 22px;
      border-radius: var(--dm-radius-sm); background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.18);
      color: var(--dm-text-muted); font-size: 0.82rem; line-height: 1.5;
    }
    .usage-tip app-icon:first-child { color: var(--dm-primary); flex-shrink: 0; margin-top: 2px; }
    .usage-tip span app-icon { display: inline-block; vertical-align: -1px; color: var(--dm-text-muted); }

    .doc-group { margin-bottom: 32px; }
    /* A themed card (not a flat color block) so switching from one document's fields to the
       next is still immediately obvious while scrolling a bulk batch, but reads correctly in
       both light and dark mode - --dm-surface/--dm-border/--dm-text already flip per theme, so
       building on them (instead of a fixed white-on-solid-color banner) means this never needs
       a separate dark-mode override. The left accent stripe + circular badge give it a clear
       focal point without relying on a wall of color for contrast. */
    .doc-group-head {
      display: flex; align-items: center; gap: 12px; padding: 13px 18px; margin-bottom: 14px;
      border: 1px solid var(--dm-border); border-left: 4px solid var(--dm-primary);
      border-radius: var(--dm-radius-md); background: var(--dm-surface);
      box-shadow: 0 1px 3px rgba(0,0,0,0.06); flex-wrap: wrap;
    }
    .doc-group-head app-icon { color: var(--dm-primary); flex-shrink: 0; }
    .doc-badge {
      display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0;
      border-radius: 50%; background: var(--dm-primary); color: white; font-size: 0.72rem; font-weight: 700;
    }
    .doc-name { font-weight: 700; color: var(--dm-text); overflow-wrap: break-word; word-break: break-word; }
    .doc-progress {
      margin-left: auto; font-size: 0.76rem; font-weight: 700; white-space: nowrap;
      padding: 5px 12px; border-radius: 999px; background: rgba(99,102,241,0.12); color: var(--dm-primary);
    }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.78rem; }

    .doc-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .link-btn { background: none; border: none; padding: 2px 4px; font-size: 0.78rem; font-weight: 700; color: var(--dm-primary); cursor: pointer; white-space: nowrap; }
    .link-btn:hover { text-decoration: underline; }
    /* Muted (not primary-colored like Select all/Unselect all) - flattening/restoring sections
       is a less common, structural action (never deletes data, always reversible) and shouldn't
       visually compete with the two everyday export toggles next to it. */
    .muted-link { color: var(--dm-text-muted); }
    .muted-link:hover { color: var(--dm-primary); }
    .dot { color: var(--dm-text-muted); }
    .toolbar-hint { margin-left: 2px; }

    .section-card { padding: 0; margin-bottom: 16px; overflow: hidden; }
    .section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: var(--dm-surface); border-bottom: 1px solid var(--dm-border); flex-wrap: wrap; }
    .section-title { font-size: 0.92rem; font-weight: 700; border: none; background: transparent; padding: 3px 6px; border-radius: var(--dm-radius-sm); min-width: 0; color: var(--dm-text); flex: 1; }
    .section-title:hover, .section-title:focus { background: var(--dm-surface-hover); }
    .section-actions { display: flex; align-items: center; gap: 10px; white-space: nowrap; }

    .field-list { display: flex; flex-direction: column; }
    .field-list.cdk-drop-list-dragging .field-row:not(.cdk-drag-placeholder) { transition: transform 200ms ease; }

    .field-row {
      display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px;
      border-top: 1px solid var(--dm-border); background: var(--dm-bg, var(--dm-surface));
    }
    .field-list .field-row:first-child { border-top: none; }
    .field-row:hover { background: var(--dm-surface-hover); }
    .field-row.excluded { opacity: 0.55; }
    .field-row.cdk-drag-preview { box-shadow: 0 10px 28px rgba(0,0,0,0.25); border-radius: var(--dm-radius-md); background: var(--dm-surface); }
    .field-row.cdk-drag-placeholder { opacity: 0.2; }

    .drag-handle { display: flex; align-items: center; padding-top: 8px; color: var(--dm-text-muted); cursor: grab; touch-action: none; flex-shrink: 0; }
    .drag-handle:active { cursor: grabbing; }

    .field-label { flex: 0 0 220px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .field-key { font-size: 0.86rem; font-weight: 700; border: none; background: transparent; padding: 4px; }
    .field-key:hover, .field-key:focus { border: 1px solid var(--dm-border); background: var(--dm-surface); }
    .original-label { font-size: 0.66rem; color: var(--dm-text-muted); text-transform: uppercase; letter-spacing: 0.02em; padding-left: 4px; overflow-wrap: break-word; }

    .field-value-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .field-value { resize: vertical; min-height: 36px; line-height: 1.4; font-family: inherit; font-size: 0.88rem; overflow-wrap: break-word; width: 100%; }
    /* Single-line control for Date/Boolean/numeric types - these never need the multi-line
       wrapping textarea does, and matching its height keeps the row's controls visually aligned. */
    .field-value-compact { height: 36px; font-family: inherit; font-size: 0.88rem; width: 100%; padding: 7px 10px; }
    .original-hint { font-size: 0.72rem; color: var(--dm-accent); overflow-wrap: break-word; padding-left: 4px; }

    /* Widened from 140px - at that width "Percentage"/"Custom…" visibly truncated inside the
       select, a real bug, not just a look-and-feel preference. */
    .field-type-col { flex: 0 0 170px; display: flex; flex-direction: column; gap: 6px; }
    .type-select { font-size: 0.78rem; font-weight: 600; padding: 6px 8px; border-radius: var(--dm-radius-sm); background: var(--dm-surface); color: var(--dm-text); border: 1px solid var(--dm-border); width: 100%; }
    .custom-type-input { font-size: 0.78rem; padding: 5px 8px; width: 100%; }

    .field-meta-col { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding-top: 6px; }
    .page-chip { font-size: 0.68rem; color: var(--dm-text-muted); white-space: nowrap; }
    .edited-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dm-accent); flex-shrink: 0; }
    .export-toggle { display: flex; }
    .export-toggle input { accent-color: var(--dm-primary); }

    @media (max-width: 720px) {
      .field-row { flex-direction: column; gap: 6px; }
      .drag-handle { display: none; }
      .field-label, .field-value-col, .field-type-col { flex: 1 1 auto; width: 100%; }
      .field-meta-col { padding-top: 0; width: 100%; justify-content: space-between; }
    }
  `]
})
export class FieldCardEditorComponent implements OnChanges {
  @Input() documents: FieldEditorDocument[] = [];

  @Output() fieldSaved = new EventEmitter<FieldCardEvent>();
  @Output() includeToggled = new EventEmitter<FieldCardEvent>();
  @Output() reordered = new EventEmitter<FieldCardReorderEvent>();
  @Output() sectionRenamed = new EventEmitter<FieldCardSectionRenameEvent>();
  @Output() sectionsFlattened = new EventEmitter<{ docId: string }>();
  @Output() sectionsRestored = new EventEmitter<{ docId: string }>();

  semanticTypes = SEMANTIC_TYPES;
  customSentinel = CUSTOM_TYPE;
  docModels: CardDocument[] = [];
  fieldSearchTerm = '';
  valueSearchTerm = '';
  private lastSaved: Record<string, { key: string; value: string | null; type: string }> = {};

  ngOnChanges(changes: SimpleChanges) {
    if (changes['documents']) this.rebuild();
  }

  get searchTerm(): string {
    return this.fieldSearchTerm || this.valueSearchTerm;
  }

  /// Two independent filters, combined with AND when both are set - "field contains X AND
  /// value contains Y" narrows results further rather than broadening them, which is what
  /// having two separate boxes (instead of one combined search) implies. Field matching also
  /// checks the AI's original label, so renaming a field doesn't lose the ability to find it
  /// by what it used to be called.
  fieldMatches(field: ExtractedFieldEdit): boolean {
    const fieldTerm = this.fieldSearchTerm.trim().toLowerCase();
    const valueTerm = this.valueSearchTerm.trim().toLowerCase();
    if (fieldTerm) {
      const matchesField = field.fieldKey.toLowerCase().includes(fieldTerm) || field.originalFieldKey.toLowerCase().includes(fieldTerm);
      if (!matchesField) return false;
    }
    if (valueTerm) {
      const matchesValue = (field.fieldValue ?? '').toLowerCase().includes(valueTerm) || (field.originalAiValue ?? '').toLowerCase().includes(valueTerm);
      if (!matchesValue) return false;
    }
    return true;
  }

  sectionMatches(section: CardSection): boolean {
    return section.fields.some(f => this.fieldMatches(f));
  }

  docHasMatch(doc: CardDocument): boolean {
    return doc.sections.some(s => this.sectionMatches(s));
  }

  private rebuild() {
    this.docModels = this.documents.map(doc => {
      const order: string[] = [];
      const byLabel = new Map<string, ExtractedFieldEdit[]>();
      for (const field of [...doc.fields].sort((a, b) => a.sortOrder - b.sortOrder)) {
        const label = field.sectionLabel || 'General';
        if (!byLabel.has(label)) { byLabel.set(label, []); order.push(label); }
        byLabel.get(label)!.push(field);
        this.lastSaved[field.id] = { key: field.fieldKey, value: field.fieldValue, type: field.semanticType };
      }
      return { id: doc.id, fileName: doc.fileName, sections: order.map(label => ({ label, fields: byLabel.get(label)! })) };
    });
  }

  isKnownType(type: string): boolean {
    return this.semanticTypes.includes(type);
  }

  isNumericType(type: string): boolean {
    return type === 'Number' || type === 'Currency' || type === 'Percentage';
  }

  private static readonly MONTH_NAMES = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];

  private monthIndex(name: string): number {
    const n = name.toLowerCase();
    const exact = FieldCardEditorComponent.MONTH_NAMES.indexOf(n);
    if (exact >= 0) return exact;
    return FieldCardEditorComponent.MONTH_NAMES.findIndex(mn => mn.startsWith(n));
  }

  /// Extracts year/month/day as plain integers straight from the raw text, deliberately never
  /// constructing a JS Date object for this - `new Date("31 March 2026")` parses in the local
  /// timezone while `new Date("2026-03-31")` parses as UTC, so round-tripping through Date math
  /// can silently shift the day by one depending on the browser's timezone offset. Covers the
  /// same set of formats the backend's TryParseDate already recognizes for export.
  private parseDateParts(raw: string): { y: number; m: number; d: number } | null {
    const s = raw.trim();
    let m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const month = this.monthIndex(m[2]);
      if (month >= 0) return { y: +m[3], m: month + 1, d: +m[1] };
    }
    m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
      const month = this.monthIndex(m[1]);
      if (month >= 0) return { y: +m[3], m: month + 1, d: +m[2] };
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) {
      const a = +m[1], b = +m[2], y = +m[3];
      if (a > 12) return { y, m: b, d: a };
      if (b > 12) return { y, m: a, d: b };
      return { y, m: b, d: a }; // ambiguous - default to dd/MM, matching the app's other formats
    }
    return null;
  }

  toIsoDate(raw: string | null): string {
    if (!raw) return '';
    const parts = this.parseDateParts(raw);
    if (!parts) return '';
    return `${String(parts.y).padStart(4, '0')}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
  }

  /// A real <input type=date> only makes sense to show if the current value is either empty (a
  /// blank field the user hasn't touched) or actually parses as a date - otherwise the picker
  /// would silently blank out text it can't represent. Falls back to a plain textarea for
  /// anything unparseable, so an odd/free-text "date" value is never lost.
  canUseDatePicker(field: ExtractedFieldEdit): boolean {
    return !field.fieldValue || !!this.parseDateParts(field.fieldValue);
  }

  onDateValueChange(doc: CardDocument, field: ExtractedFieldEdit, isoValue: string) {
    field.fieldValue = isoValue || null;
    this.emitSave(doc, field);
  }

  normalizeBoolean(raw: string | null): string {
    if (!raw) return '';
    const v = raw.trim().toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(v)) return 'true';
    if (['no', 'n', 'false', '0'].includes(v)) return 'false';
    return '';
  }

  onBooleanValueChange(doc: CardDocument, field: ExtractedFieldEdit, value: string) {
    field.fieldValue = value === 'true' ? 'Yes' : value === 'false' ? 'No' : null;
    this.emitSave(doc, field);
  }

  onTypeSelect(doc: CardDocument, field: ExtractedFieldEdit, value: string) {
    if (value === CUSTOM_TYPE) {
      if (this.isKnownType(field.semanticType)) field.semanticType = '';
      return;
    }
    field.semanticType = value;
    this.emitSave(doc, field);
  }

  includedCount(doc: CardDocument): number {
    return doc.sections.reduce((sum, s) => sum + s.fields.filter(f => f.includeInExport).length, 0);
  }

  totalCount(doc: CardDocument): number {
    return doc.sections.reduce((sum, s) => sum + s.fields.length, 0);
  }

  editedCount(section: CardSection): number {
    return section.fields.filter(f => f.wasEditedByUser).length;
  }

  setDocIncluded(doc: CardDocument, include: boolean) {
    for (const section of doc.sections) this.setSectionIncluded(doc, section, include);
  }

  setSectionIncluded(doc: CardDocument, section: CardSection, include: boolean) {
    for (const field of section.fields) {
      if (field.includeInExport === include) continue;
      field.includeInExport = include;
      this.includeToggled.emit({ docId: doc.id, field });
    }
  }

  emitSave(doc: CardDocument, field: ExtractedFieldEdit) {
    const previous = this.lastSaved[field.id];
    if (previous && previous.key === field.fieldKey && previous.value === field.fieldValue && previous.type === field.semanticType) return;
    this.lastSaved[field.id] = { key: field.fieldKey, value: field.fieldValue, type: field.semanticType };
    this.fieldSaved.emit({ docId: doc.id, field });
  }

  renameSection(doc: CardDocument, section: CardSection, newLabel: string) {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === section.label) return;
    const oldLabel = section.label;
    section.label = trimmed;
    for (const field of section.fields) field.sectionLabel = trimmed;
    this.sectionRenamed.emit({ docId: doc.id, oldLabel, newLabel: trimmed });
  }

  /// True when a document has nothing worth showing section chrome for - either it never had
  /// real sections (everything AI-assigned to the default "General" bucket), or the user has
  /// since flattened every section back into it. Showing a single lonely "GENERAL" banner
  /// with rename/All/None controls in that case is just noise since there's nothing being
  /// distinguished from - the document-level Select all/Unselect all above already covers the
  /// same "All/None" functionality for the whole document.
  isFlatDoc(doc: CardDocument): boolean {
    return doc.sections.length === 1 && doc.sections[0].label === 'General';
  }

  /// One clear, whole-document action instead of a confusing per-section "remove this one and
  /// it moves into a bucket called General" control - the parent calls the backend flatten
  /// endpoint and refetches, so this only needs to ask for it.
  flattenSections(doc: CardDocument) {
    this.sectionsFlattened.emit({ docId: doc.id });
  }

  /// Undoes flattenSections (or any manual regrouping) by putting every field back under its
  /// own AI-original section - genuinely reversible since the parent's restore call is backed by
  /// each field's persisted OriginalSectionLabel, not just an in-memory undo lost on reload.
  restoreSections(doc: CardDocument) {
    this.sectionsRestored.emit({ docId: doc.id });
  }

  onDrop(event: CdkDragDrop<ExtractedFieldEdit[]>, doc: CardDocument, targetSection: CardSection) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
      const moved = event.container.data[event.currentIndex];
      moved.sectionLabel = targetSection.label;
    }

    // Renumber every field across every section of THIS document from the resulting visual
    // order, not just the moved one, so SortOrder never gaps or collides across repeated
    // reorders - scoped to one document at a time since a batch page can render several
    // documents' section groups side by side.
    let order = 0;
    const flat: ExtractedFieldEdit[] = [];
    for (const section of doc.sections) {
      for (const field of section.fields) {
        field.sortOrder = order++;
        flat.push(field);
      }
    }
    this.reordered.emit({ docId: doc.id, fields: flat });
  }
}
