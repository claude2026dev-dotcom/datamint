import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';

/// Translates every HTTP failure into a single friendly toast so no feature
/// component has to write its own error-handling boilerplate. Business-rule
/// failures (like PLAN_LIMIT_REACHED) still bubble up to the caller via
/// throwError so the upload page can redirect to /plans as required.
///
/// A handful of auth endpoints are deliberately excluded from the blanket
/// handling below because their own component already renders the backend's
/// exact message inline (wrong password, expired reset link, etc.) — letting
/// the interceptor toast the same failure too would show it twice. Where
/// `statuses` is omitted, every status from that endpoint is self-handled;
/// where given, only those statuses are (e.g. a document-detail 404 is shown
/// inline by the page, but its 401 LOGIN_REQUIRED still needs the interceptor's
/// redirect-to-login, so it isn't listed here).
const SELF_HANDLED_REQUESTS: ReadonlyArray<{ method: string; pattern: RegExp; statuses?: number[] }> = [
  { method: 'POST', pattern: /\/api\/auth\/(login|register|google|forgot-password|reset-password)$/ },
  { method: 'PUT', pattern: /\/api\/auth\/change-password$/ },
  { method: 'DELETE', pattern: /\/api\/auth\/me$/ },
  { method: 'GET', pattern: /\/api\/documents\/[^/]+$/, statuses: [404] },
];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const message = err.error?.message || 'Something went wrong. Please try again.';
      const isSelfHandled = SELF_HANDLED_REQUESTS.some(r =>
        r.method === req.method && r.pattern.test(req.url) && (!r.statuses || r.statuses.includes(err.status)));

      if (isSelfHandled) {
        // Let the calling component show the real message itself.
      } else if (err.status === 401 && err.error?.errorCode === 'LOGIN_REQUIRED') {
        // A resource that requires sign-in, hit while logged out (a shared
        // document link, or the upload page itself) - prompt sign-in, not
        // "expired", and bring them straight back here afterward.
        toast.info(message);
        router.navigateByUrl(`/login?returnUrl=${encodeURIComponent(router.url)}`);
      } else if (err.status === 401) {
        toast.error('Your session has expired. Please sign in again.');
        auth.logout();
      } else if (err.status === 402 && err.error?.errorCode === 'PLAN_LIMIT_REACHED') {
        toast.info(message);
        router.navigateByUrl(err.error?.redirectTo || '/plans');
      } else if (err.status === 403) {
        toast.error("You don't have permission to do that.");
      } else {
        toast.error(message);
      }
      return throwError(() => err);
    })
  );
};
