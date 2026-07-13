import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, finalize, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, UserProfile } from '../models/models';

type RefreshResponse = { accessToken: string; refreshToken: string; accessTokenExpiresAtUtc: string };

const ACCESS_TOKEN_KEY = 'dm_access_token';
const REFRESH_TOKEN_KEY = 'dm_refresh_token';
const USER_KEY = 'dm_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSignal = signal<UserProfile | null>(this.readStoredUser());
  currentUser = computed(() => this.userSignal());
  isLoggedIn = computed(() => !!this.userSignal());
  isAdmin = computed(() => this.userSignal()?.role === 'Admin');

  // Several requests can be in flight when the access token turns out to be dead
  // (e.g. right after a password change on another device) - without this they'd
  // each independently hit /auth/refresh and each independently show their own
  // "session expired" toast. refreshInFlight$ makes concurrent 401s share one
  // refresh call; sessionExpiryHandled makes errorInterceptor show that toast once.
  private refreshInFlight$: Observable<RefreshResponse> | null = null;
  private sessionExpiryHandled = false;

  constructor(private http: HttpClient, private router: Router) {
    // localStorage is one shared bucket per browser (not per tab), so every
    // open tab already reads the same session. The `storage` event is what
    // makes that live: it fires in every OTHER tab the instant one tab logs
    // in/out/changes profile, so two tabs can never end up showing two
    // different signed-in users at once - the thing "remember me" used to
    // get wrong by splitting sessions across localStorage/sessionStorage.
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== USER_KEY) return;
      this.userSignal.set(event.newValue ? JSON.parse(event.newValue) : null);
    });
  }

  private readStoredUser(): UserProfile | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private persistSession(res: AuthResponse) {
    localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.userSignal.set(res.user);
    this.sessionExpiryHandled = false;
  }

  /// Lets errorInterceptor show exactly one "session expired" toast/logout even when
  /// several requests fail with 401 around the same time - returns true only for the
  /// first caller since the last successful login.
  claimSessionExpiry(): boolean {
    if (this.sessionExpiryHandled) return false;
    this.sessionExpiryHandled = true;
    return true;
  }

  register(email: string, password: string, displayName?: string, rememberMe = true) {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/register`, { email, password, displayName, rememberMe });
  }

  login(email: string, password: string, rememberMe = false) {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/login`, { email, password, rememberMe });
  }

  loginWithGoogle(idToken: string) {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/google`, { idToken });
  }

  getProfile() {
    return this.http.get<{ success: boolean; profile: { id: string; email: string; displayName?: string; role: string; isEmailVerified: boolean; createdAtUtc: string; hasPassword: boolean; isSuperAdmin: boolean; avatarUrl?: string | null } }>(
      `${environment.apiBaseUrl}/auth/me`);
  }

  forgotPassword(email: string) {
    return this.http.post<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string) {
    return this.http.post<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/auth/reset-password`, { token, newPassword });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.put<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/auth/change-password`, { currentPassword, newPassword });
  }

  deleteAccount(currentPassword: string | null) {
    return this.http.request<{ success: boolean; message: string }>('delete', `${environment.apiBaseUrl}/auth/me`, { body: { currentPassword } });
  }

  updateProfile(displayName: string) {
    return this.http.put<{ success: boolean; profile: { id: string; email: string; displayName?: string; role: string; isEmailVerified: boolean; createdAtUtc: string; hasPassword: boolean; isSuperAdmin: boolean; avatarUrl?: string | null } }>(
      `${environment.apiBaseUrl}/auth/me`, { displayName }).pipe(
      tap(res => {
        // Keep the cached session in sync so the navbar/anywhere else reflects
        // the new name immediately, without forcing a re-login.
        const current = this.userSignal();
        if (current) {
          const updated = { ...current, displayName: res.profile.displayName };
          localStorage.setItem(USER_KEY, JSON.stringify(updated));
          this.userSignal.set(updated);
        }
      })
    );
  }

  uploadAvatar(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ success: boolean; profile: { avatarUrl?: string | null } }>(
      `${environment.apiBaseUrl}/auth/me/avatar`, form
    ).pipe(tap(res => this.syncAvatar(res.profile.avatarUrl)));
  }

  removeAvatar() {
    return this.http.delete<{ success: boolean; profile: { avatarUrl?: string | null } }>(
      `${environment.apiBaseUrl}/auth/me/avatar`
    ).pipe(tap(res => this.syncAvatar(res.profile.avatarUrl)));
  }

  /// Keeps the cached session (navbar avatar, etc.) in sync with the server's answer
  /// right after an avatar change, the same way updateProfile() does for displayName -
  /// without this the new/removed picture wouldn't show up anywhere until next login.
  private syncAvatar(avatarUrl: string | null | undefined) {
    const current = this.userSignal();
    if (!current) return;
    const updated = { ...current, avatarUrl: avatarUrl ?? undefined };
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    this.userSignal.set(updated);
  }

  /// The cached session (localStorage) exists purely so the navbar/etc. have something
  /// to render instantly on app load instead of a blank flash - it's a snapshot from
  /// whenever the user last logged in or explicitly changed something through this same
  /// service, so it can drift from the server (e.g. an avatar removed but the network
  /// response never landed before the tab closed, or a change made on another device).
  /// Called once on app bootstrap to reconcile it; failures are ignored since the stale
  /// cache is still a reasonable fallback and this must never block app startup.
  refreshCurrentUser() {
    if (!this.userSignal()) return;
    this.getProfile().subscribe({
      next: res => {
        const current = this.userSignal();
        if (!current) return;
        const updated = { ...current, displayName: res.profile.displayName, avatarUrl: res.profile.avatarUrl ?? undefined };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
        this.userSignal.set(updated);
      },
      error: () => {}
    });
  }

  /** Call after any successful auth HTTP response to persist the session and route the user onward. */
  completeLogin(res: AuthResponse, rememberMe: boolean, redirectTo = '/home') {
    this.persistSession(res);
    this.router.navigateByUrl(redirectTo);
  }

  logout() {
    const refreshToken = this.getRefreshToken();
    const clearAndRedirect = () => {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      this.userSignal.set(null);
      this.router.navigateByUrl('/');
    };

    if (refreshToken) {
      // Best-effort server-side revocation - the token must not work again
      // even if it's copied out of storage before this finishes. Client state
      // is cleared either way, even if the network call fails.
      this.http.post(`${environment.apiBaseUrl}/auth/logout`, { refreshToken }).pipe(
        catchError(() => of(null))
      ).subscribe(() => clearAndRedirect());
    } else {
      clearAndRedirect();
    }
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /// Silent refresh: exchanges the stored refresh token for a new access token.
  /// Shared across concurrent callers (shareReplay) - if several requests all hit a
  /// dead access token at once, they ride the same /auth/refresh call instead of each
  /// firing their own, which used to also mean each got its own independent failure
  /// (and its own "session expired" toast) when the refresh token turned out dead too.
  refreshAccessToken() {
    if (this.refreshInFlight$) return this.refreshInFlight$;

    const refreshToken = this.getRefreshToken();
    this.refreshInFlight$ = this.http.post<RefreshResponse>(
      `${environment.apiBaseUrl}/auth/refresh`, { refreshToken }
    ).pipe(
      tap(res => {
        localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
      }),
      finalize(() => this.refreshInFlight$ = null),
      shareReplay(1)
    );
    return this.refreshInFlight$;
  }

}
