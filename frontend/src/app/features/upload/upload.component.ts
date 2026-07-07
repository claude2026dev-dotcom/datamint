import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadProgressComponent, ProcessingStage } from '../../shared/components/upload-progress/upload-progress.component';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, UploadProgressComponent],
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
          @if (stage === 'done' && processedDocId) {
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
    .file-list { margin-top: 20px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
    .file-row { display: flex; justify-content: space-between; font-size: 0.9rem; padding: 8px 4px; border-bottom: 1px solid var(--dm-border); }
    .go { margin-top: 10px; align-self: flex-start; }
    .processing-card { margin-top: 30px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  `]
})
export class UploadComponent {
  selectedFiles: File[] = [];
  dragging = false;
  processing = false;
  stage: ProcessingStage = 'uploading';
  progress = 0;
  processedDocId: string | null = null;
  errorMessage?: string;

  constructor(
    private documentService: DocumentService,
    public auth: AuthService,
    private toast: ToastService,
    private router: Router
  ) {}

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

    this.processing = true;
    this.stage = 'uploading';
    this.progress = 15;

    // Simulated staged progress for a smooth perceived-performance animation
    // while the real request is in flight (see README for wiring this to
    // real SignalR/polling progress once a background job queue is added).
    setTimeout(() => { this.stage = 'reading'; this.progress = 40; }, 500);
    setTimeout(() => { this.stage = 'extracting'; this.progress = 75; }, 1300);

    this.documentService.upload(this.selectedFiles).subscribe({
      next: res => {
        this.progress = 100;
        this.stage = 'done';
        this.processedDocId = res.documents[0]?.id ?? null;
        if (!this.auth.isLoggedIn()) this.auth.incrementAnonUploadCount(this.selectedFiles.length);
      },
      error: err => {
        this.stage = 'failed';
        this.errorMessage = err?.error?.message;
      }
    });
  }

  goToReview() {
    if (this.processedDocId) this.router.navigateByUrl(`/documents/${this.processedDocId}/review`);
  }

  reset() {
    this.processing = false;
    this.selectedFiles = [];
    this.processedDocId = null;
  }
}
