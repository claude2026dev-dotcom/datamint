import { HttpInterceptorFn } from '@angular/common/http';
import { timeout } from 'rxjs';

/// Angular's HttpClient has no default timeout - a request whose underlying TCP
/// connection went stale (the common case: laptop slept, or a tab sat backgrounded
/// for hours) just hangs forever with no response, no error, nothing for
/// errorInterceptor or a component's own `error` handler to ever catch. That's what
/// produced the "comes back after a long time, page spins forever, only a hard
/// reload fixes it" symptom - the request wasn't failing, it was never finishing at
/// all. Registered LAST in main.ts's interceptor list so it wraps every real
/// outgoing call closest to the backend, including authInterceptor's silent-refresh
/// retry and the /auth/refresh call itself - any of those can be the one stuck on a
/// dead connection, not just the original request.
///
/// Upload (and its pre-upload page-count peek) are exempt from the short default -
/// document processing runs synchronously on the request thread server-side (see
/// CLAUDE.md) and a large multi-page batch can legitimately take minutes, not
/// seconds. They still get a generous ceiling rather than no timeout at all, so a
/// genuinely stuck connection eventually surfaces as a normal, recoverable error
/// instead of hanging forever.
const LONG_RUNNING_PATTERN = /\/api\/documents\/(upload|peek)$/;

const DEFAULT_TIMEOUT_MS = 30_000;
const LONG_RUNNING_TIMEOUT_MS = 10 * 60_000;

export const timeoutInterceptor: HttpInterceptorFn = (req, next) => {
  const ms = LONG_RUNNING_PATTERN.test(req.url) ? LONG_RUNNING_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  return next(req).pipe(timeout(ms));
};
