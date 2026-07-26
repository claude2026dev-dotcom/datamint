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

    @for (doc of docModels; track doc.id) {
      <div class="doc-group">
        @if (docModels.length > 1) {
          <div class="doc-group-head">
            <app-icon name="file-text" [size]="16" />
            <span class="doc-name" [title]="doc.fileName">{{ doc.fileName }}</span>
            <span class="muted small">{{ includedCount(doc) }} of {{ totalCount(doc) }} included in export</span>
          </div>
        }

        <div class="doc-toolbar">
          <button type="button" class="link-btn" (click)="setDocIncluded(doc, true)">Select all</button>
          <span class="dot">·</span>
          <button type="button" class="link-btn" (click)="setDocIncluded(doc, false)">Unselect all</button>
        </div>

        @if (searchTerm && !docHasMatch(doc)) {
          <p class="muted small no-match">No fields match "{{ searchTerm }}" in this document.</p>
        }

        <div cdkDropListGroup>
          @for (section of doc.sections; track section.label) {
            @if (sectionMatches(section)) {
              <div class="dm-card section-card">
              <div class="section-head">
                <input class="section-title" #titleInput [ngModel]="section.label" (blur)="renameSection(doc, section, titleInput.value)"
                       title="Rename this section" />
                <div class="section-actions">
                  <span class="muted small">{{ editedCount(section) }} of {{ section.fields.length }} edited</span>
                  <button type="button" class="link-btn" (click)="setSectionIncluded(doc, section, true)">All</button>
                  <button type="button" class="link-btn" (click)="setSectionIncluded(doc, section, false)">None</button>
                </div>
              </div>

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
                      <textarea class="dm-input field-value" rows="1" appAutoGrow [(ngModel)]="field.fieldValue" (blur)="emitSave(doc, field)"></textarea>
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

    .doc-group { margin-bottom: 28px; }
    .doc-group-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .doc-group-head app-icon { color: var(--dm-text-muted); flex-shrink: 0; }
    .doc-name { font-weight: 700; overflow-wrap: break-word; word-break: break-word; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.78rem; }

    .doc-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .link-btn { background: none; border: none; padding: 2px 4px; font-size: 0.78rem; font-weight: 700; color: var(--dm-primary); cursor: pointer; white-space: nowrap; }
    .link-btn:hover { text-decoration: underline; }
    .dot { color: var(--dm-text-muted); }

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
    .original-hint { font-size: 0.72rem; color: var(--dm-accent); overflow-wrap: break-word; padding-left: 4px; }

    .field-type-col { flex: 0 0 140px; display: flex; flex-direction: column; gap: 6px; }
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
