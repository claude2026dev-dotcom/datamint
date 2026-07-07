export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  role: 'User' | 'Admin';
  isEmailVerified: boolean;
  freeUploadsUsed: number;
  freeUploadLimit: number;
  hasActiveSubscription: boolean;
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
}

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
  monthlyUploadLimit: number;
  isActive: boolean;
}
