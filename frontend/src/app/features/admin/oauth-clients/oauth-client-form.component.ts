import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { LoadingHintComponent } from '../../../shared/components/loading-hint/loading-hint.component';
import { OAuthClientDetail, OAuthClientSecretReveal, OAuthScope } from '../../../core/models/models';

interface GrantOption { value: string; label: string; hint: string; }

const GRANT_OPTIONS: GrantOption[] = [
  { value: 'authorization_code', label: 'Authorization Code', hint: 'A person logs in and authorizes this app - the standard flow for anything with a UI.' },
  { value: 'refresh_token', label: 'Refresh Token', hint: 'Lets a token be renewed without logging in again. Only useful alongside Authorization Code.' },
  { value: 'client_credentials', label: 'Client Credentials', hint: 'Service-to-service access with no user involved. Requires a confidential client.' }
];

@Component({
  selector: 'app-oauth-client-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent, LoadingHintComponent],
  template: `
    <div class="dm-container page">
      <app-back-button fallbackUrl="/admin/oauth-clients" />
      <h1>{{ isEdit ? 'Edit OAuth client' : 'New OAuth client' }}</h1>

      @if (loading) {
        <div class="dm-card section skeleton-block">
          <div class="skeleton-line" style="width: 30%; height: 18px;"></div>
          <div class="skeleton-line" style="width: 100%; height: 38px;"></div>
          <div class="skeleton-line" style="width: 100%; height: 38px;"></div>
        </div>
        <app-loading-hint [loading]="loading" />
      } @else if (loadError) {
        <div class="dm-card error-banner">
          <p>{{ loadError }}</p>
          <button class="dm-btn dm-btn-ghost" (click)="load()">Retry</button>
        </div>
      } @else {

        @if (revealedSecret) {
          <div class="dm-card secret-reveal">
            <div class="secret-head"><app-icon name="shield" [size]="17" /><strong>Client secret — copy it now</strong></div>
            <p class="muted">This is shown once and can't be retrieved again. If you lose it, regenerate a new one.</p>
            <div class="secret-value">
              <code>{{ revealedSecret.clientSecret }}</code>
              <button class="dm-btn dm-btn-ghost tiny" (click)="copy(revealedSecret.clientSecret)">Copy</button>
            </div>
          </div>
        }

        <div class="dm-card section">
          <h3>Basic info</h3>
          @if (isEdit && client) {
            <div class="field">
              <label>Client ID</label>
              <div class="client-id-row">
                <code class="client-id" (click)="copy(client.clientId)" title="Click to copy">{{ client.clientId }}</code>
                <button class="dm-btn dm-btn-ghost tiny" type="button" (click)="copy(client.clientId)">Copy</button>
              </div>
              <p class="hint">The identifier this client sends as <code>client_id</code> in OAuth requests.</p>
            </div>
          }
          <div class="field">
            <label>Name</label>
            <input class="dm-input" [(ngModel)]="form.name" placeholder="e.g. Internal Reporting Tool" />
          </div>
          <div class="field">
            <label>Logo URL <span class="optional">(optional)</span></label>
            <div class="logo-row">
              <span class="logo-preview">
                @if (form.logoUrl) { <img [src]="form.logoUrl" alt="" (error)="logoBroken = true" (load)="logoBroken = false" /> }
                @else { {{ (form.name || '?').slice(0,2).toUpperCase() }} }
              </span>
              <input class="dm-input" [(ngModel)]="form.logoUrl" placeholder="https://example.com/logo.png" />
            </div>
            <p class="hint">Shown on the sign-in page when someone authorizes this client.</p>
          </div>
        </div>

        <div class="dm-card section">
          <h3>Client type</h3>
          <div class="radio-row">
            <label class="radio-option" [class.disabled]="isEdit">
              <input type="radio" name="confidential" [value]="false" [(ngModel)]="form.isConfidential" [disabled]="isEdit" />
              <div><strong>Public</strong><span>Browser-based or native apps that can't safely keep a secret. Authenticates via PKCE only.</span></div>
            </label>
            <label class="radio-option" [class.disabled]="isEdit">
              <input type="radio" name="confidential" [value]="true" [(ngModel)]="form.isConfidential" [disabled]="isEdit" />
              <div><strong>Confidential</strong><span>A trusted server that can hold a secret. Required for the Client Credentials grant.</span></div>
            </label>
          </div>
          @if (isEdit) { <p class="hint">Client type can't change after creation - create a new client instead.</p> }

          <label class="checkbox-row">
            <input type="checkbox" [(ngModel)]="form.requireConsent" />
            <span><strong>Require consent</strong> — show an Allow/Deny screen listing requested scopes before authorizing. Turn off only for your own first-party tools.</span>
          </label>
        </div>

        <div class="dm-card section">
          <h3>Redirect URIs</h3>
          <p class="hint-block">Where a browser is sent back to after authorizing. Must match exactly - no wildcards.</p>
          @for (uri of form.redirectUris; track $index; let i = $index) {
            <div class="uri-row">
              <input class="dm-input" [(ngModel)]="form.redirectUris[i]" placeholder="https://yourapp.com/callback" />
              <button class="icon-btn danger" type="button" title="Remove" (click)="removeRedirectUri(i)"><app-icon name="close" [size]="16" /></button>
            </div>
          }
          <button class="dm-btn dm-btn-ghost tiny" type="button" (click)="addRedirectUri()">+ Add redirect URI</button>
        </div>

        <div class="dm-card section">
          <h3>Grant types</h3>
          @for (g of grantOptions; track g.value) {
            <label class="checkbox-row" [class.disabled]="g.value === 'client_credentials' && !form.isConfidential">
              <input type="checkbox" [checked]="hasGrant(g.value)" [disabled]="g.value === 'client_credentials' && !form.isConfidential"
                     (change)="toggleGrant(g.value)" />
              <span><strong>{{ g.label }}</strong><span class="grant-hint">{{ g.hint }}</span></span>
            </label>
          }
        </div>

        <div class="dm-card section">
          <h3>Scopes</h3>
          @if (scopes.length === 0) {
            <p class="hint">No scopes exist yet. <a routerLink="/admin/scopes">Create one</a> first.</p>
          } @else {
            <div class="scope-grid">
              @for (s of scopes; track s.id) {
                <label class="checkbox-row">
                  <input type="checkbox" [checked]="hasScope(s.name)" (change)="toggleScope(s.name)" />
                  <span><strong>{{ s.displayName }}</strong><span class="grant-hint">{{ s.name }}</span></span>
                </label>
              }
            </div>
          }
        </div>

        <div class="dm-card section">
          <h3>Token lifetimes</h3>
          <div class="lifetime-row">
            <div class="field">
              <label>Access token (minutes)</label>
              <input class="dm-input" type="number" min="1" max="60" [(ngModel)]="form.accessTokenLifetimeMinutes" />
            </div>
            @if (hasGrant('refresh_token')) {
              <div class="field">
                <label>Refresh token (days)</label>
                <input class="dm-input" type="number" min="1" max="90" [(ngModel)]="form.refreshTokenLifetimeDays" />
              </div>
            }
          </div>
        </div>

        @if (isEdit && client?.isConfidential) {
          <div class="dm-card section">
            <h3>Secret</h3>
            <p class="hint-block">Regenerating immediately invalidates the current secret - any service using it will need the new one.</p>
            <button class="dm-btn dm-btn-ghost" type="button" [disabled]="regenerating" (click)="regenerateSecret()">
              {{ regenerating ? 'Regenerating…' : 'Regenerate secret' }}
            </button>
          </div>
        }

        <div class="form-footer">
          <a routerLink="/admin/oauth-clients" class="dm-btn dm-btn-ghost">Cancel</a>
          <button class="dm-btn dm-btn-primary" [disabled]="saving || !canSave()" (click)="save()">
            {{ saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create client') }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; max-width: 680px; }
    h1 { font-size: 1.6rem; margin-bottom: 24px; }
    .section { padding: 24px; margin-bottom: 18px; }
    .section h3 { font-size: 1rem; margin-bottom: 16px; }
    .field { margin-bottom: 16px; }
    .field:last-child { margin-bottom: 0; }
    .field label { display: block; font-size: 0.82rem; color: var(--dm-text-muted); margin-bottom: 6px; }
    .optional { font-weight: 400; color: var(--dm-text-muted); }
    .hint { font-size: 0.76rem; color: var(--dm-text-muted); margin: 6px 0 0; }
    .hint-block { font-size: 0.82rem; color: var(--dm-text-muted); margin: -4px 0 16px; }
    .muted { color: var(--dm-text-muted); font-size: 0.88rem; }

    .client-id-row { display: flex; align-items: center; gap: 8px; }
    .client-id { flex: 1; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.82rem; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); border-radius: 8px; padding: 10px 12px; cursor: pointer; word-break: break-all; }
    .client-id:hover { border-color: var(--dm-primary); }

    .logo-row { display: flex; align-items: center; gap: 12px; }
    .logo-preview { width: 44px; height: 44px; border-radius: 8px; background: var(--dm-gradient-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0; overflow: hidden; }
    .logo-preview img { width: 100%; height: 100%; object-fit: contain; }

    .radio-row { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
    .radio-option { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid var(--dm-border); border-radius: var(--dm-radius-sm); cursor: pointer; }
    .radio-option:hover { border-color: var(--dm-primary); }
    .radio-option.disabled { opacity: 0.6; cursor: not-allowed; }
    .radio-option input { margin-top: 3px; accent-color: var(--dm-primary); }
    .radio-option div { display: flex; flex-direction: column; gap: 2px; }
    .radio-option span { font-size: 0.8rem; color: var(--dm-text-muted); }

    .checkbox-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; cursor: pointer; }
    .checkbox-row.disabled { opacity: 0.5; cursor: not-allowed; }
    .checkbox-row input { margin-top: 3px; accent-color: var(--dm-primary); flex-shrink: 0; }
    .checkbox-row span { display: flex; flex-direction: column; gap: 2px; font-size: 0.88rem; }
    .grant-hint { font-size: 0.78rem; color: var(--dm-text-muted); font-weight: 400; }
    .scope-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px 16px; }

    .uri-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .uri-row .dm-input { flex: 1; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; background: none; border: 1px solid var(--dm-border); border-radius: 8px; cursor: pointer; color: var(--dm-text-muted); flex-shrink: 0; }
    .icon-btn.danger:hover { color: var(--dm-danger); border-color: var(--dm-danger); background: rgba(248,113,113,0.1); }
    .tiny { padding: 8px 12px; font-size: 0.8rem; }

    .lifetime-row { display: flex; gap: 16px; flex-wrap: wrap; }
    .lifetime-row .field { flex: 1 1 160px; margin-bottom: 0; }

    .form-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }

    .secret-reveal { padding: 20px; margin-bottom: 18px; border-color: var(--dm-warning); }
    .secret-head { display: flex; align-items: center; gap: 8px; color: var(--dm-warning); margin-bottom: 6px; }
    .secret-value { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 12px; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); border-radius: 8px; }
    .secret-value code { flex: 1; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.82rem; word-break: break-all; }

    .error-banner { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-color: var(--dm-danger); }
    .error-banner p { margin: 0; color: var(--dm-danger); font-size: 0.9rem; }
    .skeleton-block { display: flex; flex-direction: column; gap: 14px; }
    .skeleton-line { background: linear-gradient(90deg, var(--dm-surface) 25%, var(--dm-surface-hover) 50%, var(--dm-surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; border-radius: 6px; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    @media (max-width: 480px) {
      .form-footer { flex-direction: column-reverse; }
      .form-footer .dm-btn { width: 100%; }
      .logo-row { flex-direction: column; align-items: stretch; }
    }
  `]
})
export class OAuthClientFormComponent implements OnInit {
  isEdit = false;
  clientDbId = '';
  client: OAuthClientDetail | null = null;

