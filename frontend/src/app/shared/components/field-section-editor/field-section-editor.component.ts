import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ExtractedFieldEdit } from '../../../core/models/models';
import { IconComponent } from '../icon/icon.component';
import { AutoGrowDirective } from '../../directives/auto-grow.directive';

interface FieldSection {
  label: string;
  fields: ExtractedFieldEdit[];
}

/// Shared, AI-organized field editor used by both the single-document and batch review pages,
/// styled as a proper spreadsheet grid (a fixed header row, bordered cells, a dedicated "Edited"
/// column) rather than a stack of cards - sections still group related fields (AI-suggested,
/// falling back to "General") and are still drag-reorderable, but every section renders the same
/// column layout so the whole thing reads like one continuous sheet.
@Component({
  selector: 'app-field-section-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, IconComponent, AutoGrowDirective],
  template: `
    <div class="sheet dm-card" cdkDropListGroup>
      <div class="sheet-header" role="row">
        <span class="col-drag" aria-hidden="true"></span>
        <span class="col-field">Field</span>
        <span class="col-value">Value</span>
        <span class="col-type">Type</span>
        <span class="col-edited">Edited</span>
        <span class="col-export">Export</span>
      </div>

      @for (section of sections; track section.label) {
        <div class="section-band">
          <input class="section-title" #titleInput [ngModel]="section.label" (blur)="renameSection(section, titleInput.value)"
                 title="Rename this section" />
          <span class="muted small">{{ editedCount(section) }} of {{ section.fields.length }} edited</span>
        </div>

        <div class="field-list" cdkDropList [cdkDropListData]="section.fields"
             (cdkDropListDropped)="onDrop($event, section)">
          @for (field of section.fields; track field.id) {
            <div class="field-row" cdkDrag [cdkDragData]="field">
              <div class="col-drag drag-handle" cdkDragHandle title="Drag to reorder or move to another section">
                <app-icon name="grip" [size]="15" />
              </div>

              <div class="col-field">
                <span class="original-label" [title]="'Detected label: ' + field.originalFieldKey">{{ field.originalFieldKey }}</span>
                <input class="dm-input field-key" [(ngModel)]="field.fieldKey" (blur)="emitSave(field)" placeholder="Field name" />
                @if (field.pageNumber) { <span class="page-chip">p.{{ field.pageNumber }}</span> }
              </div>

              <div class="col-value">
                <textarea class="dm-input field-value" rows="1" appAutoGrow [(ngModel)]="field.fieldValue" (blur)="emitSave(field)"></textarea>
              </div>

              <div class="col-type"><span class="type-badge">{{ field.semanticType }}</span></div>

              <div class="col-edited">
                @if (field.wasEditedByUser) { <span class="edited-dot" title="Edited"></span> }
              </div>

              <div class="col-export">
                <input type="checkbox" [(ngModel)]="field.includeInExport" (change)="includeToggled.emit(field)" title="Include this field in exports" />
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    /* overflow-y: visible is deliberate - see the matching comment in field-columns-editor for
       why setting only overflow-x here would otherwise silently break the sticky header below. */
    .sheet { padding: 0; overflow-x: auto; overflow-y: visible; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.76rem; }

    .sheet-header, .field-row { display: grid; grid-template-columns: 28px minmax(180px, 1.1fr) minmax(220px, 1.6fr) 90px 64px 64px; align-items: center; column-gap: 10px; min-width: 640px; }
    .sheet-header { position: sticky; top: 0; z-index: 2; padding: 10px 14px; background: var(--dm-bg-elevated); border-bottom: 1px solid var(--dm-border); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dm-text-muted); }
    .col-value, .col-type, .col-edited, .col-export { text-align: left; }

    .section-band { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: var(--dm-surface); border-bottom: 1px solid var(--dm-border); border-top: 1px solid var(--dm-border); min-width: 640px; }
    .section-title { font-size: 0.88rem; font-weight: 700; border: none; background: transparent; padding: 3px 6px; border-radius: var(--dm-radius-sm); flex: 1; min-width: 0; color: var(--dm-text); }
    .section-title:hover, .section-title:focus { background: var(--dm-surface-hover); }

    .field-list { display: flex; flex-direction: column; min-height: 8px; }
    .field-list.cdk-drop-list-dragging .field-row:not(.cdk-drag-placeholder) { transition: transform 200ms ease; }

    .field-row { padding: 8px 14px; border-bottom: 1px solid var(--dm-border); background: var(--dm-bg, var(--dm-surface)); }
    .field-row:hover { background: var(--dm-surface-hover); }
    .field-row.cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,0.2); border-radius: var(--dm-radius-sm); }
    .field-row.cdk-drag-placeholder { opacity: 0.3; }

    .drag-handle { display: flex; align-items: center; justify-content: center; color: var(--dm-text-muted); cursor: grab; touch-action: none; }
    .drag-handle:active { cursor: grabbing; }

    .col-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .original-label { font-size: 0.68rem; color: var(--dm-text-muted); text-transform: uppercase; letter-spacing: 0.02em; overflow-wrap: break-word; }
    .field-key { font-size: 0.85rem; font-weight: 600; border: none; background: transparent; padding: 2px 4px; }
    .field-key:hover, .field-key:focus { border: 1px solid var(--dm-border); background: var(--dm-bg, var(--dm-surface)); }
    .page-chip { align-self: flex-start; font-size: 0.68rem; color: var(--dm-text-muted); }

    .col-value { min-width: 0; }
    .field-value { resize: vertical; min-height: 36px; line-height: 1.4; font-family: inherit; overflow-wrap: break-word; width: 100%; }

    .type-badge { font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: rgba(99,102,241,0.12); color: var(--dm-primary); white-space: nowrap; }

    .col-edited { display: flex; justify-content: center; }
    .edited-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dm-accent); display: block; }

    .col-export { display: flex; justify-content: center; }
    .col-export input { accent-color: var(--dm-primary); }

    @media (max-width: 900px) {
      .sheet-header { display: none; }
      .field-row { grid-template-columns: 24px 1fr; grid-template-areas: "drag field" ". value" ". meta"; row-gap: 6px; min-width: 0; }
      .col-drag { grid-area: drag; }
      .col-field { grid-area: field; }
      .col-value { grid-area: value; grid-column: 1 / -1; }
      .col-type, .col-edited, .col-export { grid-area: meta; display: inline-flex; margin-right: 10px; }
      .section-band { min-width: 0; }
    }
  `]
})
export class FieldSectionEditorComponent implements OnChanges {
  @Input() fields: ExtractedFieldEdit[] = [];

