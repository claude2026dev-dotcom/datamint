import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExportFormat } from '../../../core/models/models';

export interface EmailModalResult {
  toAddress: string;
  cc?: string;
  format: ExportFormat;
}

/// Minimal "who should this go to" dialog for emailing an export - the layout (rows/columns,
/// single-sheet/separate-sheets) is never re-asked here, it's whatever's already selected on
/// the review page itself. The only genuinely new decision for an email (not already visible
/// on screen) is the attachment format and the recipient.
@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dm-card email-modal">
      <h3>Email this export</h3>

      <div class="field-block">
        <label>Format</label>
        <div class="segmented">
          <button type="button" class="seg-option" [class.active]="format === 'Excel'" (click)="format = 'Excel'">Excel (.xlsx)</button>
          <button type="button" class="seg-option" [class.active]="format === 'Json'" (click)="format = 'Json'">JSON</button>
        </div>
      </div>

      <div class="field-block">
        <label>Send to</label>
        <input class="dm-input" type="email" [(ngModel)]="toAddress" placeholder="recipient@company.com" />
      </div>
      <div class="field-block">
        <label>CC <span class="muted">(optional)</span></label>
        <input class="dm-input" type="text" [(ngModel)]="cc" placeholder="cc1@company.com, cc2@company.com" />
      </div>

      <div class="chooser-actions">
        <button class="dm-btn dm-btn-ghost" (click)="cancelled.emit()" [disabled]="busy">Cancel</button>
        <button class="dm-btn dm-btn-primary" (click)="confirm()" [disabled]="busy || !toAddress">
          {{ busy ? 'Sending…' : 'Send' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .email-modal { padding: 20px; margin-bottom: 22px; animation: dm-fade-in 0.18s ease-out; max-width: 420px; }
    @keyframes dm-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .email-modal h3 { font-size: 0.98rem; margin-bottom: 16px; }
    .muted { color: var(--dm-text-muted); }
    .field-block { margin-bottom: 16px; }
    .field-block > label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--dm-text-muted); margin-bottom: 8px; }

    .segmented { display: flex; gap: 8px; }
    .seg-option { flex: 1; padding: 9px 12px; border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border); background: var(--dm-surface); cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--dm-text); }
    .seg-option.active { border-color: var(--dm-primary); background: rgba(99,102,241,0.1); color: var(--dm-primary); }

    .chooser-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--dm-border); }
  `]
})
export class ExportModalComponent {
  @Input() busy = false;

  @Output() confirmed = new EventEmitter<EmailModalResult>();
  @Output() cancelled = new EventEmitter<void>();

  format: ExportFormat = 'Excel';
  toAddress = '';
  cc = '';

  confirm() {
    if (!this.toAddress) return;
    this.confirmed.emit({ toAddress: this.toAddress, cc: this.cc.trim() || undefined, format: this.format });
  }
}
