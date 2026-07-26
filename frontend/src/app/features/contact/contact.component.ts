import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContactService } from '../../core/services/contact.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';

/// Public lead-capture form - anyone (logged in or not) can ask a question or request a custom
/// setup. The message is emailed to the configured support inbox (App:ContactEmail) for manual
/// follow-up; nothing is stored beyond the backend's own EmailLog/AuditLog trail.
@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, BackButtonComponent],
  template: `
    <div class="dm-container page">
      <app-back-button />
      <div class="dm-card box">
        @if (sent) {
          <div class="state-icon success"><app-icon name="check-circle" [size]="36" /></div>
          <h2>Message sent</h2>
          <p class="muted">Thanks for reaching out — we'll get back to you soon.</p>
        } @else {
          <h1>Contact us</h1>
          <p class="muted">Have a question, or need a custom extraction setup? Send us a message.</p>

          <label class="field-label">Name</label>
          <input class="dm-input" [(ngModel)]="name" name="name" placeholder="Your name" />

          <label class="field-label">Email</label>
          <input class="dm-input" type="email" [(ngModel)]="email" name="email" placeholder="you@company.com" />

          <label class="field-label">Message</label>
          <textarea class="dm-input" rows="5" [(ngModel)]="message" name="message" placeholder="How can we help?"></textarea>

          <button class="dm-btn dm-btn-primary submit-btn" [disabled]="sending" (click)="submit()">
            {{ sending ? 'Sending…' : 'Send message' }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding-top: 50px; padding-bottom: 80px; }
    .box { max-width: 480px; margin: 0 auto; padding: 32px; display: flex; flex-direction: column; gap: 4px; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 6px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin-bottom: 20px; }
    .field-label { display: block; font-size: 0.8rem; color: var(--dm-text-muted); margin: 10px 0 4px; text-align: left; }
    textarea { resize: vertical; font-family: inherit; }
    .submit-btn { margin-top: 20px; }
    .state-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px; background: rgba(52,211,153,0.15); color: var(--dm-success); }
  `]
})
export class ContactComponent {
  name = '';
  email = '';
  message = '';
  sending = false;
  sent = false;

  constructor(private contactService: ContactService, private toast: ToastService) {}

  submit() {
    if (!this.name.trim() || !this.email.trim() || !this.message.trim()) {
      this.toast.error('Please fill in your name, email, and message.');
      return;
    }

    this.sending = true;
    this.contactService.submit(this.name.trim(), this.email.trim(), this.message.trim()).subscribe({
      next: () => { this.sending = false; this.sent = true; },
      error: err => { this.sending = false; this.toast.error(err?.error?.message || 'Could not send your message. Please try again.'); }
    });
  }
}