  loading = true;
  loadError = '';
  saving = false;
  regenerating = false;
  logoBroken = false;
  revealedSecret: OAuthClientSecretReveal | null = null;

  scopes: OAuthScope[] = [];
  grantOptions = GRANT_OPTIONS;

  form = {
    name: '',
    logoUrl: '' as string | null,
    isConfidential: false,
    requireConsent: true,
    redirectUris: [''] as string[],
    grantTypes: ['authorization_code'] as string[],
    scopeNames: [] as string[],
    accessTokenLifetimeMinutes: 30,
    refreshTokenLifetimeDays: 30
  };

  constructor(
    private adminService: AdminService,
    private route: ActivatedRoute,
    private router: Router,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService
  ) {}

  ngOnInit() {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!idParam && idParam !== 'new';
    this.clientDbId = idParam ?? '';
    this.load();
  }

  load() {
    this.loading = true;
    this.loadError = '';

    this.adminService.getOAuthScopes({ pageSize: 100, isEnabled: true }).subscribe({
      next: res => { this.scopes = res.items; },
      error: () => { /* non-fatal - the scopes section just shows empty */ }
    });

    if (!this.isEdit) {
      this.loading = false;
      return;
    }

    this.adminService.getOAuthClient(this.clientDbId).subscribe({
      next: res => {
        this.client = res.client;
        this.form = {
          name: res.client.name,
          logoUrl: res.client.logoUrl ?? '',
          isConfidential: res.client.isConfidential,
          requireConsent: res.client.requireConsent,
          redirectUris: res.client.redirectUris.length ? [...res.client.redirectUris] : [''],
          grantTypes: [...res.client.grantTypes],
          scopeNames: [...res.client.scopeNames],
          accessTokenLifetimeMinutes: res.client.accessTokenLifetimeMinutes,
          refreshTokenLifetimeDays: res.client.refreshTokenLifetimeDays
        };
        this.loading = false;
      },
      error: () => { this.loading = false; this.loadError = 'Could not load this OAuth client. Please try again.'; }
    });
  }

