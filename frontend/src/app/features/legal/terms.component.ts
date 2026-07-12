import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule, BackButtonComponent],
  template: `
    <div class="dm-container legal">
      <app-back-button fallbackUrl="/" />
      <h1>Terms and Conditions</h1>
      <p class="muted">Last updated: placeholder — replace with your actual effective date.</p>
      <p>These Terms govern your use of Datamint. By creating an account or uploading a document, you agree to these Terms.</p>
      <h3>1. Use of the service</h3>
      <p>Datamint lets you upload PDF documents for automated, AI-assisted data extraction. You are responsible for ensuring you have the right to upload and process any document you submit.</p>
      <h3>2. Free tier and subscriptions</h3>
      <p>New users may process a limited number of documents for free. Continued or higher-volume use requires an active paid subscription, billed and processed via our payment partner.</p>
      <h3>3. Data handling</h3>
      <p>Uploaded documents and extracted data are stored to provide the service (history, export, email delivery) and are handled in line with our Privacy Policy.</p>
      <h3>4. Acceptable use</h3>
      <p>You agree not to upload unlawful, infringing, or malicious content, or attempt to disrupt or reverse-engineer the service.</p>
      <h3>5. Liability</h3>
      <p>Extracted data is AI-generated and may contain errors; you are responsible for reviewing and verifying results before relying on them.</p>
      <p class="muted note">This is placeholder legal text for scaffolding purposes only — have this reviewed by a qualified professional before going live.</p>
    </div>
  `,
  styles: [`
    .legal { padding-top: 50px; padding-bottom: 90px; max-width: 780px; }
    h1 { margin-bottom: 6px; }
    h3 { margin-top: 26px; margin-bottom: 8px; }
    p { color: var(--dm-text-muted); line-height: 1.6; }
    .note { margin-top: 30px; font-size: 0.82rem; font-style: italic; }
  `]
})
export class TermsComponent {}
