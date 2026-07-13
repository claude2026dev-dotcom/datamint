import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { IconComponent } from '../icon/icon.component';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="dm-nav">
      <div class="dm-container dm-nav-inner">
        <a routerLink="/" class="brand">
          <span class="brand-mark">{{ appName[0] }}</span>
          <span>{{ appName }}</span>
        </a>

        <div class="links" [class.open]="menuOpen">
          @if (auth.isLoggedIn()) { <a routerLink="/home" routerLinkActive="active" (click)="menuOpen = false">Home</a> }
          <a routerLink="/upload" routerLinkActive="active" (click)="menuOpen = false">Upload</a>
          @if (auth.isLoggedIn()) { <a routerLink="/documents" routerLinkActive="active" (click)="menuOpen = false">My documents</a> }
          <a routerLink="/plans" routerLinkActive="active" (click)="menuOpen = false">Pricing</a>
          @if (auth.isAdmin()) { <a routerLink="/admin" routerLinkActive="active" (click)="menuOpen = false">Admin</a> }
          <!-- Only rendered (and only ever visible) below the mobile breakpoint - the standalone
               buttons in .actions cover desktop, where there's room for full "Log in"/"Get started"
               buttons alongside the brand and burger without anything overflowing. -->
          @if (!auth.isLoggedIn()) {
            <div class="mobile-auth-links">
              <a routerLink="/login" class="dm-btn dm-btn-ghost" (click)="menuOpen = false">Log in</a>
              <a routerLink="/register" class="dm-btn dm-btn-primary" (click)="menuOpen = false">Get started</a>
            </div>
          }
        </div>

        <div class="actions">
          @if (auth.isLoggedIn()) {
            <div class="profile-menu">
              <button class="avatar-btn" (click)="toggleProfile()" aria-label="Account menu">
                <span class="avatar">
                  @if (auth.currentUser()?.avatarUrl; as avatarUrl) { <img [src]="avatarUrl" alt="" /> } @else { {{ initials() }} }
                </span>
              </button>
              @if (profileOpen) {
                <div class="profile-dropdown dm-card">
                  <div class="profile-header">
                    <span class="avatar avatar-lg">
                      @if (auth.currentUser()?.avatarUrl; as avatarUrl) { <img [src]="avatarUrl" alt="" /> } @else { {{ initials() }} }
                    </span>
                    <div>
                      <div class="name">{{ auth.currentUser()?.displayName || (appName + ' user') }}</div>
                      <div class="email">{{ auth.currentUser()?.email }}</div>
                    </div>
                  </div>
                  <a routerLink="/profile" class="dropdown-item" (click)="profileOpen = false">
                    <app-icon name="user" [size]="16" /> My profile
                  </a>
                  <a routerLink="/profile/plan" class="dropdown-item" (click)="profileOpen = false">
                    <app-icon name="credit-card" [size]="16" /> Current plan
                  </a>
                  <a routerLink="/profile/security" class="dropdown-item" (click)="profileOpen = false">
                    <app-icon name="key" [size]="16" /> Security
                  </a>
                  @if (auth.isAdmin()) {
                    <a routerLink="/admin" class="dropdown-item" (click)="profileOpen = false">
                      <app-icon name="tool" [size]="16" /> Admin dashboard
                    </a>
                  }
                  <div class="dropdown-item theme-row">
                    <app-icon [name]="themeIcon()" [size]="16" />
                    <span>Theme</span>
                    <select class="theme-select" [ngModel]="theme.preference()" (ngModelChange)="theme.setPreference($event)" [attr.aria-label]="themeLabel()">
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                  <button class="dropdown-item signout" (click)="signOut()">
                    <app-icon name="log-out" [size]="16" /> Sign out
                  </button>
                </div>
              }
            </div>
          } @else {
            <div class="desktop-auth-links">
              <a routerLink="/login" class="dm-btn dm-btn-ghost">Log in</a>
              <a routerLink="/register" class="dm-btn dm-btn-primary">Get started</a>
            </div>
          }
        </div>

        <button class="burger" (click)="toggleMenu()" aria-label="Toggle menu">
          <app-icon [name]="menuOpen ? 'close' : 'menu'" [size]="22" />
        </button>
      </div>
    </nav>
  `,
  styles: [`
    .dm-nav { position: sticky; top: 0; z-index: 100; background: var(--dm-nav-bg); backdrop-filter: blur(10px); border-bottom: 1px solid var(--dm-border); }
    .dm-nav-inner { display: flex; align-items: center; gap: 24px; height: 64px; position: relative; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.1rem; color: var(--dm-text); text-decoration: none; }
    .brand-mark { width: 30px; height: 30px; border-radius: 8px; background: var(--dm-gradient-primary); display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; }
    .links { display: flex; gap: 18px; flex: 1; }
    .links a { color: var(--dm-text-muted); text-decoration: none; font-weight: 500; font-size: 0.92rem; transition: color 0.15s; }
    .links a:hover, .links a.active { color: var(--dm-text); }
    .actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
    .desktop-auth-links { display: flex; align-items: center; gap: 10px; }
    /* Only ever rendered when logged out; kept hidden until the mobile
       breakpoint below, where it replaces .desktop-auth-links instead of
       sitting alongside it (two full buttons never fit next to the brand
       and burger at narrow widths - see .mobile-auth-links below). */
    .mobile-auth-links { display: none; }
    .burger { display: none; background: none; border: none; color: var(--dm-text); cursor: pointer; padding: 4px; }

    .profile-menu { position: relative; }
    .avatar-btn { background: none; border: none; padding: 0; cursor: pointer; border-radius: 50%; }
    .avatar {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%; background: var(--dm-gradient-primary);
      color: white; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.02em; overflow: hidden;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .avatar-lg { width: 44px; height: 44px; font-size: 1rem; flex-shrink: 0; }
    .profile-dropdown {
      position: absolute; top: calc(100% + 10px); right: 0; width: min(260px, calc(100vw - 32px)); padding: 8px;
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
    .dropdown-item.theme-row:hover { background: none; cursor: default; }
    .theme-row span { flex: 1; }
    .theme-select {
      background: var(--dm-bg-elevated); color: var(--dm-text); border: 1px solid var(--dm-border);
      border-radius: var(--dm-radius-sm); font-size: 0.82rem; padding: 5px 8px; cursor: pointer;
    }
    .dropdown-item.signout { color: var(--dm-danger); }
    .dropdown-item.signout app-icon { color: var(--dm-danger); }

    @media (max-width: 768px) {
      .links { position: absolute; top: 64px; left: 0; right: 0; background: var(--dm-bg-elevated); flex-direction: column; padding: 12px 20px; display: none; }
      .links.open { display: flex; }
      .burger { display: block; }
      .desktop-auth-links { display: none; }
      .mobile-auth-links { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
    }
  `]
})
export class NavbarComponent implements OnInit, OnDestroy {
  menuOpen = false;
  profileOpen = false;
  readonly appName = environment.appName;

  // Bound once so addEventListener/removeEventListener refer to the exact same
  // function reference (an inline arrow passed to each call would never match,
  // silently leaking the listener instead of actually removing it).
  private readonly documentClickHandler = (event: MouseEvent) => this.onDocumentClick(event);

  constructor(public auth: AuthService, public theme: ThemeService, private elementRef: ElementRef, private zone: NgZone) {}

  ngOnInit() {
    // Registered on the CAPTURE phase (the `true` third argument), not bubble -
    // a plain @HostListener('document:click') only sees the event during bubble,
    // so anything anywhere in the page calling event.stopPropagation() on the way
    // up (e.g. a modal's own backdrop-click handling) silently stops this from
    // ever firing and the dropdown never closes on that particular outside click.
    // Capture runs top-down before any of that, so nothing downstream can block it.
    this.zone.runOutsideAngular(() => {
      document.addEventListener('click', this.documentClickHandler, true);
    });
  }

  ngOnDestroy() {
    document.removeEventListener('click', this.documentClickHandler, true);
  }

  // The profile dropdown and the mobile nav-links panel are two separate open/closed
  // flags, but only one should ever be visible at once - opening either one now
  // explicitly closes the other, instead of them silently stacking on top of each other.
  toggleProfile() {
    this.profileOpen = !this.profileOpen;
    if (this.profileOpen) this.menuOpen = false;
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) this.profileOpen = false;
  }

  themeIcon() {
    switch (this.theme.preference()) {
      case 'light': return 'sun';
      case 'dark': return 'moon';
      default: return 'monitor';
    }
  }

  /// "System" can legitimately resolve differently per browser (each browser reports its
  /// own light/dark setting, independent of - and sometimes out of sync with - the OS), so
  /// the label always shows what it actually resolved to here, not just the raw preference.
  themeLabel(): string {
    const pref = this.theme.preference();
    if (pref === 'system') return `Theme: System (${this.theme.resolved()})`;
    return `Theme: ${pref[0].toUpperCase()}${pref.slice(1)}`;
  }

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

  private onDocumentClick(event: MouseEvent) {
    if (this.elementRef.nativeElement.contains(event.target as Node)) return;
    if (!this.profileOpen && !this.menuOpen) return;
    // The listener runs outside Angular's zone (see ngOnInit) so an ordinary click
    // anywhere on the page doesn't trigger a change-detection pass for no reason -
    // re-entering the zone here means Angular still re-renders for the one click
    // that actually changes profileOpen/menuOpen.
    this.zone.run(() => {
      this.profileOpen = false;
      this.menuOpen = false;
    });
  }
}
