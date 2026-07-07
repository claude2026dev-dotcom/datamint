import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getDashboardStats() {
    return this.http.get<{ success: boolean; stats: any }>(`${environment.apiBaseUrl}/admin/dashboard`);
  }

  getAuditLogs(params: { page?: number; pageSize?: number; action?: string } = {}) {
    return this.http.get<{ success: boolean; items: any[]; total: number }>(`${environment.apiBaseUrl}/admin/audit-logs`, { params: params as any });
  }

  getUsers(page = 1, pageSize = 25) {
    return this.http.get<{ success: boolean; items: any[]; total: number }>(`${environment.apiBaseUrl}/admin/users`, { params: { page, pageSize } as any });
  }

  toggleUserActive(id: string) {
    return this.http.put<{ success: boolean; isActive: boolean }>(`${environment.apiBaseUrl}/admin/users/${id}/toggle-active`, {});
  }

  getPlans() {
    return this.http.get<{ success: boolean; plans: any[] }>(`${environment.apiBaseUrl}/admin/plans`);
  }

  createPlan(payload: any) {
    return this.http.post<{ success: boolean; plan: any }>(`${environment.apiBaseUrl}/admin/plans`, payload);
  }

  togglePlanActive(id: string) {
    return this.http.put<{ success: boolean; isActive: boolean }>(`${environment.apiBaseUrl}/admin/plans/${id}/toggle-active`, {});
  }
}
