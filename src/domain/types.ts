// ─────────────────────────────────────────
// USER DOMAIN
// ─────────────────────────────────────────
export type UserRole = 'Admin' | 'Diretor' | 'Analista' | 'Auditor' | 'Visualizador';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaVerified: boolean;
  active: boolean;
  lastLogin?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPublic {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  active: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

// ─────────────────────────────────────────
// AUTH DOMAIN
// ─────────────────────────────────────────
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;        // user id
  email: string;
  role: UserRole;
  name: string;
  iat?: number;
  exp?: number;
}

export interface RefreshPayload {
  sub: string;
  tokenFamily: string;
  iat?: number;
  exp?: number;
}

export interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  tokenFamily: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

export interface MfaSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

// ─────────────────────────────────────────
// AUDIT DOMAIN
// ─────────────────────────────────────────
export type AuditAction =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT'
  | 'MFA_ENABLED' | 'MFA_VERIFIED' | 'MFA_FAILED'
  | 'TOKEN_REFRESH' | 'TOKEN_REVOKE'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED'
  | 'PASSWORD_CHANGED' | 'ACCOUNT_LOCKED'
  | 'DATA_ACCESS' | 'REPORT_GENERATED' | 'EXPORT_DATA'
  | 'POLICY_CHANGED' | 'CONFIG_UPDATED'
  | 'INCIDENT_CREATED' | 'INCIDENT_UPDATED' | 'INCIDENT_RESOLVED'
  | 'COMPLIANCE_CHECK' | 'COMPLIANCE_VIOLATION';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  resource?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  hash: string;          // SHA-256 of entry content
  previousHash: string;  // Chained hash for tamper detection
}

// ─────────────────────────────────────────
// API RESPONSES
// ─────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  timestamp: string;
  requestId: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─────────────────────────────────────────
// COMPLIANCE DOMAIN
// ─────────────────────────────────────────
export type ComplianceFramework = 'LGPD' | 'BACEN_4893' | 'PCI_DSS' | 'ISO_27001' | 'NIST';

export interface ComplianceScore {
  framework: ComplianceFramework;
  score: number;
  status: 'compliant' | 'review' | 'non_compliant';
  requirements: {
    total: number;
    met: number;
  };
  lastAudit: Date;
  nextReview: Date;
}

// ─────────────────────────────────────────
// PIX MONITORING DOMAIN
// ─────────────────────────────────────────
export interface PixMetrics {
  timestamp: Date;
  volumeTotal: number;        // R$ total
  transactionCount: number;
  fraudRate: number;          // percentage
  availability: number;       // percentage
  avgLatencyMs: number;
}

export interface PixAnomaly {
  id: string;
  detectedAt: Date;
  type: 'volume_spike' | 'geographic' | 'time_based' | 'value_threshold';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedTransactions?: number;
  status: 'open' | 'investigating' | 'resolved';
}

// ─────────────────────────────────────────
// INCIDENT DOMAIN
// ─────────────────────────────────────────
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  assignee?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  slaDeadline: Date;
  tags: string[];
}

// ─── LGPD ─────────────────────────────────────────────────────
export type LgpdRequestType = 'access' | 'rectification' | 'deletion' | 'portability' | 'revocation' | 'info';
export type LgpdRequestStatus = 'pending' | 'in_review' | 'completed' | 'rejected';

export interface LgpdRequest {
  id: string;
  type: LgpdRequestType;
  status: LgpdRequestStatus;
  titularName: string;
  titularEmail: string;
  titularDocument: string; // CPF (masked in logs)
  description: string;
  createdAt: Date;
  updatedAt: Date;
  slaDeadline: Date; // +15 days per LGPD Art. 18 §3
  resolvedAt?: Date;
  resolution?: string;
  assignee?: string;
}

export interface ConsentRecord {
  id: string;
  titularEmail: string;
  purpose: string;       // finalidade do tratamento
  legalBasis: string;    // base legal (Art. 7 ou Art. 11)
  granted: boolean;
  grantedAt: Date;
  revokedAt?: Date;
  version: string;       // versão da política
  ip?: string;
}
