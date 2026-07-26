import { AfterViewChecked, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
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
  // Which pages (1-indexed) are DEselected - empty means "every page", the common case, so a
  // file that's never had its page selector opened needs no special-casing anywhere else.
  deselectedPages: Set<number>;
  justAdded: boolean;
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
  imports: [CommonModule, FormsModule, UploadProgressComponent, IconComponent],
  animations: [
    trigger('fileEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)', maxHeight: '0px' }),
        animate('260ms cubic-bezier(.2,.8,.2,1)', style({ opacity: 1, transform: 'translateY(0)', maxHeight: '200px' }))
      ])
    ])
  ],
  template: `
    <div class="dm-container page">
      <div class="page-head">
        <div class="head-icon"><app-icon name="sparkles" [size]="22" /></div>
        <div>
          <h1>Upload your documents</h1>
          <p class="muted">PDFs (multi-page) or photos/scans (JPG, PNG, WEBP, BMP) — we'll extract every field automatically.</p>
        </div>
      </div>

      @if (!processing) {
        <div class="dm-card mode-card">
          <h4>How should we extract fields?</h4>
          <div class="mode-options">
            <label class="mode-option" [class.active]="extractionMode === 'Dynamic'">
              <input type="radio" name="extractionMode" value="Dynamic" [(ngModel)]="extractionMode" />
              <div class="mode-icon"><app-icon name="cpu" [size]="18" /></div>
              <div>
                <strong>Auto-detect fields</strong>
                <p class="muted small">AI finds and extracts every field it can — best when you're not sure exactly what's in the document.</p>
              </div>
            </label>
            <label class="mode-option" [class.active]="extractionMode === 'Formatted'">
              <input type="radio" name="extractionMode" value="Formatted" [(ngModel)]="extractionMode" />
              <div class="mode-icon"><app-icon name="grid" [size]="18" /></div>
              <div>
                <strong>Choose specific fields</strong>
                <p class="muted small">Tell us exactly which fields you want. Every file gets the same set of columns — ideal for uploading similar documents together.</p>
              </div>
            </label>
          </div>

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

              <div class="fields-actions">
                <button type="button" class="dm-btn dm-btn-ghost add-field-btn" (click)="addFieldBox()">+ Add another field</button>
                @if (!savingTemplateOpen) {
                  <button type="button" class="dm-btn dm-btn-ghost save-template-btn" (click)="openSaveTemplate()" [disabled]="requestedFieldNames.length === 0">
                    <app-icon name="file-text" [size]="14" /> Save as template
                  </button>
                }
              </div>

              @if (savingTemplateOpen) {
                <div class="save-template-row">
                  <input class="dm-input" [(ngModel)]="newTemplateName" name="newTemplateName" placeholder="Template name, e.g. Standard Invoice" />
                  <button type="button" class="dm-btn dm-btn-primary tiny" [disabled]="savingTemplate || !newTemplateName.trim()" (click)="saveTemplate()">
                    {{ savingTemplate ? 'Saving…' : 'Save' }}
                  </button>
                  <button type="button" class="dm-btn dm-btn-ghost tiny" (click)="savingTemplateOpen = false">Cancel</button>
                </div>
              }
            </div>
          }
        </div>

        <div class="dropzone" [class.dragging]="dragging"
             (dragover)="onDragOver($event)" (dragleave)="dragging=false" (drop)="onDrop($event)"
             (click)="fileInput.click()">
          <input #fileInput type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/bmp" multiple hidden (change)="onFilesPicked($event)" />
          <div class="drop-icon"><app-icon name="upload-cloud" [size]="36" /></div>
          <p><strong>Click to browse</strong> or drag PDF/image files here</p>
          <p class="muted small">PDF, JPG, PNG, WEBP, BMP — single or bulk</p>
        </div>

        @if (selectedFiles.length) {
          <div class="file-list dm-card" #fileListEl>
            <div class="file-list-head">
              <app-icon name="check-circle" [size]="14" />
              <span>{{ selectedFiles.length }} file{{ selectedFiles.length === 1 ? '' : 's' }} ready to upload</span>
            </div>
            @for (f of selectedFiles; track f.file.name + $index; let i = $index) {
              <div class="file-entry" [class.just-added]="f.justAdded" [@fileEnter]>
                <div class="file-row">
                  <span class="file-name"><app-icon name="file" [size]="15" /> {{ f.file.name }}</span>
                  <span class="muted size-chip">{{ formatFileSize(f.file.size) }}</span>
                  @if (f.isPdf) {
                    <button type="button" class="dm-btn dm-btn-ghost pages-toggle" (click)="togglePageSelector(i)">
                      <app-icon name="grid" [size]="13" /> {{ f.expanded ? 'Hide pages' : 'Select pages' }}
                    </button>
                  }
                  <button type="button" class="remove-file-btn" (click)="removeFile(i)" aria-label="Remove this file">
                    <app-icon name="close" [size]="14" />
                  </button>
                </div>
                @if (f.expanded) {
                  <div class="page-selector">
                    @if (f.peeking) {
                      <p class="muted small">Checking page count…</p>
                    } @else if (f.pageCount !== null) {
                      <div class="page-selector-head">
                        <p class="muted small">Click a page to exclude it — {{ selectedPageCount(f) }} of {{ f.pageCount }} selected.</p>
                        <div class="page-selector-actions">
                          <button type="button" class="link-btn" (click)="selectAllPages(f)">Select all</button>
                          <button type="button" class="link-btn" (click)="selectNoPages(f)">Select none</button>
                        </div>
                      </div>
                      <div class="page-chips">
                        @for (p of pageNumbers(f.pageCount); track p) {
                          <button type="button" class="page-chip" [class.selected]="!f.deselectedPages.has(p)" (click)="togglePage(f, p)">
                            {{ p }}
                          </button>
                        }
                      </div>
                    } @else {
                      <p class="muted small">Couldn't read this file's page count. All pages will be extracted.</p>
                    }
                  </div>
                }
              </div>
            }
            <button class="dm-btn dm-btn-primary go" (click)="startUpload()">
              <app-icon name="sparkles" [size]="16" /> Extract data from {{ selectedFiles.length }} file(s)
            </button>
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
                </div>
              }
            </div>
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
    .page-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 8px; }
    .head-icon { width: 42px; height: 42px; border-radius: 12px; background: var(--dm-gradient-primary); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    h1 { font-size: 1.8rem; margin-bottom: 4px; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.82rem; }
    .dropzone {
      margin-top: 20px; border: 2.5px dashed var(--dm-primary-light); border-radius: var(--dm-radius-lg);
      padding: 56px 20px; text-align: center; cursor: pointer; background: rgba(99,102,241,0.03);
      transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.15s;
    }
    .dropzone:hover, .dropzone.dragging {
      border-color: var(--dm-primary); background: rgba(99,102,241,0.08);
      box-shadow: 0 0 0 4px rgba(99,102,241,0.12); transform: translateY(-1px);
    }
    .drop-icon { display: flex; justify-content: center; color: var(--dm-primary-light); margin-bottom: 12px; }
    .mode-card { margin-top: 24px; padding: 20px; }
    .mode-card h4 { margin-bottom: 14px; font-size: 0.95rem; }
    .mode-options { display: flex; flex-direction: column; gap: 4px; }
    .mode-option { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: var(--dm-radius-sm); cursor: pointer; border: 1px solid transparent; transition: background 0.15s ease, border-color 0.15s ease; }
    .mode-option:hover { background: var(--dm-surface-hover); }
    .mode-option.active { border-color: var(--dm-primary); background: rgba(99,102,241,0.08); }
    .mode-option input[type="radio"] { margin-top: 4px; accent-color: var(--dm-primary); flex-shrink: 0; }
    .mode-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); color: var(--dm-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .mode-option strong { font-size: 0.92rem; }
    .fields-input { margin-top: 14px; padding: 14px; border-radius: var(--dm-radius-sm); background: var(--dm-bg-elevated); display: flex; flex-direction: column; gap: 8px; }
    .fields-label { display: block; font-size: 0.8rem; color: var(--dm-text-muted); margin-bottom: 2px; }
    .field-box-row { display: flex; gap: 8px; align-items: center; }
    .field-box-row .dm-input { flex: 1; }
    .remove-btn {
      flex-shrink: 0; width: 30px; height: 30px; border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border);
      background: transparent; color: var(--dm-text-muted); cursor: pointer; font-size: 0.85rem;
    }
    .remove-btn:hover { color: var(--dm-danger); border-color: var(--dm-danger); }
    .fields-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
    .add-field-btn, .save-template-btn { padding: 6px 14px; font-size: 0.85rem; }
    .save-template-btn { display: inline-flex; align-items: center; gap: 6px; }
    .save-template-row { display: flex; gap: 8px; align-items: center; margin-top: 4px; flex-wrap: wrap; }
    .save-template-row .dm-input { flex: 1; min-width: 160px; }
    .tiny { padding: 6px 12px; font-size: 0.82rem; }

    .file-list { margin-top: 20px; padding: 18px; display: flex; flex-direction: column; gap: 6px; }
    .file-list-head { display: flex; align-items: center; gap: 8px; color: var(--dm-success); font-size: 0.82rem; font-weight: 600; padding-bottom: 10px; margin-bottom: 4px; border-bottom: 1px solid var(--dm-border); }
    .file-entry { border-bottom: 1px solid var(--dm-border); padding: 4px 0; border-radius: var(--dm-radius-sm); overflow: hidden; }
    .file-entry.just-added { animation: added-glow 1.4s ease-out; }
    @keyframes added-glow { 0% { background: rgba(52,211,153,0.16); } 100% { background: transparent; } }
    .file-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 0.9rem; padding: 6px 4px; flex-wrap: wrap; }
    .file-name { display: inline-flex; align-items: center; gap: 8px; flex: 1; min-width: 0; overflow-wrap: break-word; }
    .file-name app-icon { color: var(--dm-text-muted); flex-shrink: 0; }
    .size-chip { flex-shrink: 0; font-size: 0.78rem; }
    .pages-toggle { flex-shrink: 0; padding: 4px 10px; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 5px; }
    .remove-file-btn { flex-shrink: 0; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: none; background: transparent; color: var(--dm-text-muted); cursor: pointer; }
    .remove-file-btn:hover { color: var(--dm-danger); background: rgba(248,113,113,0.1); }
    .page-selector { padding: 6px 4px 14px 27px; display: flex; flex-direction: column; gap: 8px; }
    .page-selector-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .page-selector-actions { display: flex; gap: 10px; flex-shrink: 0; }
    .link-btn { background: none; border: none; padding: 0; color: var(--dm-primary); font-size: 0.78rem; cursor: pointer; }
    .page-chips { display: flex; flex-wrap: wrap; gap: 6px; max-width: 480px; }
    .page-chip {
      width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--dm-border); background: var(--dm-surface);
      color: var(--dm-text-muted); font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.12s ease;
    }
    .page-chip:hover { border-color: var(--dm-primary); }
    .page-chip.selected { background: var(--dm-gradient-primary); border-color: transparent; color: white; }
    .go { margin-top: 10px; align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; }
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
      .file-row { flex-wrap: wrap; }
    }
  `]
})
export class UploadComponent implements OnInit, AfterViewChecked {
  @ViewChild('fileListEl') fileListEl?: ElementRef<HTMLDivElement>;
  private pendingScroll = false;

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

