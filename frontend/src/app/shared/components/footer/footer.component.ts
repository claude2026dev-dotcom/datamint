import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <footer class="dm-footer">
      <div class="dm-container footer-inner">
        <span class="brand">
          <span class="brand-mark">{{ appName[0] }}</span> {{ appName }}
        </span>
        <nav class="footer-links">
          <a routerLink="/terms">Terms</a>
          <a routerLink="/privacy">Privacy</a>
          <a href="mailto:claude2026dev@gmail.com" class="contact-link">
            <app-icon name="inbox" [size]="14" /> Contact us
          </a>
        </nav>
        <span class="copyright">© {{ year }} {{ appName }}</span>
      </div>
    </footer>
  `,
  styles: [`
    /* app-root is the flex column that actually needs this margin-top: auto - this
       component's own <app-footer> host tag is the real flex item there, not the
       <footer> element nested inside its template. Without :host also carrying it,
       the inner element's margin has no flex-item to push, so the footer just sits
       wherever the page's content ends instead of sticking to the viewport bottom. */
    :host { display: block; width: 100%; margin-top: auto; }
    .dm-footer { border-top: 1px solid var(--dm-border); padding: 24px 0; }
    .footer-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--dm-text-muted); font-size: 0.88rem; }
    .brand-mark { width: 20px; height: 20px; border-radius: 5px; background: var(--dm-gradient-primary); display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; font-size: 0.7rem; }
    .footer-links { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
    .footer-links a { color: var(--dm-text-muted); text-decoration: none; font-size: 0.85rem; transition: color 0.15s ease; }
    .footer-links a:hover { color: var(--dm-text); }
    .contact-link { display: inline-flex; align-items: center; gap: 6px; }
    .copyright { color: var(--dm-text-muted); font-size: 0.82rem; }
    @media (max-width: 560px) { .footer-inner { flex-direction: column; align-items: flex-start; } }
  `]
})
export class FooterComponent {
  year = new Date().getFullYear();
  readonly appName = environment.appName;
}
