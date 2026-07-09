import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadProgressComponent, ProcessingStage } from '../../shared/components/upload-progress/upload-progress.component';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, UploadProgressComponent],
  template: `
    <div class="dm-container page">
      <h1>Upload your PDFs</h1>
      <p class="muted">Supports multi-page PDFs, scanned or digital. We'll extract every field automatically.</p>

      @if (!processing) {
        <div class="dropzone" [class.dragging]="dragging"
             (dragover)="onDragOver($event)" (dragleave)="dragging=false" (drop)="onDrop($event)"
             (click)="fileInput.click()">
          <input #fileInput type="file" accept="application/pdf" multiple hidden (change)="onFilesPicked($event)" />
          <div class="drop-icon">⬆️</div>
          <p><strong>Click to browse</strong> or drag PDF files here</p>
          <p class="muted small">
            @if (!auth.isLoggedIn()) { {{ 2 - auth.getAnonUploadCount() }} free upload(s) remaining before sign-in is required }
          </p>
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
            </div>
          }
        </div>

        @if (selectedFiles.length) {
          <div class="file-list dm-card">
            @for (f of selectedFiles; track f.name) {
              <div class="file-row">
                <span>📄 {{ f.name }}</span>
                <span class="muted">{{ (f.size / 1024 / 1024).toFixed(2) }} MB</span>
              </div>
            }
            <button class="dm-btn dm-btn-primary go" (click)="startUpload()">Extract data from {{ selectedFiles.length }} file(s)</button>
          </div>
        }
      } @else {
        <div class="dm-card processing-card">
          <app-upload-progress [stage]="stage" [progress]="progress" [errorMessage]="errorMessage"></app-upload-progress>
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
    .page { padding: 50px 0 80px; }
    h1 { font-size: 1.8rem; margin-bottom: 8px; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.82rem; }
    .dropzone {
      margin-top: 28px; border: 2px dashed var(--dm-border); border-radius: var(--dm-radius-lg);
      padding: 60px 20px; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s;
    }
    .dropzone:hover, .dropzone.dragging { border-color: var(--dm-primary); background: rgba(99,102,241,0.06); }
    .drop-icon { font-size: 2.2rem; margin-bottom: 10px; }
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
    .file-list { margin-top: 20px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
    .file-row { display: flex; justify-content: space-between; font-size: 0.9rem; padding: 8px 4px; border-bottom: 1px solid var(--dm-border); }
    .go { margin-top: 10px; align-self: flex-start; }
    .processing-card { margin-top: 30px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    @media (max-width: 700px) {
      .fields-input { padding-left: 0; }
    }
  `]
})
export class UploadComponent {
  selectedFiles: File[] = [];
  dragging = false;
  processing = false;
  stage: ProcessingStage = 'uploading';
  progress = 0;
  errorMessage?: string;
  extractionMode: 'Dynamic' | 'Formatted' = 'Dynamic';
  fieldBoxes: string[] = [''];

  private processedDocIds: string[] = [];

  constructor(
    private documentService: DocumentService,
    public auth: AuthService,
    private toast: ToastService,
    private router: Router
  ) {}

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
    const pdfs = files.filter(f => f.type === 'application/pdf');
    if (pdfs.length !== files.length) this.toast.error('Only PDF files are supported.');
    this.selectedFiles = [...this.selectedFiles, ...pdfs];
  }

  startUpload() {
    if (this.auth.hasReachedFreeLimit()) {
      this.toast.info("You've used your 2 free extractions. Please sign in and choose a plan to continue.");
      this.router.navigateByUrl('/plans');
      return;
    }

    if (this.extractionMode === 'Formatted' && this.requestedFieldNames.length === 0) {
      this.toast.error('Add at least one field to extract, or switch to Auto-detect.');
      return;
    }

    this.processing = true;
    this.stage = 'uploading';
    this.progress = 15;

    // Simulated staged progress for a smooth perceived-performance animation
    // while the real request is in flight (see README for wiring this to
    // real SignalR/polling progress once a background job queue is added).
    setTimeout(() => { this.stage = 'reading'; this.progress = 40; }, 500);
    setTimeout(() => { this.stage = 'extracting'; this.progress = 75; }, 1300);

    this.documentService.upload(this.selectedFiles, this.extractionMode, this.requestedFieldNames.join(',')).subscribe({
      next: res => {
        this.progress = 100;
        // The HTTP call succeeding only means the upload was accepted - each
        // document's own status reflects whether AI extraction actually worked,
        // so a 200 response can still carry failures that need surfacing here.
        const failed = res.documents.filter(d => d.status === 'Failed');
        const succeeded = res.documents.filter(d => d.status !== 'Failed');
        this.processedDocIds = succeeded.map(d => d.id);

        if (succeeded.length === 0) {
          this.stage = 'failed';
          this.errorMessage = failed[0]?.failureReason || 'Extraction failed. Please try again.';
          return;
        }

        this.stage = 'done';
        if (failed.length > 0) {
          this.toast.error(`${failed.length} of ${res.documents.length} file(s) failed to extract: ${failed[0].failureReason || 'Unknown error'}`);
        }
        if (!this.auth.isLoggedIn()) this.auth.incrementAnonUploadCount(this.selectedFiles.length);
      },
      error: err => {
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
  }
}
