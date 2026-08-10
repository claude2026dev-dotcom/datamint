import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { ExportFormat } from '../../../core/models/models';
import { IconComponent } from '../icon/icon.component';

export interface EmailModalResult {
  toAddress: string;
  cc?: string;
  format: ExportFormat;
}

/// Minimal "who should this go to" dialog for emailing an export - the layout (rows/columns,
/// single-sheet/separate-sheets) is never re-asked here, it's whatever's already selected on
/// the review page itself. The only genuinely new decision for an email (not already visible
/// on screen) is the attachment format and the recipient. A real backdrop overlay (matching
/// app-confirm-dialog's pattern), not an inline card sitting in the page flow - a page-flow card
/// reads as just another section of the page rather than a deliberate, focused action.
@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  animations: [
    trigger('fade', [
      transition(':enter', [style({ opacity: 0 }), animate('140ms ease-out', style({ opacity: 1 }))]),
      transition(':leave', [animate('120ms ease-in', style({ opacity: 0 }))])
    ]),
    trigger('pop', [
      transition(':enter', [
        style({ transform: 'scale(0.96) translateY(6px)', opacity: 0 }),
        animate('160ms cubic-bezier(.2,.8,.2,1)', style({ transform: 'scale(1) translateY(0)', opacity: 1 }))
      ])
    ])
  ],
  template: `
    <div class="backdrop" [@fade] (click)="cancelled.emit()">
      <div class="panel" [@pop] (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <div class="panel-head">
          <div class="panel-icon"><app-icon name="inbox" [size]="18" /></div>
          <div>
            <h3>Email this export</h3>
            <p class="muted">Sends whatever layout you're currently viewing on the review page.</p>
          </div>
        </div>

        <div class="field-block">
          <label>Attachment format</label>
          <div class="segmented">
            <button type="button" class="seg-option" [class.active]="format === 'Excel'" (click)="format = 'Excel'">
              <app-icon name="file-text" [size]="14" /> Excel (.xlsx)
            </button>
            <button type="button" class="seg-option" [class.active]="format === 'Json'" (click)="format = 'Json'">
              {{ '{ }' }} JSON
            </button>
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

        <div class="actions">
          <button class="dm-btn dm-btn-ghost" (click)="cancelled.emit()" [disabled]="busy">Cancel</button>
          <button class="dm-btn dm-btn-primary" (click)="confirm()" [disabled]="busy || !toAddress">
            <app-icon name="inbox" [size]="14" /> {{ busy ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .backdrop {
      position: fixed; inset: 0; background: rgba(4, 6, 14, 0.6); backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;
    }
    .panel {
      background: var(--dm-surface); border: 1px solid var(--dm-border); border-radius: var(--dm-radius-md);
      box-shadow: var(--dm-shadow); padding: 24px; width: 100%; max-width: 420px;
      max-height: 100%; overflow-y: auto;
    }
    .panel-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 20px; }
    .panel-icon { flex-shrink: 0; width: 36px; height: 36px; border-radius: 10px; background: var(--dm-gradient-primary); color: white; display: flex; align-items: center; justify-content: center; }
    .panel-head h3 { margin: 0 0 4px; font-size: 1.05rem; }
    .panel-head p { margin: 0; }
    .muted { color: var(--dm-text-muted); font-size: 0.82rem; }

    .field-block { margin-bottom: 16px; }
    .field-block > label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--dm-text-muted); margin-bottom: 8px; }

    .segmented { display: flex; gap: 8px; }
    .seg-option { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: 1; padding: 9px 12px; border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border); background: var(--dm-bg, var(--dm-surface)); cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--dm-text); }
    .seg-option.active { border-color: var(--dm-primary); background: rgba(99,102,241,0.1); color: var(--dm-primary); }

    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--dm-border); }
    .actions .dm-btn { display: inline-flex; align-items: center; gap: 6px; }
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