  hasGrant(g: string) { return this.form.grantTypes.includes(g); }
  toggleGrant(g: string) {
    this.form.grantTypes = this.hasGrant(g) ? this.form.grantTypes.filter(x => x !== g) : [...this.form.grantTypes, g];
  }

  hasScope(name: string) { return this.form.scopeNames.includes(name); }
  toggleScope(name: string) {
    this.form.scopeNames = this.hasScope(name) ? this.form.scopeNames.filter(x => x !== name) : [...this.form.scopeNames, name];
  }

  addRedirectUri() { this.form.redirectUris.push(''); }
  removeRedirectUri(i: number) { this.form.redirectUris.splice(i, 1); }

  canSave(): boolean {
    return this.form.name.trim().length > 0 && this.form.grantTypes.length > 0;
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => this.toast.success('Copied to clipboard.'));
  }

  save() {
    if (!this.canSave()) return;
    this.saving = true;
    const redirectUris = this.form.redirectUris.map(u => u.trim()).filter(u => u.length > 0);

    if (this.isEdit) {
      this.adminService.updateOAuthClient(this.clientDbId, {
        name: this.form.name.trim(),
        logoUrl: this.form.logoUrl?.trim() || null,
        requireConsent: this.form.requireConsent,
        redirectUris,
        grantTypes: this.form.grantTypes,
        scopeNames: this.form.scopeNames,
        accessTokenLifetimeMinutes: this.form.accessTokenLifetimeMinutes,
        refreshTokenLifetimeDays: this.form.refreshTokenLifetimeDays
      }).subscribe({
        next: () => { this.saving = false; this.toast.success('Client updated.'); this.router.navigateByUrl('/admin/oauth-clients'); },
        error: err => { this.saving = false; this.toast.error(err?.error?.message || 'Could not save changes.'); }
      });
    } else {
      this.adminService.createOAuthClient({
        name: this.form.name.trim(),
        logoUrl: this.form.logoUrl?.trim() || null,
        isConfidential: this.form.isConfidential,
        requireConsent: this.form.requireConsent,
        redirectUris,
        grantTypes: this.form.grantTypes,
        scopeNames: this.form.scopeNames,
        accessTokenLifetimeMinutes: this.form.accessTokenLifetimeMinutes,
        refreshTokenLifetimeDays: this.form.refreshTokenLifetimeDays
      }).subscribe({
        next: res => {
          this.saving = false;
          this.toast.success('OAuth client created.');
          if (res.secret) {
            // Stay on the page so the one-time secret is visible; switch into edit mode in place.
            this.isEdit = true;
            this.clientDbId = res.client.id;
            this.client = res.client;
            this.revealedSecret = res.secret;
            this.router.navigate(['/admin/oauth-clients', res.client.id], { replaceUrl: true });
          } else {
            this.router.navigateByUrl('/admin/oauth-clients');
          }
        },
        error: err => { this.saving = false; this.toast.error(err?.error?.message || 'Could not create that client.'); }
      });
    }
  }

  async regenerateSecret() {
    const confirmed = await this.confirmDialog.ask({
      title: 'Regenerate this client\'s secret?',
      message: 'The current secret stops working immediately. Any service using it will need the new one.',
      confirmLabel: 'Regenerate',
      danger: true
    });
    if (!confirmed) return;

    this.regenerating = true;
    this.adminService.regenerateOAuthClientSecret(this.clientDbId).subscribe({
      next: res => { this.regenerating = false; this.revealedSecret = res.secret; this.toast.success('Secret regenerated.'); },
      error: () => { this.regenerating = false; this.toast.error('Could not regenerate the secret. Please try again.'); }
    });
  }
}
