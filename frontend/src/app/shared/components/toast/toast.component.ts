import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate('220ms cubic-bezier(.2,.8,.2,1)', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ transform: 'translateY(10px)', opacity: 0 }))
      ])
    ])
  ],
  template: `
    <div class="dm-toast-stack">
      @for (m of toast.messages(); track m.id) {
        <div class="dm-toast" [class]="m.kind" [@slideIn]>
          <span class="dot"></span>
          <span>{{ m.text }}</span>
          <button (click)="toast.dismiss(m.id)" aria-label="Dismiss">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .dm-toast-stack { position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; max-width: 360px; }
    .dm-toast {
      display: flex; align-items: center; gap: 10px;
      background: var(--dm-surface); border: 1px solid var(--dm-border);
      color: var(--dm-text); padding: 12px 14px; border-radius: var(--dm-radius-sm);
      box-shadow: var(--dm-shadow); font-size: 0.9rem;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dm-primary); flex-shrink: 0; }
    .dm-toast.success .dot { background: var(--dm-success); }
    .dm-toast.error .dot { background: var(--dm-danger); }
    .dm-toast.info .dot { background: var(--dm-accent); }
    button { margin-left: auto; background: none; border: none; color: var(--dm-text-muted); cursor: pointer; font-size: 1rem; }
    @media (max-width: 480px) { .dm-toast-stack { left: 16px; right: 16px; max-width: none; } }
  `]
})
export class ToastComponent {
  constructor(public toast: ToastService) {}
}
