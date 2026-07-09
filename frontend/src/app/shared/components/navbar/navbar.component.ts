import { Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="dm-nav">
      <div class="dm-container dm-nav-inner">
        <a routerLink="/" class="brand">
          <span class="brand-mark">D</span>
          <span>Datamint</span>
        </a>

        <div class="links" [class.open]="menuOpen">
          <a routerLink="/upload" routerLinkActive="active" (click)="menuOpen = false">Upload</a>
          <a routerLink="/plans" routerLinkActive="active" (click)="menuOpen = false">Pricing</a>
          @if (auth.isAdmin()) { <a routerLink="/admin" routerLinkActive="active" (click)="menuOpen = false">Admin</a> }
        </div>

        <div class="actions">
          @if (auth.isLoggedIn()) {
            <div class="profile-menu">
              <button class="avatar-btn" (click)="profileOpen = !profileOpen" aria-label="Account menu">
                <span class="avatar">{{ initials() }}</span>
              </button>
              @if (profileOpen) {
                <div class="profile-dropdown dm-card">
                  <div class="profile-header">
                    <span class="avatar avatar-lg">{{ initials() }}</span>
                    <div>
                      <div class="name">{{ auth.currentUser()?.displayName || 'Datamint user' }}</div>
                      <div class="email">{{ auth.currentUser()?.email }}</div>
                    </div>
                  </div>
                  <a routerLink="/profile" class="dropdown-item" (click)="profileOpen = false">
                    <app-icon name="user" [size]="16" /> My profile
                  </a>
                  <a routerLink="/plans" class="dropdown-item" (click)="profileOpen = false">
                    <app-icon name="credit-card" [size]="16" /> Current plan
                  </a>
                  @if (auth.isAdmin()) {
                    <a routerLink="/admin" class="dropdown-item" (click)="profileOpen = false">
                      <app-icon name="tool" [size]="16" /> Admin dashboard
                    </a>
                  }
                  <button class="dropdown-item signout" (click)="signOut()">
                    <app-icon name="log-out" [size]="16" /> Sign out
                  </button>
                </div>
              }
            </div>
          } @else {
            <a routerLink="/login" class="dm-btn dm-btn-ghost">Log in</a>
            <a routerLink="/register" class="dm-btn dm-btn-primary">Get started</a>
          }
        </div>

        <button class="burger" (click)="menuOpen = !menuOpen" aria-label="Toggle menu">
          <app-icon [name]="menuOpen ? 'close' : 'menu'" [size]="22" />
        </button>
      </div>
    </nav>
  `,
  styles: [`
    .dm-nav { position: sticky; top: 0; z-index: 100; background: rgba(11,14,23,0.85); backdrop-filter: blur(10px); border-bottom: 1px solid var(--dm-border); }
    .dm-nav-inner { display: flex; align-items: center; gap: 24px; height: 64px; position: relative; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.1rem; color: var(--dm-text); text-decoration: none; }
    .brand-mark { width: 30px; height: 30px; border-radius: 8px; background: var(--dm-gradient-primary); display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; }
    .links { display: flex; gap: 18px; flex: 1; }
    .links a { color: var(--dm-text-muted); text-decoration: none; font-weight: 500; font-size: 0.92rem; transition: color 0.15s; }
    .links a:hover, .links a.active { color: var(--dm-text); }
    .actions { display: flex; align-items: center; gap: 10px; }
    .burger { display: none; background: none; border: none; color: var(--dm-text); cursor: pointer; padding: 4px; }

    .profile-menu { position: relative; }
    .avatar-btn { background: none; border: none; padding: 0; cursor: pointer; border-radius: 50%; }
    .avatar {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%; background: var(--dm-gradient-primary);
      color: white; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.02em;
    }
    .avatar-lg { width: 44px; height: 44px; font-size: 1rem; flex-shrink: 0; }
    .profile-dropdown {
      position: absolute; top: calc(100% + 10px); right: 0; width: 260px; padding: 8px;
      box-shadow: var(--dm-shadow); z-index: 200;
      animation: dropdown-in 0.15s ease-out;
    }
    @keyframes dropdown-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .profile-header { display: flex; align-items: center; gap: 12px; padding: 10px 10px 14px; border-bottom: 1px solid var(--dm-border); margin-bottom: 6px; }
    .name { font-weight: 600; font-size: 0.9rem; }
    .email { color: var(--dm-text-muted); font-size: 0.78rem; word-break: break-all; }
    .dropdown-item {
      display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px; border-radius: var(--dm-radius-sm);
      color: var(--dm-text); text-decoration: none; font-size: 0.88rem; background: none; border: none; cursor: pointer;
    }
    .dropdown-item app-icon { color: var(--dm-text-muted); flex-shrink: 0; }
    .dropdown-item:hover { background: var(--dm-surface); }
    .dropdown-item.signout { color: var(--dm-danger); }
    .dropdown-item.signout app-icon { color: var(--dm-danger); }

    @media (max-width: 768px) {
      .links { position: absolute; top: 64px; left: 0; right: 0; background: var(--dm-bg-elevated); flex-direction: column; padding: 12px 20px; display: none; }
      .links.open { display: flex; }
      .burger { display: block; }
    }
  `]
})
export class NavbarComponent {
  menuOpen = false;
  profileOpen = false;

  constructor(public auth: AuthService, private elementRef: ElementRef) {}

  initials(): string {
    const user = this.auth.currentUser();
    if (!user) return '?';
    const name = user.displayName?.trim();
    if (name) {
      const parts = name.split(/\s+/);
      return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
    }
    return user.email[0].toUpperCase();
  }

  signOut() {
    this.profileOpen = false;
    this.auth.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.profileOpen && !this.elementRef.nativeElement.contains(event.target)) {
      this.profileOpen = false;
    }
  }
}
