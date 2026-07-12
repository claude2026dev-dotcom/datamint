import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
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
    @if (dialog.state(); as s) {
      <div class="backdrop" [@fade] (click)="dialog.respond(false)">
        <div class="panel" [@pop] (click)="$event.stopPropagation()" role="alertdialog" aria-modal="true">
          <h3>{{ s.title }}</h3>
          <p>{{ s.message }}</p>
          <div class="actions">
            <button class="dm-btn dm-btn-ghost" (click)="dialog.respond(false)">Cancel</button>
            <button class="dm-btn" [class.dm-btn-danger]="s.danger" [class.dm-btn-primary]="!s.danger" (click)="dialog.respond(true)">
              {{ s.confirmLabel || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .backdrop {
      position: fixed; inset: 0; background: rgba(4, 6, 14, 0.6); backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;
    }
    .panel {
      background: var(--dm-surface); border: 1px solid var(--dm-border); border-radius: var(--dm-radius-md);
      box-shadow: var(--dm-shadow); padding: 24px; width: 100%; max-width: 400px;
      max-height: 100%; overflow-y: auto;
    }
    h3 { margin: 0 0 10px; font-size: 1.05rem; }
    p { margin: 0 0 20px; color: var(--dm-text-muted); font-size: 0.9rem; line-height: 1.5; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; }
    .dm-btn-danger { background: var(--dm-danger); color: var(--dm-danger-contrast-text); border: none; }
    .dm-btn-danger:hover { filter: brightness(1.08); }
  `]
})
export class ConfirmDialogComponent {
  constructor(public dialog: ConfirmDialogService) {}
}
