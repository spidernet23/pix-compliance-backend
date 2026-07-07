import { ResilientHttpClient, MtlsConfig } from './http-client';
import { logger } from '../../utils/logger';

/**
 * OAuth 2.0 Token Manager (Client Credentials + mTLS)
 * ═══════════════════════════════════════════════════════════════
 *
 * The BACEN PIX API requires OAuth 2.0 (RFC 6749) with the token bound
 * to the client certificate (RFC 8705 — "Client Certificate-Bound
 * Access Tokens"). This manager:
 *
 *   • Requests an access token via client_credentials grant over mTLS
 *   • Caches it in memory and reuses it until near expiry
 *   • Refreshes proactively (before expiry) to avoid failed calls
 *   • Serializes concurrent refreshes (single-flight) so a burst of
 *     requests triggers exactly one token fetch
 *
 * Tokens are never logged or persisted to disk.
 */

export interface OAuthConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  mtls?: MtlsConfig;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
  scope?: string;
}

interface CachedToken {
  accessToken: string;
  tokenType: string;
  /** Epoch ms after which the token should be considered expired. */
  expiresAt: number;
}

export class OAuthTokenManager {
  private cached: CachedToken | null = null;
  private inFlight: Promise<CachedToken> | null = null;
  private readonly http: ResilientHttpClient;
  /** Refresh this many ms before actual expiry to avoid edge failures. */
  private readonly earlyRefreshMs = 60_000;

  constructor(private readonly cfg: OAuthConfig) {
    const url = new URL(cfg.tokenUrl);
    this.http = new ResilientHttpClient({
      name: 'oauth-token',
      baseUrl: `${url.protocol}//${url.host}`,
      mtls: cfg.mtls,
      timeoutMs: 8_000,
      maxRetries: 2,
    });
  }

  /** Returns a valid access token, refreshing if necessary. */
  async getToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt - this.earlyRefreshMs) {
      return this.cached.accessToken;
    }
    // Single-flight: concurrent callers share one refresh.
    if (!this.inFlight) {
      this.inFlight = this.fetchToken().finally(() => { this.inFlight = null; });
    }
    const token = await this.inFlight;
    return token.accessToken;
  }

  /** Authorization header value ("Bearer <token>"). */
  async authHeader(): Promise<string> {
    const token = await this.getToken();
    return `Bearer ${token}`;
  }

  /** Force-invalidate the cached token (e.g. on 401 from resource server). */
  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<CachedToken> {
    const tokenPath = new URL(this.cfg.tokenUrl).pathname;
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });
    if (this.cfg.scope) params.set('scope', this.cfg.scope);

    const res = await this.http.request<TokenResponse>({
      method: 'POST',
      path: tokenPath,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // Raw form body — override JSON serialization by passing a string.
      body: params.toString() as unknown,
      idempotent: true,
    });

    const cached: CachedToken = {
      accessToken: res.access_token,
      tokenType: res.token_type ?? 'Bearer',
      expiresAt: Date.now() + (res.expires_in ?? 300) * 1000,
    };
    this.cached = cached;

    logger.info('[oauth-token] new access token acquired', {
      expiresInSec: res.expires_in,
      scope: res.scope,
    });

    return cached;
  }
}
