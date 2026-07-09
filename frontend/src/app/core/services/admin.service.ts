import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

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
    isActive?: boolean; sortBy?: string; sortDir?: string;
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

  sendPasswordReset(id: string) {
    return this.http.post<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/admin/users/${id}/send-password-reset`, {});
  }

  getPlans() {
    return this.http.get<{ success: boolean; plans: any[] }>(`${environment.apiBaseUrl}/admin/plans`);
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

  private stripEmpty(obj: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null && v !== '') out[k] = String(v);
    }
    return out;
  }
}
