import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FieldEditorDocument } from '../../../core/models/models';
import { IconComponent } from '../icon/icon.component';
import { ToastService } from '../../../core/services/toast.service';

/// A clean read-only JSON preview of exactly what a JSON export contains - field name, value,
/// and type only, grouped by section - not a dump of every internal tracking column (id,
/// sortOrder, wasEditedByUser, originalAiValue, etc.). Purely a preview: the real download still
/// goes through DocumentService.exportDocument/batchExport, this just lets someone see the shape
/// of the data before committing to a download or email.
@Component({
  selector: 'app-field-json-view',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    @for (doc of previews; track doc.fileName) {
      <div class="dm-card json-card">
        <div class="json-head">
          <div class="file-meta">
            <app-icon name="file-text" [size]="15" />
            <span class="file-name">{{ doc.fileName }}</span>
            <span class="muted small">{{ doc.fieldCount }} field(s){{ doc.pageCount ? ' · ' + doc.pageCount + ' page(s)' : '' }}</span>
          </div>
          <button type="button" class="dm-btn dm-btn-ghost copy-btn" (click)="copy(doc.json)">
            <app-icon name="copy" [size]="14" /> Copy
          </button>
        </div>
        <pre class="json-body">{{ doc.json }}</pre>
      </div>
    }
  `,
  styles: [`
    .json-card { padding: 0; margin-bottom: 16px; overflow: hidden; }
    .json-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; background: var(--dm-surface); border-bottom: 1px solid var(--dm-border); flex-wrap: wrap; }
    .file-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .file-meta app-icon { color: var(--dm-text-muted); flex-shrink: 0; }
    .file-name { font-weight: 700; font-size: 0.9rem; overflow-wrap: break-word; word-break: break-word; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.78rem; }
    .copy-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; padding: 6px 12px; flex-shrink: 0; }
    .json-body { margin: 0; padding: 18px 20px; max-height: 65vh; overflow: auto; font-family: var(--dm-font-mono, monospace); font-size: 0.92rem; line-height: 1.65; color: var(--dm-text); white-space: pre; }
  `]
})
export class FieldJsonViewComponent implements OnChanges {
  @Input() documents: FieldEditorDocument[] = [];
  @Input() pageCounts: Record<string, number> = {};

  previews: { fileName: string; fieldCount: number; pageCount: number | null; json: string }[] = [];

  constructor(private toast: ToastService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['documents'] || changes['pageCounts']) this.rebuild();
  }

  private rebuild() {
    this.previews = this.documents.map(doc => {
      const included = doc.fields.filter(f => f.includeInExport).sort((a, b) => a.sortOrder - b.sortOrder);
      const bySection = new Map<string, { field: string; value: string | null; type: string }[]>();
      const order: string[] = [];
      for (const f of included) {
        const label = f.sectionLabel || 'General';
        if (!bySection.has(label)) { bySection.set(label, []); order.push(label); }
        bySection.get(label)!.push({ field: f.fieldKey, value: f.fieldValue, type: f.semanticType });
      }
      const payload = {
        fileName: doc.fileName,
        sections: order.map(label => ({ section: label, fields: bySection.get(label)! }))
      };
      return {
        fileName: doc.fileName,
        fieldCount: included.length,
        pageCount: this.pageCounts[doc.id] ?? null,
        json: JSON.stringify(payload, null, 2)
      };
    });
  }

  copy(json: string) {
    navigator.clipboard.writeText(json).then(
      () => this.toast.success('Copied to clipboard.'),
      () => this.toast.error('Could not copy. Please try again.')
    );
  }
}
