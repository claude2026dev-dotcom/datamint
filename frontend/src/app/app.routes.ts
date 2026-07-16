import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { landingRedirectGuard } from './core/guards/landing-redirect.guard';

// Lazy-loaded standalone routes keep each feature independent — editing the
// admin module can never accidentally break the upload flow, and vice versa.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent), canActivate: [landingRedirectGuard] },
  { path: 'home', loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent), canActivate: [authGuard] },
  { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) },
  { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },
  { path: 'auth/google/callback', loadComponent: () => import('./features/auth/google-callback/google-callback.component').then(m => m.GoogleCallbackComponent) },
  { path: 'upload', loadComponent: () => import('./features/upload/upload.component').then(m => m.UploadComponent), canActivate: [authGuard] },
  { path: 'field-templates', loadComponent: () => import('./features/field-templates/field-templates.component').then(m => m.FieldTemplatesComponent), canActivate: [authGuard] },
  { path: 'documents', loadComponent: () => import('./features/documents/documents-list.component').then(m => m.DocumentsListComponent), canActivate: [authGuard] },
  { path: 'documents/:id/review', loadComponent: () => import('./features/preview-edit/preview-edit.component').then(m => m.PreviewEditComponent), canActivate: [authGuard] },
  { path: 'documents/batch-review', loadComponent: () => import('./features/batch-review/batch-review.component').then(m => m.BatchReviewComponent), canActivate: [authGuard] },
  { path: 'profile', loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent), canActivate: [authGuard] },
  { path: 'profile/plan', loadComponent: () => import('./features/profile/plan/plan.component').then(m => m.PlanComponent), canActivate: [authGuard] },
  { path: 'profile/security', loadComponent: () => import('./features/profile/security/security.component').then(m => m.SecurityComponent), canActivate: [authGuard] },
  { path: 'plans', loadComponent: () => import('./features/subscription/plans/plans.component').then(m => m.PlansComponent) },
  { path: 'checkout/:planId', loadComponent: () => import('./features/subscription/checkout/checkout.component').then(m => m.CheckoutComponent), canActivate: [authGuard] },
  { path: 'terms', loadComponent: () => import('./features/legal/terms.component').then(m => m.TermsComponent) },
  { path: 'privacy', loadComponent: () => import('./features/legal/privacy.component').then(m => m.PrivacyComponent) },
  {
    path: 'admin', canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: '', loadComponent: () => import('./features/admin/dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent) },
      { path: 'audits', loadComponent: () => import('./features/admin/audits/admin-audits.component').then(m => m.AdminAuditsComponent) },
      { path: 'users', loadComponent: () => import('./features/admin/users/admin-users.component').then(m => m.AdminUsersComponent) },
      { path: 'subscriptions', loadComponent: () => import('./features/admin/subscriptions/admin-subscriptions.component').then(m => m.AdminSubscriptionsComponent) },
    ]
  },
  { path: '**', loadComponent: () => import('./features/not-found/not-found.component').then(m => m.NotFoundComponent) }
];
