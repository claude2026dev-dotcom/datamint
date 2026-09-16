import { Component, Input } from '@angular/core';

/// A single rotating-arc spinner reused everywhere something is "in progress" inline inside a
/// button or label (export downloads, email sending) - one shared animation definition so every
/// busy-state indicator in the app looks and moves identically, in currentColor so it always
/// matches whatever button/text color it's dropped into.
@Component({
  selector: 'app-spinner',
  standalone: true,
  template: `<span class="dm-spinner" [style.width.px]="size" [style.height.px]="size" aria-hidden="true"></span>`,
  styles: [`
    .dm-spinner {
      display: inline-block; border-radius: 50%; flex-shrink: 0;
      border: 2px solid currentColor; border-top-color: transparent; opacity: 0.85;
      animation: dm-spinner-spin 0.7s linear infinite;
    }
    @keyframes dm-spinner-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .dm-spinner { animation: none; border-top-color: currentColor; }
    }
  `]
})
export class SpinnerComponent {
  @Input() size = 15;
}
