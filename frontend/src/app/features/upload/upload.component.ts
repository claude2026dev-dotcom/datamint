import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { ToastService } from '../../core/services/toast.service';
import { FieldTemplateService } from '../../core/services/field-template.service';
import { FieldTemplate } from '../../core/models/models';
import { UploadProgressComponent, ProcessingStage } from '../../shared/components/upload-progress/upload-progress.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { formatFileSize } from '../../shared/utils/format-file-size';

interface SelectedFile {
  file: File;
  isPdf: boolean;
  expanded: boolean;
  peeking: boolean;
  pageCount: number | null;
  pageSpec: string;
}

interface BulkFileStatus {
  name: string;
  status: 'pending' | 'done' | 'failed';
  reason?: string;
}

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/bmp'];

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, UploadProgressComponent, IconComponent],
  template: `
    <div class="dm-container page">
      <h1>Upload your documents</h1>
      <p class="muted">PDFs (multi-page, scanned or digital) or photos/scans (JPG, PNG, WEBP, BMP). We'll extract every field automatically.</p>

      @if (!processing) {
        <div class="dropzone" [class.dragging]="dragging"
             (dragover)="onDragOver($event)" (dragleave)="dragging=false" (drop)="onDrop($event)"
             (click)="fileInput.click()">
          <input #fileInput type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/bmp" multiple hidden (change)="onFilesPicked($event)" />
          <div class="drop-icon"><app-icon name="upload-cloud" [size]="34" /></div>
          <p><strong>Click to browse</strong> or drag PDF/image files here</p>
        </div>

        <div class="dm-card mode-card">
          <h4>How should we extract fields?</h4>
          <label class="mode-option">
            <input type="radio" name="extractionMode" value="Dynamic" [(ngModel)]="extractionMode" />
            <div>
              <strong>Auto-detect fields</strong>
              <p class="muted small">AI finds and extracts every field it can — best when you're not sure exactly what's in the document.</p>
            </div>
          </label>
          <label class="mode-option">
            <input type="radio" name="extractionMode" value="Formatted" [(ngModel)]="extractionMode" />
            <div>
              <strong>Choose specific fields</strong>
              <p class="muted small">Tell us exactly which fields you want. Every file gets the same set of columns — ideal when you're uploading several similar documents together.</p>
            </div>
          </label>

          @if (extractionMode === 'Formatted') {
            <div class="fields-input">
              @if (savedTemplates.length > 0) {
                <label class="fields-label">Load from a saved template</label>
                <select class="dm-input" [(ngModel)]="selectedTemplateId" name="savedTemplate" (ngModelChange)="applyTemplate($event)">
                  <option [ngValue]="null">— Choose a saved template —</option>
                  @for (t of savedTemplates; track t.id) {
                    <option [ngValue]="t.id">{{ t.name }} ({{ t.fields.length }} fields)</option>
                  }
                </select>
              }

              <label class="fields-label">Fields to extract</label>
              @for (fieldName of fieldBoxes; track $index; let i = $index) {
                <div class="field-box-row">
                  <input class="dm-input" [(ngModel)]="fieldBoxes[i]" [name]="'field-' + i" placeholder="e.g. Invoice Number" />
                  @if (fieldBoxes.length > 1) {
                    <button type="button" class="remove-btn" (click)="removeFieldBox(i)" aria-label="Remove this field">✕</button>
                  }
                </div>
              }
              <button type="button" class="dm-btn dm-btn-ghost add-field-btn" (click)="addFieldBox()">+ Add another field</button>
              <a routerLink="/field-templates" class="manage-templates-link">Manage saved templates →</a>
            </div>
          }
        </div>

        @if (selectedFiles.length) {
          <div class="file-list dm-card">
            @for (f of selectedFiles; track f.file.name; let i = $index) {
              <div class="file-entry">
                <div class="file-row">
                  <span class="file-name"><app-icon name="file" [size]="15" /> {{ f.file.name }}</span>
                  <span class="muted">{{ formatFileSize(f.file.size) }}</span>
                  @if (f.isPdf) {
                    <button type="button" class="dm-btn dm-btn-ghost pages-toggle" (click)="togglePageSelector(i)">
                      {{ f.expanded ? 'Hide pages ▴' : 'Select pages ▾' }}
                    </button>
                  }
                </div>
                @if (f.expanded) {
                  <div class="page-selector">
                    @if (f.peeking) {
                      <p class="muted small">Checking page count…</p>
                    } @else if (f.pageCount !== null) {
                      <p class="muted small">{{ f.pageCount }} page(s) total. Leave blank to extract all pages.</p>
                      <input class="dm-input" [(ngModel)]="f.pageSpec" [name]="'pages-' + i" placeholder="e.g. 1-3,5" />
                    } @else {
                      <p class="muted small">Couldn't read this file's page count. Leave blank to extract all pages.</p>
                    }
                  </div>
                }
              </div>
            }
            <button class="dm-btn dm-btn-primary go" (click)="startUpload()">Extract data from {{ selectedFiles.length }} file(s)</button>
          </div>
        }
      } @else {
        <div class="dm-card processing-card">
          <app-upload-progress [stage]="stage" [progress]="progress" [errorMessage]="errorMessage"></app-upload-progress>

          @if (bulkFileStatuses.length > 1) {
            <div class="bulk-status-list">
              @for (f of bulkFileStatuses; track f.name) {
                <div class="bulk-status-row" [class.done]="f.status === 'done'" [class.failed]="f.status === 'failed'">
                  <span class="bulk-status-icon">
                    @if (f.status === 'pending') { <span class="spinner"></span> }
                    @if (f.status === 'done') { <app-icon name="check-circle" [size]="16" /> }
                    @if (f.status === 'failed') { <app-icon name="x-circle" [size]="16" /> }
                  </span>
                  <span class="bulk-status-name" [title]="f.name">{{ f.name }}</span>
                  @if (f.status === 'failed' && f.reason) { <span class="muted small">{{ f.reason }}</span> }
                </div>
              }
            </div>
          }

          @if (stage === 'done') {
            <button class="dm-btn dm-btn-primary" (click)="goToReview()">Review extracted data →</button>
          }
          @if (stage === 'failed') {
            <button class="dm-btn dm-btn-ghost" (click)="reset()">Try again</button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 50px; padding-bottom: 80px; }
    h1 { font-size: 1.8rem; margin-bottom: 8px; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.82rem; }
    .dropzone {
      margin-top: 28px; border: 2px dashed var(--dm-border); border-radius: var(--dm-radius-lg);
      padding: 60px 20px; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s;
    }
    .dropzone:hover, .dropzone.dragging { border-color: var(--dm-primary); background: rgba(99,102,241,0.06); }
    .drop-icon { display: flex; justify-content: center; color: var(--dm-primary-light); margin-bottom: 12px; }
    .mode-card { margin-top: 20px; padding: 20px; }
    .mode-card h4 { margin-bottom: 14px; font-size: 0.95rem; }
    .mode-option { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; cursor: pointer; }
    .mode-option input[type="radio"] { margin-top: 4px; accent-color: var(--dm-primary); flex-shrink: 0; }
    .mode-option strong { font-size: 0.92rem; }
    .fields-input { margin-top: 10px; padding-left: 28px; display: flex; flex-direction: column; gap: 8px; }
    .fields-label { display: block; font-size: 0.8rem; color: var(--dm-text-muted); margin-bottom: 2px; }
    .field-box-row { display: flex; gap: 8px; align-items: center; }
    .field-box-row .dm-input { flex: 1; }
    .remove-btn {
      flex-shrink: 0; width: 30px; height: 30px; border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border);
      background: transparent; color: var(--dm-text-muted); cursor: pointer; font-size: 0.85rem;
    }
    .remove-btn:hover { color: var(--dm-danger); border-color: var(--dm-danger); }
    .add-field-btn { align-self: flex-start; margin-top: 2px; padding: 6px 14px; font-size: 0.85rem; }
    .manage-templates-link { align-self: flex-start; margin-top: 8px; font-size: 0.82rem; color: var(--dm-primary); text-decoration: none; }
    .manage-templates-link:hover { text-decoration: underline; }
    .file-list { margin-top: 20px; padding: 18px; display: flex; flex-direction: column; gap: 6px; }
    .file-entry { border-bottom: 1px solid var(--dm-border); padding: 4px 0; }
    .file-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 0.9rem; padding: 6px 4px; }
    .file-name { display: inline-flex; align-items: center; gap: 8px; flex: 1; min-width: 0; overflow-wrap: break-word; }
    .file-name app-icon { color: var(--dm-text-muted); flex-shrink: 0; }
    .pages-toggle { flex-shrink: 0; padding: 4px 10px; font-size: 0.78rem; }
    .page-selector { padding: 4px 4px 12px 27px; display: flex; flex-direction: column; gap: 6px; }
    .go { margin-top: 10px; align-self: flex-start; }
    .processing-card { margin-top: 30px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }

    .bulk-status-list { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 4px; }
    .bulk-status-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: var(--dm-radius-sm); font-size: 0.85rem; color: var(--dm-text-muted); background: var(--dm-surface); min-width: 0; }
    .bulk-status-row.done { color: var(--dm-success); }
    .bulk-status-row.failed { color: var(--dm-danger); }
    .bulk-status-icon { display: flex; align-items: center; flex-shrink: 0; }
    .bulk-status-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dm-text); }
    .spinner { width: 14px; height: 14px; border: 2px solid var(--dm-border); border-top-color: var(--dm-primary); border-radius: 50%; animation: spin 0.7s linear infinite; display: block; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 700px) {
      .fields-input { padding-left: 0; }
      .file-row { flex-wrap: wrap; }
    }
  `]
})
export class UploadComponent implements OnInit {
  formatFileSize = formatFileSize;
  selectedFiles: SelectedFile[] = [];
  dragging = false;
  processing = false;
  stage: ProcessingStage = 'uploading';
  progress = 0;
  errorMessage?: string;
  extractionMode: 'Dynamic' | 'Formatted' = 'Dynamic';
  fieldBoxes: string[] = [''];
  bulkFileStatuses: BulkFileStatus[] = [];
  savedTemplates: FieldTemplate[] = [];
  selectedTemplateId: string | null = null;

