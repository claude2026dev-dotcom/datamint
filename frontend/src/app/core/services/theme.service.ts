import { Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'dm-theme';

/// Tracks the user's Light/Dark/System choice and applies it as a `data-theme`
/// attribute on <html> (which every color in _tokens.scss is keyed off).
/// A blocking inline script in index.html applies the same logic on first
/// paint, before Angular boots, so there's never a flash of the wrong theme.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private media = window.matchMedia('(prefers-color-scheme: dark)');
  readonly preference = signal<ThemePreference>(this.readStoredPreference());
  readonly resolved = signal<ResolvedTheme>(this.resolve(this.preference()));

  constructor() {
    this.apply(this.resolved());
    this.media.addEventListener('change', () => {
      if (this.preference() === 'system') this.setResolved(this.resolve('system'));
    });
  }

  setPreference(pref: ThemePreference) {
    this.preference.set(pref);
    try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* private browsing, etc. - non-fatal */ }
    this.setResolved(this.resolve(pref));
  }

  private setResolved(theme: ResolvedTheme) {
    this.resolved.set(theme);
    this.apply(theme);
  }

  private apply(theme: ResolvedTheme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  private resolve(pref: ThemePreference): ResolvedTheme {
    return pref === 'system' ? (this.media.matches ? 'dark' : 'light') : pref;
  }

  private readStoredPreference(): ThemePreference {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  }
}
