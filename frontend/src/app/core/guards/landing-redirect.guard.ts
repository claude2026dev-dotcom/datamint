import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/// The root path ('/') is the public marketing page for new/signed-out visitors.
/// A signed-in user landing on it (e.g. clicking the brand logo, or a bookmark to
/// "/") gets sent to their personal dashboard instead - matching how logged-in
/// users of a real app never see its own marketing page again after signing up.
export const landingRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) {
    router.navigateByUrl('/home');
    return false;
  }
  return true;
};
