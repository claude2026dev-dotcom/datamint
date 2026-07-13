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

/// Shared, AI-organized field editor used by both the single-document and batch review
/// pages: groups one document's fields into labeled sections (AI-suggested, falling back
/// to "General"), each rendered as a draggable, reorderable list. Drag handle/rename/value/
/// type-badge/edited-indicator/include-in-export toggle all live here so neither review page
/// has to duplicate this markup - they just supply the flat field array and handle the four
/// output events by calling DocumentService.
@Component({
  selector: 'app-field-section-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, IconComponent, AutoGrowDirective],
  template: `
    <div cdkDropListGroup>
      @for (section of sections; track section.label) {
        <div class="dm-card section-block">
          <div class="section-head">
            <input class="section-title" #titleInput [ngModel]="section.label" (blur)="renameSection(section, titleInput.value)"
                   title="Rename this section" />
            <span class="muted small">{{ editedCount(section) }} of {{ section.fields.length }} edited</span>
          </div>

          <div class="field-list" cdkDropList [cdkDropListData]="section.fields"
               (cdkDropListDropped)="onDrop($event, section)">
            @for (field of section.fields; track field.id) {
              <div class="field-row" cdkDrag [cdkDragData]="field">
                <div class="drag-handle" cdkDragHandle title="Drag to reorder or move to another section">
                  <app-icon name="grip" [size]="16" />
                </div>

                <div class="field-main">
                  <div class="field-meta">
                    <span class="original-label" [title]="'Detected label: ' + field.originalFieldKey">{{ field.originalFieldKey }}</span>
                    <span class="type-badge">{{ field.semanticType }}</span>
                    @if (field.pageNumber) { <span class="muted small">p.{{ field.pageNumber }}</span> }
                    @if (field.wasEditedByUser) { <span class="edited-badge">edited</span> }
                  </div>
                  <input class="dm-input field-key" [(ngModel)]="field.fieldKey" (blur)="emitSave(field)"
                         placeholder="Custom field name" title="Rename this field — used when exporting" />
                  <textarea class="dm-input field-value" rows="1" appAutoGrow [(ngModel)]="field.fieldValue" (blur)="emitSave(field)"></textarea>
                </div>

                <label class="include-toggle" title="Include this field in exports">
                  <input type="checkbox" [(ngModel)]="field.includeInExport" (change)="includeToggled.emit(field)" />
                  <span class="small">Export</span>
                </label>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .section-block { padding: 18px 20px; margin-bottom: 16px; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.78rem; }
    .section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--dm-border); }
    .section-title { font-size: 1rem; font-weight: 700; border: none; background: transparent; padding: 4px 6px; border-radius: var(--dm-radius-sm); flex: 1; min-width: 0; color: var(--dm-text); }
    .section-title:hover, .section-title:focus { background: var(--dm-surface-hover); }

    .field-list { display: flex; flex-direction: column; gap: 4px; min-height: 8px; }
    .field-list.cdk-drop-list-dragging .field-row:not(.cdk-drag-placeholder) { transition: transform 200ms ease; }

    .field-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 8px; border-radius: var(--dm-radius-sm); background: var(--dm-surface); }
    .field-row.cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
    .field-row.cdk-drag-placeholder { opacity: 0.3; }

    .drag-handle { display: flex; align-items: center; padding-top: 8px; color: var(--dm-text-muted); cursor: grab; flex-shrink: 0; touch-action: none; }
    .drag-handle:active { cursor: grabbing; }

    .field-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .field-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .original-label { font-size: 0.72rem; color: var(--dm-text-muted); text-transform: uppercase; letter-spacing: 0.03em; overflow-wrap: break-word; }
    .type-badge { font-size: 0.7rem; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: rgba(99,102,241,0.12); color: var(--dm-primary); }
    .edited-badge { font-size: 0.72rem; color: var(--dm-accent); }
    .field-key { font-size: 0.85rem; font-weight: 600; border: none; background: transparent; padding: 2px 4px; }
    .field-key:hover, .field-key:focus { border: 1px solid var(--dm-border); background: var(--dm-bg, var(--dm-surface)); }
    .field-value { resize: vertical; min-height: 42px; line-height: 1.4; font-family: inherit; overflow-wrap: break-word; }

    .include-toggle { display: flex; flex-direction: column; align-items: center; gap: 2px; padding-top: 6px; flex-shrink: 0; }
    .include-toggle input { accent-color: var(--dm-primary); }
    .include-toggle .small { color: var(--dm-text-muted); }

    @media (max-width: 700px) {
      .field-row { flex-wrap: wrap; }
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
    // the moved one, so SortOrder stays gap/collision-free across repeated reorders.
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
