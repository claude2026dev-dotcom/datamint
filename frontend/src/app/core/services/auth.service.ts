import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
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

  private readStoredUser(): UserProfile | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private persistSession(res: AuthResponse) {
    localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.userSignal.set(res.user);
  }

  register(email: string, password: string, displayName?: string) {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/register`, { email, password, displayName });
  }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/login`, { email, password });
  }

  loginWithGoogle(idToken: string) {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/google`, { idToken });
  }

  getProfile() {
    return this.http.get<{ success: boolean; profile: { id: string; email: string; displayName?: string; role: string; isEmailVerified: boolean; createdAtUtc: string } }>(
      `${environment.apiBaseUrl}/auth/me`);
  }

  updateProfile(displayName: string) {
    return this.http.put<{ success: boolean; profile: { id: string; email: string; displayName?: string; role: string; isEmailVerified: boolean; createdAtUtc: string } }>(
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

  /** Call after any successful auth HTTP response to persist the session and route the user onward. */
  completeLogin(res: AuthResponse, redirectTo = '/upload') {
    this.persistSession(res);
    this.router.navigateByUrl(redirectTo);
  }

  logout() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSignal.set(null);
    this.router.navigateByUrl('/');
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
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
