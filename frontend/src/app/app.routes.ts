import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

// Lazy-loaded standalone routes keep each feature independent — editing the
// admin module can never accidentally break the upload flow, and vice versa.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent) },
  { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) },
  { path: 'auth/google/callback', loadComponent: () => import('./features/auth/google-callback/google-callback.component').then(m => m.GoogleCallbackComponent) },
  { path: 'upload', loadComponent: () => import('./features/upload/upload.component').then(m => m.UploadComponent) },
  // No authGuard: anonymous users must be able to review/export their free-tier
  // uploads before signing in. The backend still enforces per-document ownership
  // for documents that belong to a logged-in user.
  { path: 'documents/:id/review', loadComponent: () => import('./features/preview-edit/preview-edit.component').then(m => m.PreviewEditComponent) },
  { path: 'plans', loadComponent: () => import('./features/subscription/plans/plans.component').then(m => m.PlansComponent) },
  { path: 'checkout/:planId', loadComponent: () => import('./features/subscription/checkout/checkout.component').then(m => m.CheckoutComponent), canActivate: [authGuard] },
  { path: 'terms', loadComponent: () => import('./features/legal/terms.component').then(m => m.TermsComponent) },
  { path: 'privacy', loadComponent: () => import('./features/legal/privacy.component').then(m => m.PrivacyComponent) },
  {
    path: 'admin', canActivate: [authGuard, adminGuard],
    children: [
      { path: '', loadComponent: () => import('./features/admin/dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent) },
      { path: 'audits', loadComponent: () => import('./features/admin/audits/admin-audits.component').then(m => m.AdminAuditsComponent) },
      { path: 'users', loadComponent: () => import('./features/admin/users/admin-users.component').then(m => m.AdminUsersComponent) },
      { path: 'subscriptions', loadComponent: () => import('./features/admin/subscriptions/admin-subscriptions.component').then(m => m.AdminSubscriptionsComponent) },
    ]
  },
  { path: '**', redirectTo: '' }
];
