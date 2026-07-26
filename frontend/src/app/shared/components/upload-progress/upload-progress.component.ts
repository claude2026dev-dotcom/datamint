import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate, state } from '@angular/animations';
import { IconComponent } from '../icon/icon.component';

export type ProcessingStage = 'uploading' | 'reading' | 'extracting' | 'done' | 'failed';

/// The signature "AI is working on your document" animation: a pulsing document icon
/// inside a gradient progress ring, sparkles drifting past during the AI step, and a
/// step checklist, so the wait never feels dead.
@Component({
  selector: 'app-upload-progress',
  standalone: true,
  imports: [CommonModule, IconComponent],
  animations: [
    trigger('pulse', [
      state('active', style({ transform: 'scale(1.08)' })),
      transition('* <=> active', animate('900ms ease-in-out'))
    ])
  ],
  template: `
    <div class="wrap">
      <div class="ring" [class.spin]="stage !== 'done' && stage !== 'failed'" [class.glow]="stage === 'extracting'">
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
        <span class="doc" [class.success]="stage === 'done'" [class.error]="stage === 'failed'"
              [@pulse]="stage !== 'done' && stage !== 'failed' ? 'active' : 'idle'">
          @if (stage === 'done') {
            <app-icon name="check-circle" [size]="34" />
          } @else if (stage === 'failed') {
            <app-icon name="x-circle" [size]="34" />
          } @else {
            <app-icon name="file" [size]="32" />
          }
        </span>
        @if (stage === 'extracting') {
          <span class="sparkle sparkle-1"><app-icon name="sparkles" [size]="14" /></span>
          <span class="sparkle sparkle-2"><app-icon name="sparkles" [size]="10" /></span>
        }
      </div>

      <div class="steps">
        <div class="step" [class.done]="stepDone('uploading')" [class.active]="stage === 'uploading'">
          <span class="step-dot"></span> Uploading file
        </div>
        <div class="step" [class.done]="stepDone('reading')" [class.active]="stage === 'reading'">
          <span class="step-dot"></span> Reading pages
        </div>
        <div class="step" [class.done]="stepDone('extracting')" [class.active]="stage === 'extracting'">
          <span class="step-dot"></span> Extracting data with AI
        </div>
      </div>

      @if (stage === 'failed') {
        <p class="fail-msg">{{ errorMessage || 'Something went wrong while processing this file.' }}</p>
      }
    </div>
  `,
  styles: [`
    .wrap { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px; }
    .ring { position: relative; width: 116px; height: 116px; }
    .ring.spin svg { animation: rotate 2.4s linear infinite; }
    .ring.glow { filter: drop-shadow(0 0 14px rgba(99,102,241,0.35)); }
    .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .doc { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--dm-primary-light); }
    .doc.success { color: var(--dm-success); }
    .doc.error { color: var(--dm-danger); }
    @keyframes rotate { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }

    .sparkle { position: absolute; color: var(--dm-accent); animation: drift 2.6s ease-in-out infinite; }
    .sparkle-1 { top: 6px; right: 10px; animation-delay: 0s; }
    .sparkle-2 { bottom: 12px; left: 4px; animation-delay: 1.1s; }
    @keyframes drift { 0%, 100% { opacity: 0.25; transform: translateY(0) scale(0.9); } 50% { opacity: 1; transform: translateY(-6px) scale(1.1); } }

    .steps { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 320px; }
    .step { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: var(--dm-radius-sm); color: var(--dm-text-muted); font-size: 0.88rem; border: 1px solid transparent; transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease; }
    .step-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dm-border); flex-shrink: 0; transition: background 0.2s ease, box-shadow 0.2s ease; }
    .step.active { color: var(--dm-text); background: var(--dm-surface-hover); border-color: var(--dm-border); }
    .step.active .step-dot { background: var(--dm-primary); box-shadow: 0 0 0 4px rgba(99,102,241,0.18); animation: pulse-dot 1.2s ease-in-out infinite; }
    .step.done { color: var(--dm-success); }
    .step.done .step-dot { background: var(--dm-success); box-shadow: none; }
    @keyframes pulse-dot { 0%, 100% { box-shadow: 0 0 0 4px rgba(99,102,241,0.18); } 50% { box-shadow: 0 0 0 8px rgba(99,102,241,0.06); } }
    .fail-msg { color: var(--dm-danger); font-size: 0.9rem; text-align: center; }
  `]
})
export class UploadProgressComponent {
  @Input() stage: ProcessingStage = 'uploading';
  @Input() progress = 0;
  @Input() errorMessage?: string;

  private order: ProcessingStage[] = ['uploading', 'reading', 'extracting', 'done'];
  stepDone(step: ProcessingStage): boolean {
    return this.order.indexOf(step) < this.order.indexOf(this.stage);
  }
}