  @Output() fieldSaved = new EventEmitter<ExtractedFieldEdit>();
  @Output() includeToggled = new EventEmitter<ExtractedFieldEdit>();
  @Output() reordered = new EventEmitter<ExtractedFieldEdit[]>();
  @Output() sectionRenamed = new EventEmitter<{ oldLabel: string; newLabel: string }>();

  sections: FieldSection[] = [];
  private lastSaved: Record<string, { key: string; value: string | null }> = {};

  ngOnChanges(changes: SimpleChanges) {
    if (changes['fields']) {
      this.rebuildSections();
      for (const f of this.fields) this.lastSaved[f.id] = { key: f.fieldKey, value: f.fieldValue };
    }
  }

  private rebuildSections() {
    const order: string[] = [];
    const byLabel = new Map<string, ExtractedFieldEdit[]>();
    for (const field of [...this.fields].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const label = field.sectionLabel || 'General';
      if (!byLabel.has(label)) { byLabel.set(label, []); order.push(label); }
      byLabel.get(label)!.push(field);
    }
    this.sections = order.map(label => ({ label, fields: byLabel.get(label)! }));
  }

  editedCount(section: FieldSection): number {
    return section.fields.filter(f => f.wasEditedByUser).length;
  }

  emitSave(field: ExtractedFieldEdit) {
    const previous = this.lastSaved[field.id];
    if (previous && previous.key === field.fieldKey && previous.value === field.fieldValue) return;
    this.lastSaved[field.id] = { key: field.fieldKey, value: field.fieldValue };
    this.fieldSaved.emit(field);
  }

  renameSection(section: FieldSection, newLabel: string) {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === section.label) return;
    const oldLabel = section.label;
    section.label = trimmed;
    for (const field of section.fields) field.sectionLabel = trimmed;
    this.sectionRenamed.emit({ oldLabel, newLabel: trimmed });
  }

  onDrop(event: CdkDragDrop<ExtractedFieldEdit[]>, targetSection: FieldSection) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
      const moved = event.container.data[event.currentIndex];
      moved.sectionLabel = targetSection.label;
    }

    // Renumber every field across every section from the resulting visual order, not just
    // the moved one, so SortOrder never gaps or collides across repeated reorders.
    let order = 0;
    const flat: ExtractedFieldEdit[] = [];
    for (const section of this.sections) {
      for (const field of section.fields) {
        field.sortOrder = order++;
        flat.push(field);
      }
    }
    this.reordered.emit(flat);
  }
}
