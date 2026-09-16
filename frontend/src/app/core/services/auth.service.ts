import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, finalize, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, UserProfile } from '../models/models';
import { ToastService } from './toast.service';

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
  private sessionCheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private http: HttpClient, private router: Router, private toast: ToastService) {
    // localStorage is one shared bucket per browser (not per tab), so every
    // open tab already reads the same session. The `storage` event is what
    // makes that live: it fires in every OTHER tab the instant one tab logs
    // in/out/changes profile, so two tabs can never end up showing two
    // different signed-in users at once - the thing "remember me" used to
    // get wrong by splitting sessions across localStorage/sessionStorage.
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== USER_KEY) return;
      this.userSignal.set(event.newValue ? JSON.parse(event.newValue) : null);
      // Another tab just logged out - this tab's own proactive-refresh timer would
      // otherwise fire later against a session that's already gone, an avoidable
      // wasted request and a stray toast. Login elsewhere re-arms correctly on its
      // own once THIS tab makes any authenticated request, so no action needed there.
      if (event.newValue === null && this.sessionCheckTimer) {
        clearTimeout(this.sessionCheckTimer);
        this.sessionCheckTimer = null;
      }
    });

    // Everything else in this service only reacts to an access token dying WHEN a
    // request happens to use it - a user idle on a page that makes no calls (or one
    // sitting in a background tab) would keep showing as logged in indefinitely even
    // after both tokens are truly dead, until they eventually click something. This
    // schedules a proactive check ahead of the CURRENT access token's own expiry
    // (whatever is already in localStorage from a previous visit) so app bootstrap
    // covers a page reload/reopen the exact same way a fresh login does.
    this.scheduleProactiveRefresh();

    // setTimeout can be throttled or paused entirely while a tab is backgrounded or
    // the OS suspends the whole browser (laptop sleep) - the scheduled check above
    // can end up firing very late, or effectively never until something else wakes
    // the tab. Re-arming on resume recomputes the delay against the real current
    // time, so a token that's already expired by the time the tab becomes visible
    // again triggers the check almost immediately instead of waiting on a timer that
    // was silently starved.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.scheduleProactiveRefresh();
    });
  }

  /// Reads the "exp" claim straight out of the access token itself rather than
  /// tracking a separately-stored expiry value - one source of truth that's already
  /// correct on every code path (initial page load, login, Google sign-in, silent
  /// refresh) with nothing extra to keep in sync.
  private decodeJwtExpiryMs(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const exp = JSON.parse(json)?.exp;
      return typeof exp === 'number' ? exp * 1000 : null;
    } catch {
      return null;
    }
  }

  /// Schedules checkSessionValidity() to run shortly before the CURRENT access
  /// token's own expiry (never negative - an already-expired token still schedules
  /// an almost-immediate check rather than silently doing nothing). Re-armed after
  /// every login, Google sign-in, and successful silent refresh (see persistSession/
  /// refreshAccessToken), so this keeps re-triggering itself roughly every ~30
  /// minutes (the access token lifetime) for as long as the refresh token underneath
  /// it keeps working - which is exactly how long "remember me" or a normal session
  /// is supposed to last, regardless of which login method produced it.
  private scheduleProactiveRefresh() {
    if (this.sessionCheckTimer) {
      clearTimeout(this.sessionCheckTimer);
      this.sessionCheckTimer = null;
    }
    const token = this.getAccessToken();
    if (!token || !this.getRefreshToken()) return;

    const expiryMs = this.decodeJwtExpiryMs(token);
    if (!expiryMs) return;

    const REFRESH_MARGIN_MS = 60_000;
    const delay = Math.max(expiryMs - Date.now() - REFRESH_MARGIN_MS, 1_000);
    this.sessionCheckTimer = setTimeout(() => this.checkSessionValidity(), delay);
  }

  /// The proactive counterpart to authInterceptor's reactive 401-triggered refresh -
  /// same refreshAccessToken() call, same claimSessionExpiry()-gated single toast/
  /// logout, just fired by a timer instead of an actual request so it still happens
  /// for a user who's simply idle rather than one who's actively clicking around.
  private checkSessionValidity() {
    if (!this.getAccessToken() || !this.getRefreshToken()) return;
    this.refreshAccessToken().subscribe({
      error: () => {
        if (this.claimSessionExpiry()) {
          this.toast.error('Your session has expired. Please sign in again.');
          this.logout(`/login?returnUrl=${encodeURIComponent(this.router.url)}`);
        }
      }
    });
  }

  private readStoredUser(): UserProfile | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  /// The backend always returns avatarUrl as a path relative to the API's own origin
  /// (e.g. "/api/auth/avatar/xyz.jpg"), never a full URL. In production the frontend
  /// (Static Web Apps) and API (App Service) live on entirely different domains, so
  /// binding that path straight into an <img src> 404s against the frontend's own
  /// origin instead of the API's. Every avatarUrl this service stores goes through
  /// here first so every consumer (navbar, profile page) can just use it directly.
  /// Leading-slash paths resolve against the base URL's origin regardless of the
  /// base's own path segment (e.g. the trailing "/api" in apiBaseUrl), per the WHATWG
  /// URL spec - so this can't accidentally produce a doubled "/api/api/...".
  resolveAvatarUrl(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    if (/^https?:\/\//i.test(url)) return url;
    return new URL(url, environment.apiBaseUrl).href;
  }

  private persistSession(res: AuthResponse) {
    const user = { ...res.user, avatarUrl: this.resolveAvatarUrl(res.user.avatarUrl) };
    localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.userSignal.set(user);
    this.sessionExpiryHandled = false;
    // Every login path (credentials, Google, register) funnels through here, so this
    // is the one place that needs to (re)arm the proactive expiry check - covers all
    // three the same way, no per-method wiring needed.
    this.scheduleProactiveRefresh();
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
    const updated = { ...current, avatarUrl: this.resolveAvatarUrl(avatarUrl) };
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
        const updated = { ...current, displayName: res.profile.displayName, avatarUrl: this.resolveAvatarUrl(res.profile.avatarUrl) };
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

  logout(redirectTo = '/') {
    const refreshToken = this.getRefreshToken();
    const clearAndRedirect = () => {
      if (this.sessionCheckTimer) {
        clearTimeout(this.sessionCheckTimer);
        this.sessionCheckTimer = null;
      }
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      this.userSignal.set(null);
      this.router.navigateByUrl(redirectTo);
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
        // Re-arm against the NEW token's own expiry - this is what keeps the
        // proactive check self-sustaining every ~30 minutes for as long as the
        // refresh token underneath it keeps working, whether this refresh was
        // triggered reactively (authInterceptor, on a real request's 401) or
        // proactively (checkSessionValidity's timer).
        this.scheduleProactiveRefresh();
      }),
      finalize(() => this.refreshInFlight$ = null),
      shareReplay(1)
    );
    return this.refreshInFlight$;
  }

}
