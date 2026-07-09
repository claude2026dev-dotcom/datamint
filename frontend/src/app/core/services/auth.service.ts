import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, UserProfile } from '../models/models';

const ACCESS_TOKEN_KEY = 'dm_access_token';
const REFRESH_TOKEN_KEY = 'dm_refresh_token';
const USER_KEY = 'dm_user';
const ANON_UPLOAD_COUNT_KEY = 'dm_anon_upload_count';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSignal = signal<UserProfile | null>(this.readStoredUser());
  currentUser = computed(() => this.userSignal());
  isLoggedIn = computed(() => !!this.userSignal());
  isAdmin = computed(() => this.userSignal()?.role === 'Admin');

  constructor(private http: HttpClient, private router: Router) {}

  /**
   * "Remember me" ticked -> localStorage (survives closing the browser, backend
   * issues a ~10 day refresh token). Not ticked -> sessionStorage, which the
   * browser itself clears when it actually closes, paired with a short-lived
   * server-side refresh token - so an un-remembered session dies both on the
   * client and the server at roughly the same time.
   */
  private activeStorage(): Storage {
    if (localStorage.getItem(USER_KEY)) return localStorage;
    if (sessionStorage.getItem(USER_KEY)) return sessionStorage;
    return localStorage;
  }

  private readStoredUser(): UserProfile | null {
    const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private persistSession(res: AuthResponse, rememberMe: boolean) {
    const storage = rememberMe ? localStorage : sessionStorage;
    // Clear the other storage first so a stale token there never wins a lookup.
    (rememberMe ? sessionStorage : localStorage).removeItem(ACCESS_TOKEN_KEY);
    (rememberMe ? sessionStorage : localStorage).removeItem(REFRESH_TOKEN_KEY);
    (rememberMe ? sessionStorage : localStorage).removeItem(USER_KEY);

    storage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
    storage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
    storage.setItem(USER_KEY, JSON.stringify(res.user));
    this.userSignal.set(res.user);
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
    return this.http.get<{ success: boolean; profile: { id: string; email: string; displayName?: string; role: string; isEmailVerified: boolean; createdAtUtc: string; hasPassword: boolean } }>(
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
    return this.http.put<{ success: boolean; profile: { id: string; email: string; displayName?: string; role: string; isEmailVerified: boolean; createdAtUtc: string; hasPassword: boolean } }>(
      `${environment.apiBaseUrl}/auth/me`, { displayName }).pipe(
      tap(res => {
        // Keep the cached session in sync so the navbar/anywhere else reflects
        // the new name immediately, without forcing a re-login.
        const current = this.userSignal();
        if (current) {
          const updated = { ...current, displayName: res.profile.displayName };
          this.activeStorage().setItem(USER_KEY, JSON.stringify(updated));
          this.userSignal.set(updated);
        }
      })
    );
  }

  /** Call after any successful auth HTTP response to persist the session and route the user onward. */
  completeLogin(res: AuthResponse, rememberMe: boolean, redirectTo = '/upload') {
    this.persistSession(res, rememberMe);
    this.router.navigateByUrl(redirectTo);
  }

  logout() {
    const refreshToken = this.getRefreshToken();
    const clearAndRedirect = () => {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
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
    return localStorage.getItem(ACCESS_TOKEN_KEY) ?? sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY) ?? sessionStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /** Silent refresh: exchanges the stored refresh token for a new access token, keeping the same storage it came from. */
  refreshAccessToken() {
    const refreshToken = this.getRefreshToken();
    const storage = this.activeStorage();

    return this.http.post<{ accessToken: string; refreshToken: string; accessTokenExpiresAtUtc: string }>(
      `${environment.apiBaseUrl}/auth/refresh`, { refreshToken }
    ).pipe(
      tap(res => {
        storage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
        storage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
      })
    );
  }

  // ---- Free-tier anonymous upload counter (used before the user logs in) ----
  getAnonUploadCount(): number {
    return Number(localStorage.getItem(ANON_UPLOAD_COUNT_KEY) ?? '0');
  }

  incrementAnonUploadCount(by: number) {
    localStorage.setItem(ANON_UPLOAD_COUNT_KEY, String(this.getAnonUploadCount() + by));
  }

  hasReachedFreeLimit(): boolean {
    return !this.isLoggedIn() && this.getAnonUploadCount() >= environment.freeUploadLimit;
  }
}
