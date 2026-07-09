import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/// A single, reusable line-icon set used everywhere in the app instead of
/// emoji. Emoji glyphs render as tiny full-color bitmaps outside CSS's
/// control - several (pause, trash, tools) are drawn mostly in dark greys
/// and nearly disappear against this app's near-black theme. These are
/// plain stroke paths on `currentColor`, so they always match surrounding
/// text/button color and stay legible in any theme.
export type IconName =
  | 'search' | 'user' | 'users' | 'credit-card' | 'bar-chart' | 'file-text'
  | 'tool' | 'log-out' | 'edit' | 'key' | 'pause' | 'play' | 'trash'
  | 'alert-triangle' | 'dollar-sign' | 'inbox' | 'upload-cloud' | 'cpu'
  | 'sparkles' | 'chevron-left' | 'menu' | 'arrow-right' | 'scan' | 'grid'
  | 'file' | 'shield' | 'close';

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" [attr.stroke-width]="strokeWidth"
         stroke-linecap="round" stroke-linejoin="round" class="dm-icon" aria-hidden="true">
      @switch (name) {
        @case ('search') {
          <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>
        }
        @case ('user') {
          <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>
        }
        @case ('users') {
          <circle cx="9" cy="8" r="3.2"/><path d="M2.3 20c0-3.6 3-6.2 6.7-6.2s6.7 2.6 6.7 6.2"/>
          <path d="M15.7 8.3a2.9 2.9 0 1 1 3.4 2.86"/><path d="M14.7 14.2c2.8.55 5.1 2.7 5.1 5.8"/>
        }
        @case ('credit-card') {
          <rect x="2.5" y="5.5" width="19" height="13" rx="2.2"/><line x1="2.5" y1="10" x2="21.5" y2="10"/>
        }
        @case ('bar-chart') {
          <line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="7"/><line x1="19" y1="20" x2="19" y2="15"/>
        }
        @case ('file-text') {
          <path d="M6 2.5h7l5 5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/>
          <path d="M13 2.5V7.5a1 1 0 0 0 1 1H18.5"/><line x1="8" y1="12.5" x2="16" y2="12.5"/><line x1="8" y1="16.5" x2="16" y2="16.5"/>
        }
        @case ('file') {
          <path d="M6 2.5h7l5 5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/>
          <path d="M13 2.5V7.5a1 1 0 0 0 1 1H18.5"/>
        }
        @case ('tool') {
          <path d="M14.7 6.3a4 4 0 0 0-5.35 5.3L2.9 18.15l2.95 2.95 6.55-6.45a4 4 0 0 0 5.3-5.35l-2.9 2.9-2.05-.05-.05-2.05 2.9-2.9z"/>
        }
        @case ('shield') {
          <path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.6 7.5 10 4.3-1.4 7.5-5 7.5-10v-6L12 2.5z"/>
        }
        @case ('log-out') {
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        }
        @case ('edit') {
          <path d="M4 20.5h3.2l11-11a2.26 2.26 0 0 0-3.2-3.2l-11 11V20.5z"/><line x1="13.3" y1="6.7" x2="17.3" y2="10.7"/>
        }
        @case ('key') {
          <circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.8 12.2 19.5 3.5l1.7 1.7-1.9 1.9 1.6 1.6-2.3 2.3-1.6-1.6-1.4 1.4"/>
        }
        @case ('pause') {
          <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
        }
        @case ('play') {
          <path d="M6.5 3.5v17l14-8.5z"/>
        }
        @case ('trash') {
          <polyline points="3.5 6 5.5 6 20.5 6"/><path d="M8.5 6V4a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 4v2"/>
          <path d="M18 6v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V6"/><line x1="10" y1="10.5" x2="10" y2="16.5"/><line x1="14" y1="10.5" x2="14" y2="16.5"/>
        }
        @case ('alert-triangle') {
          <path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none"/>
        }
        @case ('dollar-sign') {
          <line x1="12" y1="2" x2="12" y2="22"/><path d="M17 6.5c0-2-2.2-3.5-5-3.5s-5 1.3-5 3.5 2.2 3 5 3.5 5 1.5 5 3.5-2.2 3.5-5 3.5-5-1.5-5-3.5"/>
        }
        @case ('inbox') {
          <polyline points="4 12 8.5 12 10.5 15 13.5 15 15.5 12 20 12"/><path d="M5.5 4.5h13l1.5 7.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7l1.5-7.5z"/>
        }
        @case ('upload-cloud') {
          <path d="M7 18a4.5 4.5 0 0 1-.7-8.94A5.5 5.5 0 0 1 17.3 8 4 4 0 0 1 17 16"/><polyline points="8.5 12.5 12 9 15.5 12.5"/><line x1="12" y1="9" x2="12" y2="19"/>
        }
        @case ('cpu') {
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.7" y="9.7" width="4.6" height="4.6"/>
          <line x1="9" y1="2.5" x2="9" y2="6.5"/><line x1="15" y1="2.5" x2="15" y2="6.5"/><line x1="9" y1="17.5" x2="9" y2="21.5"/><line x1="15" y1="17.5" x2="15" y2="21.5"/>
          <line x1="2.5" y1="9" x2="6.5" y2="9"/><line x1="2.5" y1="15" x2="6.5" y2="15"/><line x1="17.5" y1="9" x2="21.5" y2="9"/><line x1="17.5" y1="15" x2="21.5" y2="15"/>
        }
        @case ('sparkles') {
          <path d="M11 2.5 12.6 8 18 9.5 12.6 11 11 16.5 9.4 11 4 9.5 9.4 8 11 2.5z"/>
          <path d="M18.3 14.3 19 16.5 21.2 17.2 19 17.9 18.3 20.1 17.6 17.9 15.4 17.2 17.6 16.5 18.3 14.3z"/>
        }
        @case ('chevron-left') {
          <polyline points="14.5 4 7 12 14.5 20"/>
        }
        @case ('arrow-right') {
          <line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>
        }
        @case ('menu') {
          <line x1="3.5" y1="6.5" x2="20.5" y2="6.5"/><line x1="3.5" y1="12" x2="20.5" y2="12"/><line x1="3.5" y1="17.5" x2="20.5" y2="17.5"/>
        }
        @case ('scan') {
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8"/><path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8"/>
          <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16"/><path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><line x1="4.5" y1="12" x2="19.5" y2="12"/>
        }
        @case ('close') {
          <line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>
        }
        @case ('grid') {
          <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1"/>
          <rect x="3.5" y="13" width="7.5" height="7.5" rx="1"/><rect x="13" y="13" width="7.5" height="7.5" rx="1"/>
        }
      }
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; }
    .dm-icon { display: block; }
  `]
})
export class IconComponent {
  @Input() name!: IconName;
  @Input() size = 18;
  @Input() strokeWidth = 1.8;
}