  private processedDocIds: string[] = [];

  constructor(
    private documentService: DocumentService,
    private toast: ToastService,
    private router: Router,
    private fieldTemplateService: FieldTemplateService
  ) {}

  ngOnInit() {
    this.fieldTemplateService.getMine().subscribe({
      next: res => { this.savedTemplates = res.templates; },
      error: () => { /* saved templates are a convenience, not required to use the page */ }
    });
  }

  applyTemplate(templateId: string | null) {
    const template = this.savedTemplates.find(t => t.id === templateId);
    if (template) this.fieldBoxes = [...template.fields];
  }

  get requestedFieldNames(): string[] {
    return this.fieldBoxes.map(f => f.trim()).filter(Boolean);
  }

  addFieldBox() { this.fieldBoxes.push(''); }
  removeFieldBox(index: number) { this.fieldBoxes.splice(index, 1); }

  onDragOver(e: DragEvent) { e.preventDefault(); this.dragging = true; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging = false;
    if (e.dataTransfer?.files) this.addFiles(Array.from(e.dataTransfer.files));
  }

  onFilesPicked(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) this.addFiles(Array.from(input.files));
  }

  private addFiles(files: File[]) {
    const accepted = files.filter(f => ACCEPTED_TYPES.includes(f.type));
    if (accepted.length !== files.length) this.toast.error('Only PDF and image (JPG/PNG/WEBP/BMP) files are supported.');
    this.selectedFiles = [...this.selectedFiles, ...accepted.map(file => ({
      file, isPdf: file.type === 'application/pdf', expanded: false, peeking: false, pageCount: null as number | null, pageSpec: ''
    }))];
  }

  // Calls /peek on-demand (not eagerly for every file) so the common no-selection path never
  // pays for this extra round trip.
  togglePageSelector(index: number) {
    const entry = this.selectedFiles[index];
    entry.expanded = !entry.expanded;
    if (entry.expanded && entry.pageCount === null && !entry.peeking) {
      entry.peeking = true;
      this.documentService.peek([entry.file]).subscribe({
        next: res => { entry.pageCount = res.files[0]?.pageCount ?? null; entry.peeking = false; },
        error: () => { entry.peeking = false; }
      });
    }
  }

  startUpload() {
    // The plan's page limit is enforced server-side (against the user's subscription,
    // not anything the client can see) - a failed attempt here surfaces via the error
    // callback below, and the shared HTTP error interceptor redirects to /plans for a
    // PLAN_LIMIT_REACHED response, so there's nothing to pre-check client-side.
    if (this.extractionMode === 'Formatted' && this.requestedFieldNames.length === 0) {
      this.toast.error('Add at least one field to extract, or switch to Auto-detect.');
      return;
    }

    this.processing = true;
    this.stage = 'uploading';
    this.progress = 15;
    this.bulkFileStatuses = this.selectedFiles.map(f => ({ name: f.file.name, status: 'pending' }));

    // Simulated staged progress for a smooth perceived-performance animation
    // while the real request is in flight (see README for wiring this to
    // real SignalR/polling progress once a background job queue is added).
    // Cleared as soon as the real response arrives (below) - otherwise a fast
    // response (e.g. an immediate validation failure) can have these fire
    // afterward and clobber the real 'failed'/'done' stage back to 'extracting'.
    const stagingTimeouts = [
      setTimeout(() => { this.stage = 'reading'; this.progress = 40; }, 500),
      setTimeout(() => { this.stage = 'extracting'; this.progress = 75; }, 1300)
    ];
    const clearStaging = () => stagingTimeouts.forEach(clearTimeout);

    const pageSelections = this.selectedFiles
      .map((f, fileIndex) => ({ fileIndex, pages: f.pageSpec.trim() }))
      .filter(s => s.pages.length > 0);

    this.documentService.upload(
      this.selectedFiles.map(f => f.file), this.extractionMode, this.requestedFieldNames.join(','), pageSelections
    ).subscribe({
      next: res => {
        clearStaging();
        this.progress = 100;
        // The HTTP call succeeding only means the upload was accepted - each
        // document's own status reflects whether AI extraction actually worked,
        // so a 200 response can still carry failures that need surfacing here.
        const failed = res.documents.filter(d => d.status === 'Failed');
        const succeeded = res.documents.filter(d => d.status !== 'Failed');
        this.processedDocIds = succeeded.map(d => d.id);

        const finish = () => {
          if (succeeded.length === 0) {
            this.stage = 'failed';
            this.errorMessage = failed[0]?.failureReason || 'Extraction failed. Please try again.';
            return;
          }
          this.stage = 'done';
          if (failed.length > 0) {
            this.toast.error(`${failed.length} of ${res.documents.length} file(s) failed to extract: ${failed[0].failureReason || 'Unknown error'}`);
          }
        };

        if (this.selectedFiles.length > 1) {
          // Every result is already known (the backend processes the whole batch in one
          // request) - this only paces how they're *revealed*, one tick at a time, instead
          // of flipping every row to its final state simultaneously.
          res.documents.forEach((doc, i) => {
            setTimeout(() => {
              if (!this.bulkFileStatuses[i]) return;
              this.bulkFileStatuses[i] = doc.status === 'Failed'
                ? { name: this.bulkFileStatuses[i].name, status: 'failed', reason: doc.failureReason }
                : { name: this.bulkFileStatuses[i].name, status: 'done' };
            }, i * 350);
          });
          setTimeout(finish, res.documents.length * 350);
        } else {
          finish();
        }
      },
      error: err => {
        clearStaging();
        this.stage = 'failed';
        this.errorMessage = err?.error?.message;
      }
    });
  }

  goToReview() {
    if (this.processedDocIds.length === 0) return;
    if (this.processedDocIds.length === 1) {
      this.router.navigateByUrl(`/documents/${this.processedDocIds[0]}/review`);
    } else {
      this.router.navigate(['/documents/batch-review'], { queryParams: { ids: this.processedDocIds.join(',') } });
    }
  }

  reset() {
    this.processing = false;
    this.selectedFiles = [];
    this.processedDocIds = [];
    this.bulkFileStatuses = [];
  }
}
