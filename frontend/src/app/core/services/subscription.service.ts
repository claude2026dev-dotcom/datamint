import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Plan, SubscriptionStatus } from '../models/models';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  constructor(private http: HttpClient) {}

  getPlans() {
    return this.http.get<{ success: boolean; plans: Plan[] }>(`${environment.apiBaseUrl}/subscription/plans`);
  }

  getStatus() {
    return this.http.get<{ success: boolean; status: SubscriptionStatus }>(`${environment.apiBaseUrl}/subscription/status`);
  }

  activateFreePlan(planId: string) {
    return this.http.post<{ success: boolean; message: string }>(
      `${environment.apiBaseUrl}/subscription/activate-free`, { planId });
  }

  createOrder(planId: string) {
    return this.http.post<{ success: boolean; order: { orderId: string; amount: number; currency: string; keyId: string; provider: string } }>(
      `${environment.apiBaseUrl}/subscription/checkout/create-order`, { planId });
  }

  verifyPayment(payload: { planId: string; providerOrderId: string; providerPaymentId: string; providerSignature: string }) {
    return this.http.post<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/subscription/checkout/verify`, payload);
  }

  cancelSubscription() {
    return this.http.post<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/subscription/cancel`, {});
  }
}
