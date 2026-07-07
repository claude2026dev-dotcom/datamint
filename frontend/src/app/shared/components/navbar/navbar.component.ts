import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="dm-nav">
      <div class="dm-container dm-nav-inner">
        <a routerLink="/" class="brand">
          <span class="brand-mark">D</span>
          <span>Datamint</span>
        </a>

        <div class="links" [class.open]="menuOpen">
          <a routerLink="/upload" routerLinkActive="active">Upload</a>
          <a routerLink="/plans" routerLinkActive="active">Pricing</a>
          @if (auth.isAdmin()) { <a routerLink="/admin" routerLinkActive="active">Admin</a> }
        </div>

        <div class="actions">
          @if (auth.isLoggedIn()) {
            <span class="email">{{ auth.currentUser()?.email }}</span>
            <button class="dm-btn dm-btn-ghost" (click)="auth.logout()">Sign out</button>
          } @else {
            <a routerLink="/login" class="dm-btn dm-btn-ghost">Log in</a>
            <a routerLink="/register" class="dm-btn dm-btn-primary">Get started</a>
          }
        </div>

        <button class="burger" (click)="menuOpen = !menuOpen" aria-label="Toggle menu">☰</button>
      </div>
    </nav>
  `,
  styles: [`
    .dm-nav { position: sticky; top: 0; z-index: 100; background: rgba(11,14,23,0.85); backdrop-filter: blur(10px); border-bottom: 1px solid var(--dm-border); }
    .dm-nav-inner { display: flex; align-items: center; gap: 24px; height: 64px; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.1rem; color: var(--dm-text); text-decoration: none; }
    .brand-mark { width: 30px; height: 30px; border-radius: 8px; background: var(--dm-gradient-primary); display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; }
    .links { display: flex; gap: 18px; flex: 1; }
    .links a { color: var(--dm-text-muted); text-decoration: none; font-weight: 500; font-size: 0.92rem; transition: color 0.15s; }
    .links a:hover, .links a.active { color: var(--dm-text); }
    .actions { display: flex; align-items: center; gap: 10px; }
    .email { color: var(--dm-text-muted); font-size: 0.85rem; }
    .burger { display: none; background: none; border: none; color: var(--dm-text); font-size: 1.3rem; cursor: pointer; }

    @media (max-width: 768px) {
      .links { position: absolute; top: 64px; left: 0; right: 0; background: var(--dm-bg-elevated); flex-direction: column; padding: 12px 20px; display: none; }
      .links.open { display: flex; }
      .burger { display: block; }
      .actions .email { display: none; }
    }
  `]
})
export class NavbarComponent {
  menuOpen = false;
  constructor(public auth: AuthService) {}
}
