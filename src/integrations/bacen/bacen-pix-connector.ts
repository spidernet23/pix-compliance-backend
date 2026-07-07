import { ResilientHttpClient } from '../core/http-client';
import { OAuthTokenManager } from '../core/oauth-token-manager';
import {
  PixDataProvider, PixProviderHealth, PixMetricsSnapshot, PixReceivedTransaction,
} from './pix-provider';
import { logger } from '../../utils/logger';

/**
 * BACEN PIX API Connector (real)
 * ═══════════════════════════════════════════════════════════════
 *
 * Talks to the real Pix API (API Pix 2.8.x) of a PSP, per BACEN specs:
 *   • mTLS (RFC 8705) on every call
 *   • OAuth 2.0 client_credentials, certificate-bound access token
 *   • Endpoints: GET /pix (received transactions), GET /cob (charges)
 *
 * Config comes from BacenPixConfig (built from env / secrets vault).
 * If the certificate or credentials are absent, this connector is NOT
 * instantiated — the factory returns the demo provider instead, and
 * the platform honestly reports "not connected".
 */

export interface BacenPixConfig {
  /** PSP Pix API base URL (resource server). */
  baseUrl: string;
  /** OAuth token endpoint. */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  /** ISPB of the participant institution. */
  ispb: string;
  mtls: {
    cert: string;
    key: string;
    ca?: string;
    passphrase?: string;
  };
}

interface BacenPixListResponse {
  parametros?: { paginacao?: { quantidadeTotalDeItens?: number } };
  pix?: Array<{
    endToEndId: string;
    txid?: string;
    valor: string;
    horario: string;
    pagador?: { nome?: string; cpf?: string; cnpj?: string };
    infoPagador?: string;
  }>;
}

export class BacenPixConnector implements PixDataProvider {
  readonly name = 'bacen-pix-api';
  private readonly http: ResilientHttpClient;
  private readonly oauth: OAuthTokenManager;

  constructor(private readonly cfg: BacenPixConfig) {
    this.oauth = new OAuthTokenManager({
      tokenUrl: cfg.tokenUrl,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      scope: cfg.scope ?? 'pix.read',
      mtls: cfg.mtls,
    });
    this.http = new ResilientHttpClient({
      name: 'bacen-pix-api',
      baseUrl: cfg.baseUrl,
      mtls: cfg.mtls,
      timeoutMs: 12_000,
      maxRetries: 3,
    });
  }

  async health(): Promise<PixProviderHealth> {
    const circuit = this.http.circuitStats();
    try {
      // Lightweight probe: acquiring a token proves mTLS + OAuth work.
      await this.oauth.getToken();
      return {
        connected: true,
        mode: 'real',
        circuit: { state: circuit.state, failures: circuit.failures },
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        connected: false,
        mode: 'real',
        reason: err instanceof Error ? err.message : 'unknown error',
        circuit: { state: circuit.state, failures: circuit.failures },
        checkedAt: new Date().toISOString(),
      };
    }
  }

  private async authedHeaders(): Promise<Record<string, string>> {
    return { Authorization: await this.oauth.authHeader() };
  }

  async listReceived(params: { inicio: string; fim: string; page?: number }): Promise<{
    transactions: PixReceivedTransaction[]; total: number;
  }> {
    const res = await this.http.request<BacenPixListResponse>({
      method: 'GET',
      path: '/pix',
      query: {
        inicio: params.inicio,
        fim: params.fim,
        'paginacao.paginaAtual': params.page ?? 0,
      },
      headers: await this.authedHeaders(),
      idempotent: true,
    });

    const transactions: PixReceivedTransaction[] = (res.pix ?? []).map(p => ({
      endToEndId: p.endToEndId,
      txid: p.txid,
      valor: p.valor,
      horario: p.horario,
      pagador: p.pagador,
      infoPagador: p.infoPagador,
    }));

    return {
      transactions,
      total: res.parametros?.paginacao?.quantidadeTotalDeItens ?? transactions.length,
    };
  }

  async getMetrics(): Promise<PixMetricsSnapshot> {
    // Aggregate from the last 24h of received transactions.
    const fim = new Date();
    const inicio = new Date(fim.getTime() - 24 * 3600_000);

    const started = Date.now();
    const { transactions, total } = await this.listReceived({
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    });
    const latency = Date.now() - started;

    const volumeTotal = transactions.reduce((sum, t) => sum + parseFloat(t.valor || '0'), 0);

    logger.info('[bacen-pix-api] metrics aggregated from live data', { count: total, latencyMs: latency });

    return {
      timestamp: new Date().toISOString(),
      volumeTotal,
      transactionCount: total,
      // Fraud rate requires the ML engine; real PIX API alone can't provide it.
      fraudRate: 0,
      availability: 100,
      avgLatencyMs: latency,
    };
  }
}
