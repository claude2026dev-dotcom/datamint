export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  role: 'User' | 'Admin';
  isEmailVerified: boolean;
  isSuperAdmin: boolean;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  user: UserProfile;
}

export type OAuthGrantType = 'authorization_code' | 'client_credentials' | 'refresh_token';

export interface OAuthClientListItem {
  id: string;
  clientId: string;
  name: string;
  logoUrl?: string | null;
  isConfidential: boolean;
  isEnabled: boolean;
  grantTypes: OAuthGrantType[];
  redirectUriCount: number;
  createdAtUtc: string;
  createdByEmail?: string | null;
}

export interface OAuthClientDetail {
  id: string;
  clientId: string;
  name: string;
  logoUrl?: string | null;
  isConfidential: boolean;
  requireConsent: boolean;
  isEnabled: boolean;
  grantTypes: OAuthGrantType[];
  redirectUris: string[];
  scopeNames: string[];
  accessTokenLifetimeMinutes: number;
  refreshTokenLifetimeDays: number;
  createdAtUtc: string;
  createdByEmail?: string | null;
}

export interface OAuthClientSecretReveal {
  clientId: string;
  clientSecret: string;
}

export interface OAuthScope {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  isDefault: boolean;
  isEnabled: boolean;
  clientCount: number;
  createdAtUtc: string;
}
