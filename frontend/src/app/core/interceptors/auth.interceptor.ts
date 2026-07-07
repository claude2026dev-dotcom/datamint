import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const AUTH_ENDPOINT_PATTERN = /\/api\/auth\/(login|register|google|refresh|logout)$/;

/// Attaches the JWT to every outgoing API call automatically — no controller
/// or component ever needs to remember to add the header itself. Also
/// transparently retries a request once via a silent refresh-token exchange
/// if the access token turned out to be expired, so a user with "remember me"
/// on doesn't get bounced to /login every ~30 minutes.
///
/// Must run "closer to the backend" than errorInterceptor (see main.ts
/// provider order) so it sees a raw 401 and gets a chance to recover BEFORE
/// errorInterceptor's blanket "session expired, log out" handling fires.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getAccessToken();
  const authReq = token && req.url.includes('/api/') ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      const isAuthEndpoint = AUTH_ENDPOINT_PATTERN.test(req.url);
      if (err instanceof HttpErrorResponse && err.status === 401 && !isAuthEndpoint && auth.getRefreshToken()) {
        return auth.refreshAccessToken().pipe(
          switchMap(() => {
            const retried = req.clone({ setHeaders: { Authorization: `Bearer ${auth.getAccessToken()}` } });
            return next(retried);
          }),
          // Refresh itself failed (token expired/revoked) - fall through to the
          // original error so errorInterceptor's session-expired handling runs.
          catchError(() => throwError(() => err))
        );
      }
      return throwError(() => err);
    })
  );
};
