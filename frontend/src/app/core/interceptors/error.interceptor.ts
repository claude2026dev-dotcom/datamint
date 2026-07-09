import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';

/// Translates every HTTP failure into a single friendly toast so no feature
/// component has to write its own error-handling boilerplate. Business-rule
/// failures (like FREE_LIMIT_REACHED) still bubble up to the caller via
/// throwError so the upload page can redirect to /plans as required.
///
/// A handful of auth endpoints are deliberately excluded from the blanket
/// handling below because their own component already renders the backend's
/// exact message inline (wrong password, expired reset link, etc.) — letting
/// the interceptor toast the same failure too would show it twice.
const SELF_HANDLED_REQUESTS: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: 'POST', pattern: /\/api\/auth\/(login|register|google|forgot-password|reset-password)$/ },
  { method: 'PUT', pattern: /\/api\/auth\/change-password$/ },
  { method: 'DELETE', pattern: /\/api\/auth\/me$/ },
];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const message = err.error?.message || 'Something went wrong. Please try again.';
      const isSelfHandled = SELF_HANDLED_REQUESTS.some(r => r.method === req.method && r.pattern.test(req.url));

      if (isSelfHandled) {
        // Let the calling component show the real message itself.
      } else if (err.status === 401 && err.error?.errorCode === 'LOGIN_REQUIRED') {
        // A resource that belongs to a signed-in account, viewed while logged
        // out (e.g. a shared document link) - prompt sign-in, not "expired".
        toast.info(message);
        router.navigateByUrl('/login');
      } else if (err.status === 401) {
        toast.error('Your session has expired. Please sign in again.');
        auth.logout();
      } else if (err.status === 402 && (err.error?.errorCode === 'FREE_LIMIT_REACHED' || err.error?.errorCode === 'PLAN_LIMIT_REACHED')) {
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