  savingTemplateOpen = false;
  savingTemplate = false;
  newTemplateName = '';

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

  ngAfterViewChecked() {
    // Scrolling the freshly-updated file list into view is the clearest possible signal that
    // "yes, your file was added" - deferred to after the view actually renders the new row(s)
    // so scrollIntoView measures real, current layout instead of racing the update.
    if (this.pendingScroll && this.fileListEl) {
      this.pendingScroll = false;
      this.fileListEl.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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

  openSaveTemplate() {
    this.newTemplateName = '';
    this.savingTemplateOpen = true;
  }

  saveTemplate() {
    const name = this.newTemplateName.trim();
    if (!name || this.requestedFieldNames.length === 0) return;

    this.savingTemplate = true;
    this.fieldTemplateService.create(name, this.requestedFieldNames).subscribe({
      next: res => {
        this.savingTemplate = false;
        this.savingTemplateOpen = false;
        this.savedTemplates = [...this.savedTemplates, res.template];
        this.selectedTemplateId = res.template.id;
        this.toast.success('Template saved.');
      },
      error: err => {
        this.savingTemplate = false;
        this.toast.error(err?.error?.message || 'Could not save that template. Please try again.');
      }
    });
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.dragging = true; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging = false;
    if (e.dataTransfer?.files) this.addFiles(Array.from(e.dataTransfer.files));
  }

  onFilesPicked(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) this.addFiles(Array.from(input.files));
    input.value = '';
  }

  private addFiles(files: File[]) {
    const accepted = files.filter(f => ACCEPTED_TYPES.includes(f.type));
    if (accepted.length !== files.length) this.toast.error('Only PDF and image (JPG/PNG/WEBP/BMP) files are supported.');
    if (accepted.length === 0) return;

    const added: SelectedFile[] = accepted.map(file => ({
      file, isPdf: file.type === 'application/pdf', expanded: false, peeking: false,
      pageCount: null, deselectedPages: new Set<number>(), justAdded: true
    }));
    this.selectedFiles = [...this.selectedFiles, ...added];
    this.toast.success(accepted.length === 1 ? `"${accepted[0].name}" added.` : `${accepted.length} files added.`);
    this.pendingScroll = true;

    // The "just added" highlight is a one-time entrance cue, not a permanent state - clears
    // itself shortly after so it never looks stuck on for files added a while ago.
    setTimeout(() => { for (const f of added) f.justAdded = false; }, 1500);
  }

  removeFile(index: number) {
    this.selectedFiles.splice(index, 1);
  }

  pageNumbers(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  selectedPageCount(f: SelectedFile): number {
    return (f.pageCount ?? 0) - f.deselectedPages.size;
  }

  togglePage(f: SelectedFile, page: number) {
    if (f.deselectedPages.has(page)) f.deselectedPages.delete(page);
    else f.deselectedPages.add(page);
  }

  selectAllPages(f: SelectedFile) { f.deselectedPages.clear(); }
  selectNoPages(f: SelectedFile) {
    if (f.pageCount) f.deselectedPages = new Set(this.pageNumbers(f.pageCount));
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

  /// Builds the "1-3,5" style spec the backend expects from whichever pages are still
  /// selected - an empty deselection set (the default, untouched state) needs no spec at all,
  /// since "no spec" already means "every page" server-side.
  private pageSpecFor(f: SelectedFile): string {
    if (f.deselectedPages.size === 0 || f.pageCount === null) return '';
    const selected = this.pageNumbers(f.pageCount).filter(p => !f.deselectedPages.has(p));
    return selected.join(',');
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

    // Simulated staged progress for a smooth perceived-performance animation while the real
    // request is in flight (the backend processes inline on the request thread today - see
    // CLAUDE.md's "Processing is synchronous" note - so there's no real progress feed yet).
    // Cleared as soon as the real response arrives below - otherwise a fast response (e.g. an
    // immediate validation failure) can have these fire afterward and clobber the real
    // 'failed'/'done' stage back to 'extracting'.
    const stagingTimeouts = [
      setTimeout(() => { this.stage = 'reading'; this.progress = 40; }, 500),
      setTimeout(() => { this.stage = 'extracting'; this.progress = 75; }, 1300)
    ];
    const clearStaging = () => stagingTimeouts.forEach(clearTimeout);

    const pageSelections = this.selectedFiles
      .map((f, fileIndex) => ({ fileIndex, pages: this.pageSpecFor(f) }))
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
            this.errorMessage = failed[0]?.failureReason || undefined;
            return;
          }
          this.stage = 'done';
          if (failed.length > 0) {
            this.toast.error(`${failed.length} of ${res.documents.length} file(s) couldn't be processed. The rest are ready to review.`);
          }
          // Straight into the review flow - no extra click needed. A short pause lets the
          // "done" animation actually register before the page changes underneath it.
          setTimeout(() => this.goToReview(), 700);
        };

        if (this.selectedFiles.length > 1) {
          // Every result is already known (the backend processes the whole batch in one
          // request) - this only paces how they're *revealed*, one tick at a time, instead
          // of flipping every row to its final state simultaneously.
          res.documents.forEach((doc, i) => {
            setTimeout(() => {
              if (!this.bulkFileStatuses[i]) return;
              this.bulkFileStatuses[i] = doc.status === 'Failed'
                ? { name: this.bulkFileStatuses[i].name, status: 'failed' }
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
