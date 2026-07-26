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

export interface DocumentSummary {
  id: string;
  originalFileName: string;
  contentType: string;
  pageCount: number;
  status: 'Uploaded' | 'Processing' | 'Extracted' | 'Reviewed' | 'Exported' | 'Failed';
  createdAtUtc: string;
  failureReason?: string;
  fileSizeBytes: number;
  uploadBatchId: string;
}

export type BatchExportMode = 'SingleSheet' | 'MultipleSheets' | 'SeparateFiles';

export type ExportFormat = 'Excel' | 'Json';

// RowsPerField: one row per field (per-document/per-sheet). ColumnsPerField: one column per
// field key, one row per document - selectable both at export time and for the on-screen
// review grid's own view-mode toggle.
export type ExportLayout = 'RowsPerField' | 'ColumnsPerField';

export interface ExportOptions {
  format: ExportFormat;
  layout: ExportLayout;
  // Explicit override subset. Omit/undefined = respect each field's own includeInExport flag.
  includedFieldIds?: string[];
  // Batch-only. Omit/undefined = every document in the request.
  includedDocumentIds?: string[];
}

export interface ExtractedFieldEdit {
  id: string;
  fieldKey: string;
  originalFieldKey: string;
  fieldValue: string | null;
  // The AI's original, untouched value - only present to power the review page's "Edit" tab
  // showing what changed vs. what the AI first found. Never written into an exported file.
  originalAiValue?: string | null;
  pageNumber: number | null;
  wasEditedByUser: boolean;
  // AI-suggested classification (e.g. "Address"/"Date"/"Amount"/"Generic") - always a concrete
  // string, backend falls back to "Generic" for rows extracted before this existed. User-editable
  // via the Edit tab's type picker - corrected purely for export formatting, doesn't itself count
  // as an "edit" (see DocumentProcessingService.UpdateFieldAsync).
  semanticType: string;
  // AI-suggested group name (e.g. "Shipping Details") - falls back to "General".
  sectionLabel: string;
  includeInExport: boolean;
  sortOrder: number;
}

// Shared shape for anything rendering one-document-or-many field data (the card editor, the
// read-only preview table): a document is just its id/name plus the fields belonging to it.
export interface FieldEditorDocument {
  id: string;
  fileName: string;
  fields: ExtractedFieldEdit[];
}

// Curated, human-friendly type list offered by the Edit tab's type picker - matches the fixed
// vocabulary the AI itself classifies into (AiExtractionPromptHelper.TypeAndSectionInstructions),
// so a manual correction and an AI classification always draw from the same set. The picker still
// accepts a free-text/custom entry beyond this list - SemanticType is just a string end to end.
export const SEMANTIC_TYPES: string[] = [
  'Generic', 'Name', 'Address', 'Contact', 'Email', 'URL', 'Date', 'Amount', 'Quantity', 'Percentage', 'Boolean', 'Reference'
];

export interface FieldTemplate {
  id: string;
  name: string;
  fields: string[];
  createdAtUtc: string;
  updatedAtUtc: string | null;
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
  extractionTierId?: string | null;
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

export interface RoleTierOverride {
  role: string;
  extractionTierId: string | null;
  extractionTierName: string | null;
}

export interface ExtractionTier {
  id: string;
  name: string;
  aiProvider: 'Claude' | 'OpenAI';
  modelName: string;
  customOutputFormatExample?: string | null;
  customInstructions?: string | null;
  isDefault: boolean;
  isEnabled: boolean;
  planCount: number;
  createdAtUtc: string;
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
