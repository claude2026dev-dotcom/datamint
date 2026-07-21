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
