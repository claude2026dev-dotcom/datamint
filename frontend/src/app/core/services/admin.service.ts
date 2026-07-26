import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ExtractionTier, OAuthClientDetail, OAuthClientListItem, OAuthClientSecretReveal, OAuthScope, RoleTierOverride } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getDashboardStats() {
    return this.http.get<{ success: boolean; stats: any }>(`${environment.apiBaseUrl}/admin/dashboard`);
  }

  getAuditLogs(params: {
    page?: number; pageSize?: number; action?: string; userEmail?: string;
    isSuccess?: boolean; fromUtc?: string; toUtc?: string; sortDir?: string;
  } = {}) {
    const cleaned = this.stripEmpty(params);
    return this.http.get<{ success: boolean; items: any[]; total: number; page: number; pageSize: number }>(
      `${environment.apiBaseUrl}/admin/audit-logs`, { params: cleaned }
    );
  }

  getUsers(params: {
    page?: number; pageSize?: number; search?: string; role?: string;
    isActive?: boolean; sortBy?: string; sortDir?: string; includeDeactivated?: boolean;
  } = {}) {
    const cleaned = this.stripEmpty(params);
    return this.http.get<{ success: boolean; items: any[]; total: number; page: number; pageSize: number }>(
      `${environment.apiBaseUrl}/admin/users`, { params: cleaned }
    );
  }

  toggleUserActive(id: string) {
    return this.http.put<{ success: boolean; isActive: boolean }>(`${environment.apiBaseUrl}/admin/users/${id}/toggle-active`, {});
  }

  updateUser(id: string, payload: { displayName?: string; role?: string }) {
    return this.http.put<{ success: boolean; user: any }>(`${environment.apiBaseUrl}/admin/users/${id}`, payload);
  }

  deleteUser(id: string) {
    return this.http.delete<{ success: boolean }>(`${environment.apiBaseUrl}/admin/users/${id}`);
  }

  reactivateUser(id: string) {
    return this.http.put<{ success: boolean }>(`${environment.apiBaseUrl}/admin/users/${id}/reactivate`, {});
  }

  sendPasswordReset(id: string) {
    return this.http.post<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/admin/users/${id}/send-password-reset`, {});
  }

  getPlans() {
    return this.http.get<{ success: boolean; items: any[]; total: number; page: number; pageSize: number }>(`${environment.apiBaseUrl}/admin/plans`);
  }

  createPlan(payload: any) {
    return this.http.post<{ success: boolean; plan: any }>(`${environment.apiBaseUrl}/admin/plans`, payload);
  }

  updatePlan(id: string, payload: any) {
    return this.http.put<{ success: boolean; plan: any }>(`${environment.apiBaseUrl}/admin/plans/${id}`, payload);
  }

  deletePlan(id: string) {
    return this.http.delete<{ success: boolean }>(`${environment.apiBaseUrl}/admin/plans/${id}`);
  }

  togglePlanActive(id: string) {
    return this.http.put<{ success: boolean; isActive: boolean }>(`${environment.apiBaseUrl}/admin/plans/${id}/toggle-active`, {});
  }

  getTransactions(params: { page?: number; pageSize?: number; status?: string } = {}) {
    const cleaned = this.stripEmpty(params);
    return this.http.get<{ success: boolean; items: any[]; total: number; page: number; pageSize: number }>(
      `${environment.apiBaseUrl}/admin/transactions`, { params: cleaned }
    );
  }

  refundTransaction(id: string, reason?: string) {
    return this.http.post<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/admin/transactions/${id}/refund`, { reason });
  }

  // ---------- Extraction Tiers ----------

  getExtractionTiers(params: { page?: number; pageSize?: number; search?: string; isEnabled?: boolean } = {}) {
    const cleaned = this.stripEmpty(params);
    return this.http.get<{ success: boolean; items: ExtractionTier[]; total: number; page: number; pageSize: number }>(
      `${environment.apiBaseUrl}/admin/extraction-tiers`, { params: cleaned }
    );
  }

  createExtractionTier(payload: { name: string; aiProvider: string; modelName: string; customOutputFormatExample?: string | null; customInstructions?: string | null }) {
    return this.http.post<{ success: boolean; tier: ExtractionTier }>(`${environment.apiBaseUrl}/admin/extraction-tiers`, payload);
  }

  updateExtractionTier(id: string, payload: { name: string; aiProvider: string; modelName: string; customOutputFormatExample?: string | null; customInstructions?: string | null }) {
    return this.http.put<{ success: boolean }>(`${environment.apiBaseUrl}/admin/extraction-tiers/${id}`, payload);
  }

  deleteExtractionTier(id: string) {
    return this.http.delete<{ success: boolean }>(`${environment.apiBaseUrl}/admin/extraction-tiers/${id}`);
  }

  toggleExtractionTierActive(id: string) {
    return this.http.put<{ success: boolean; isEnabled: boolean }>(`${environment.apiBaseUrl}/admin/extraction-tiers/${id}/toggle-active`, {});
  }

  // ---------- Role Extraction Tier Overrides ----------

  getRoleTierOverrides() {
    return this.http.get<{ success: boolean; items: RoleTierOverride[] }>(`${environment.apiBaseUrl}/admin/role-tier-overrides`);
  }

  updateRoleTierOverride(role: string, extractionTierId: string | null) {
    return this.http.put<{ success: boolean }>(`${environment.apiBaseUrl}/admin/role-tier-overrides/${role}`, { extractionTierId });
  }

  // ---------- OAuth Clients ----------

  getOAuthClients(params: {
    page?: number; pageSize?: number; search?: string; grantType?: string;
    isEnabled?: boolean; sortBy?: string; sortDir?: string;
  } = {}) {
    const cleaned = this.stripEmpty(params);
    return this.http.get<{ success: boolean; items: OAuthClientListItem[]; total: number; page: number; pageSize: number }>(
      `${environment.apiBaseUrl}/admin/oauth/clients`, { params: cleaned }
    );
  }

  getOAuthClient(id: string) {
    return this.http.get<{ success: boolean; client: OAuthClientDetail }>(`${environment.apiBaseUrl}/admin/oauth/clients/${id}`);
  }

  createOAuthClient(payload: {
    name: string; logoUrl?: string | null; isConfidential: boolean; requireConsent: boolean;
    redirectUris: string[]; grantTypes: string[]; scopeNames: string[];
    accessTokenLifetimeMinutes: number; refreshTokenLifetimeDays: number;
  }) {
    return this.http.post<{ success: boolean; client: OAuthClientDetail; secret: OAuthClientSecretReveal | null }>(
      `${environment.apiBaseUrl}/admin/oauth/clients`, payload
    );
  }

  updateOAuthClient(id: string, payload: {
    name: string; logoUrl?: string | null; requireConsent: boolean; redirectUris: string[];
    grantTypes: string[]; scopeNames: string[]; accessTokenLifetimeMinutes: number; refreshTokenLifetimeDays: number;
  }) {
    return this.http.put<{ success: boolean; client: OAuthClientDetail }>(`${environment.apiBaseUrl}/admin/oauth/clients/${id}`, payload);
  }

  deleteOAuthClient(id: string) {
    return this.http.delete<{ success: boolean }>(`${environment.apiBaseUrl}/admin/oauth/clients/${id}`);
  }

  toggleOAuthClientActive(id: string) {
    return this.http.put<{ success: boolean; isEnabled: boolean }>(`${environment.apiBaseUrl}/admin/oauth/clients/${id}/toggle-active`, {});
  }

  regenerateOAuthClientSecret(id: string) {
    return this.http.post<{ success: boolean; secret: OAuthClientSecretReveal }>(`${environment.apiBaseUrl}/admin/oauth/clients/${id}/regenerate-secret`, {});
  }

  // ---------- OAuth Scopes ----------

  getOAuthScopes(params: { page?: number; pageSize?: number; search?: string; isEnabled?: boolean } = {}) {
    const cleaned = this.stripEmpty(params);
    return this.http.get<{ success: boolean; items: OAuthScope[]; total: number; page: number; pageSize: number }>(
      `${environment.apiBaseUrl}/admin/oauth/scopes`, { params: cleaned }
    );
  }

  createOAuthScope(payload: { name: string; displayName: string; description?: string; isDefault: boolean }) {
    return this.http.post<{ success: boolean; scope: OAuthScope }>(`${environment.apiBaseUrl}/admin/oauth/scopes`, payload);
  }

  updateOAuthScope(id: string, payload: { displayName: string; description?: string; isDefault: boolean }) {
    return this.http.put<{ success: boolean }>(`${environment.apiBaseUrl}/admin/oauth/scopes/${id}`, payload);
  }

  deleteOAuthScope(id: string) {
    return this.http.delete<{ success: boolean }>(`${environment.apiBaseUrl}/admin/oauth/scopes/${id}`);
  }

  toggleOAuthScopeActive(id: string) {
    return this.http.put<{ success: boolean; isEnabled: boolean }>(`${environment.apiBaseUrl}/admin/oauth/scopes/${id}/toggle-active`, {});
  }

  private stripEmpty(obj: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null && v !== '') out[k] = String(v);
    }
    return out;
  }
}
