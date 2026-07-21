import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { landingRedirectGuard } from './core/guards/landing-redirect.guard';

// Lazy-loaded standalone routes keep each feature independent — editing the
// admin module can never accidentally break another feature, and vice versa.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent), canActivate: [landingRedirectGuard] },
  { path: 'home', loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent), canActivate: [authGuard] },
  { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) },
  { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },
  { path: 'auth/google/callback', loadComponent: () => import('./features/auth/google-callback/google-callback.component').then(m => m.GoogleCallbackComponent) },
  { path: 'profile', loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent), canActivate: [authGuard] },
  { path: 'profile/security', loadComponent: () => import('./features/profile/security/security.component').then(m => m.SecurityComponent), canActivate: [authGuard] },
  { path: 'terms', loadComponent: () => import('./features/legal/terms.component').then(m => m.TermsComponent) },
  { path: 'privacy', loadComponent: () => import('./features/legal/privacy.component').then(m => m.PrivacyComponent) },
  {
    path: 'admin', canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: '', loadComponent: () => import('./features/admin/dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent) },
      { path: 'audits', loadComponent: () => import('./features/admin/audits/admin-audits.component').then(m => m.AdminAuditsComponent) },
      { path: 'users', loadComponent: () => import('./features/admin/users/admin-users.component').then(m => m.AdminUsersComponent) },
    ]
  },
  { path: '**', loadComponent: () => import('./features/not-found/not-found.component').then(m => m.NotFoundComponent) }
];
