import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { IconComponent, IconName } from '../icon/icon.component';

export type ProcessingStage = 'uploading' | 'reading' | 'extracting' | 'done' | 'failed';

const STAGE_ICON: Record<ProcessingStage, IconName> = {
  uploading: 'upload-cloud',
  reading: 'scan',
  extracting: 'sparkles',
  done: 'check-circle',
  failed: 'x-circle'
};

const STAGE_CAPTION: Record<ProcessingStage, string> = {
  uploading: 'Uploading your file…',
  reading: 'Reading pages…',
  extracting: 'Extracting your data…',
  done: 'All done',
  failed: 'Something went wrong'
};

/// A single animated glance at what's happening - one glowing ring, one crossfading icon, one
/// short caption that changes as the stage advances. Deliberately not a checklist: motion
/// carries the "still working" signal instead of a wall of step text.
@Component({
  selector: 'app-upload-progress',
  standalone: true,
  imports: [CommonModule, IconComponent],
  animations: [
    trigger('iconSwap', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.7) rotate(-8deg)' }),
        animate('320ms cubic-bezier(.2,.8,.2,1)', style({ opacity: 1, transform: 'scale(1) rotate(0)' }))
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ opacity: 0, transform: 'scale(0.7)' }))
      ])
    ]),
    trigger('captionSwap', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(6px)' }),
        animate('260ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('120ms ease-in', style({ opacity: 0 }))
      ])
    ])
  ],
  template: `
    <div class="wrap">
      <div class="ring" [class.spin]="isActive()" [class.glow]="stage === 'extracting'">
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
        <span class="icon-slot" [class.success]="stage === 'done'" [class.error]="stage === 'failed'">
          @if (true) {
            <app-icon [@iconSwap] [name]="STAGE_ICON[stage]" [size]="34" />
          }
        </span>
        @if (stage === 'extracting') {
          <span class="sparkle sparkle-1"><app-icon name="sparkles" [size]="12" /></span>
          <span class="sparkle sparkle-2"><app-icon name="sparkles" [size]="9" /></span>
        }
      </div>

      <p class="caption">
        @if (true) {
          <span [@captionSwap]>{{ stage === 'failed' ? (errorMessage || STAGE_CAPTION[stage]) : STAGE_CAPTION[stage] }}</span>
        }
      </p>

      @if (isActive()) {
        <div class="bar-track"><div class="bar-fill" [style.width.%]="progress"></div></div>
      }
    </div>
  `,
  styles: [`
    .wrap { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 24px; }
    .ring { position: relative; width: 116px; height: 116px; }
    .ring.spin svg { animation: rotate 2.4s linear infinite; }
    .ring.glow { filter: drop-shadow(0 0 16px rgba(99,102,241,0.4)); }
    .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .icon-slot { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--dm-primary-light); }
    .icon-slot.success { color: var(--dm-success); }
    .icon-slot.error { color: var(--dm-danger); }
    @keyframes rotate { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }

    .sparkle { position: absolute; color: var(--dm-accent); animation: drift 2.6s ease-in-out infinite; }
    .sparkle-1 { top: 4px; right: 8px; animation-delay: 0s; }
    .sparkle-2 { bottom: 10px; left: 2px; animation-delay: 1.1s; }
    @keyframes drift { 0%, 100% { opacity: 0.25; transform: translateY(0) scale(0.9); } 50% { opacity: 1; transform: translateY(-6px) scale(1.1); } }

    .caption { min-height: 22px; font-size: 0.95rem; font-weight: 600; color: var(--dm-text); text-align: center; }

    .bar-track { width: 100%; max-width: 260px; height: 5px; border-radius: 999px; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; background: var(--dm-gradient-primary); background-size: 200% 100%; animation: shimmer-move 1.6s ease-in-out infinite; transition: width 0.4s ease; }
    @keyframes shimmer-move { 0% { background-position: 0% 0; } 100% { background-position: 100% 0; } }
  `]
})
export class UploadProgressComponent {
  @Input() stage: ProcessingStage = 'uploading';
  @Input() progress = 0;
  @Input() errorMessage?: string;

  readonly STAGE_ICON = STAGE_ICON;
  readonly STAGE_CAPTION = STAGE_CAPTION;

  isActive(): boolean {
    return this.stage !== 'done' && this.stage !== 'failed';
  }
}
