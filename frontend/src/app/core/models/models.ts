export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  role: 'User' | 'Admin';
  isEmailVerified: boolean;
  hasActiveSubscription: boolean;
  isSuperAdmin: boolean;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  user: UserProfile;
}

export interface DocumentSummary {
  id: string;
  originalFileName: string;
  pageCount: number;
  requiresOcr: boolean;
  status: 'Uploaded' | 'Processing' | 'Extracted' | 'Reviewed' | 'Exported' | 'Failed';
  createdAtUtc: string;
  failureReason?: string;
  fileSizeBytes: number;
  uploadBatchId: string;
}

export type BatchExportMode = 'SingleSheet' | 'MultipleSheets' | 'SeparateFiles';

export interface ExtractedFieldEdit {
  id: string;
  fieldKey: string;
  originalFieldKey: string;
  fieldValue: string | null;
  pageNumber: number | null;
  wasEditedByUser: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  billingCycle: 'Monthly' | 'Yearly';
  monthlyPageLimit: number;
  isRecurring: boolean;
  isActive: boolean;
  isFreeTrial: boolean;
}

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  planId?: string;
  planName?: string;
  price?: number;
  currency?: string;
  billingCycle?: 'Monthly' | 'Yearly';
  status?: 'Active' | 'Cancelled' | 'PastDue' | 'Expired';
  startAtUtc?: string;
  endAtUtc?: string;
  pagesUsedThisCycle: number;
  monthlyPageLimit: number;
  isRecurring: boolean;
  cancelAtPeriodEnd: boolean;
}
