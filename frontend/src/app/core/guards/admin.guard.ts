import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  // Redirecting with no explanation reads as a broken link, not a deliberate block -
  // the same message errorInterceptor already shows for a 403 from the API.
  inject(ToastService).error("You don't have permission to view that page.");
  router.navigateByUrl('/');
  return false;
};
