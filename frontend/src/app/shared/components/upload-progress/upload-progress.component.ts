import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate, state } from '@angular/animations';

export type ProcessingStage = 'uploading' | 'reading' | 'ocr' | 'extracting' | 'done' | 'failed';

/// The signature "AI is working on your PDF" animation: a pulsing document
/// icon with a progress ring plus a step list, so the wait never feels dead.
@Component({
  selector: 'app-upload-progress',
  standalone: true,
  imports: [CommonModule],
  animations: [
    trigger('pulse', [
      state('active', style({ transform: 'scale(1.06)' })),
      transition('* <=> active', animate('900ms ease-in-out'))
    ])
  ],
  template: `
    <div class="wrap">
      <div class="ring" [class.spin]="stage !== 'done' && stage !== 'failed'">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--dm-border)" stroke-width="6"/>
          <circle cx="50" cy="50" r="42" fill="none" stroke="url(#dm-grad)" stroke-width="6"
                  stroke-linecap="round" [attr.stroke-dasharray]="264"
                  [attr.stroke-dashoffset]="264 - (264 * progress / 100)"/>
          <defs>
            <linearGradient id="dm-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="var(--dm-primary)"/>
              <stop offset="100%" stop-color="var(--dm-accent)"/>
            </linearGradient>
          </defs>
        </svg>
        <span class="doc" [@pulse]="stage !== 'done' && stage !== 'failed' ? 'active' : 'idle'">📄</span>
      </div>

      <div class="steps">
        <div class="step" [class.done]="stepDone('uploading')" [class.active]="stage === 'uploading'">Uploading file</div>
        <div class="step" [class.done]="stepDone('reading')" [class.active]="stage === 'reading'">Reading PDF pages</div>
        <div class="step" [class.done]="stepDone('ocr')" [class.active]="stage === 'ocr'">Running OCR on scanned pages</div>
        <div class="step" [class.done]="stepDone('extracting')" [class.active]="stage === 'extracting'">Extracting data with AI</div>
      </div>

      @if (stage === 'failed') {
        <p class="fail-msg">{{ errorMessage || 'Something went wrong while processing this file.' }}</p>
      }
    </div>
  `,
  styles: [`
    .wrap { display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 24px; }
    .ring { position: relative; width: 110px; height: 110px; }
    .ring.spin svg { animation: rotate 2.4s linear infinite; }
    .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .doc { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; }
    @keyframes rotate { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
    .steps { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 320px; }
    .step { padding: 8px 12px; border-radius: var(--dm-radius-sm); color: var(--dm-text-muted); font-size: 0.88rem; border: 1px solid transparent; }
    .step.active { color: var(--dm-text); background: var(--dm-surface-hover); border-color: var(--dm-border); }
    .step.done { color: var(--dm-success); }
    .step.done::before { content: "✓ "; }
    .fail-msg { color: var(--dm-danger); font-size: 0.9rem; text-align: center; }
  `]
})
export class UploadProgressComponent {
  @Input() stage: ProcessingStage = 'uploading';
  @Input() progress = 0;
  @Input() errorMessage?: string;

  private order: ProcessingStage[] = ['uploading', 'reading', 'ocr', 'extracting', 'done'];
  stepDone(step: ProcessingStage): boolean {
    return this.order.indexOf(step) < this.order.indexOf(this.stage);
  }
}
