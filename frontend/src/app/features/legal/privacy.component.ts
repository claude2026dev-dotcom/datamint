import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dm-container legal">
      <h1>Privacy Policy</h1>
      <p class="muted">Last updated: placeholder — replace with your actual effective date.</p>
      <p>This Privacy Policy explains what information Datamint collects and how it's used.</p>
      <h3>1. Information we collect</h3>
      <p>Account details (email, name), uploaded documents and extracted data, usage/audit logs, and payment metadata (processed by our payment partner — we do not store card details).</p>
      <h3>2. How we use it</h3>
      <p>To provide extraction and export features, secure your account, enforce plan limits, and improve reliability.</p>
      <h3>3. Third parties</h3>
      <p>We use trusted sub-processors for AI extraction, email delivery, authentication, and payments. Each only receives the data needed to perform its function.</p>
      <h3>4. Data retention & deletion</h3>
      <p>You may request deletion of your account and associated documents at any time by contacting support.</p>
      <p class="muted note">This is placeholder legal text for scaffolding purposes only — have this reviewed by a qualified professional before going live.</p>
    </div>
  `,
  styles: [`
    .legal { padding: 50px 0 90px; max-width: 780px; }
    h1 { margin-bottom: 6px; }
    h3 { margin-top: 26px; margin-bottom: 8px; }
    p { color: var(--dm-text-muted); line-height: 1.6; }
    .note { margin-top: 30px; font-size: 0.82rem; font-style: italic; }
  `]
})
export class PrivacyComponent {}
