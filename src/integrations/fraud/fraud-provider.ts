import { ResilientHttpClient } from '../core/http-client';
import { BaseProvider, ProviderHealth, demoHealth, realHealth } from '../core/provider-base';
import { logger } from '../../utils/logger';

/**
 * ML Fraud Engine Provider
 * ═══════════════════════════════════════════════════════════════
 *
 * Fraud scoring is the single most valued metric for the market, and
 * every institution uses a different engine. Rather than binding to one
 * vendor, the real provider talks to any engine that exposes a scoring
 * REST endpoint (the de-facto standard): POST a transaction, get back a
 * fraud score 0..1 and a decision. Works with in-house models, Feedzai,
 * Sift, or a custom TensorFlow service.
 */

export interface FraudScoreRequest {
  transactionId: string;
  amount: number;
  timestamp: string;
  payerDocument?: string;
  metadata?: Record<string, unknown>;
}

export interface FraudScoreResult {
  transactionId: string;
  score: number;              // 0..1, higher = riskier
  decision: 'approve' | 'review' | 'block';
  reasons: string[];
}

export interface FraudAnomaly {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  score: number;
  detectedAt: string;
}

export interface FraudStats {
  fraudRate: number;          // aggregate, 0..1
  transactionsScored: number;
  blocked: number;
  underReview: number;
  falsePositiveRate: number;
  lastUpdated: string;
}

export interface FraudProvider extends BaseProvider {
  getStats(): Promise<FraudStats>;
  listAnomalies(): Promise<FraudAnomaly[]>;
  score(req: FraudScoreRequest): Promise<FraudScoreResult>;
}

// ── Real connector (generic scoring REST API) ──
export interface FraudEngineConfig {
  baseUrl: string;
  apiKey: string;
  statsPath?: string;
  anomaliesPath?: string;
  scorePath?: string;
}

export class RestFraudConnector implements FraudProvider {
  readonly name = 'ml-fraud-engine';
  private readonly http: ResilientHttpClient;

  constructor(private readonly cfg: FraudEngineConfig) {
    this.http = new ResilientHttpClient({
      name: 'ml-fraud-engine',
      baseUrl: cfg.baseUrl,
      defaultHeaders: { Authorization: `Bearer ${cfg.apiKey}` },
      timeoutMs: 8_000,
    });
  }

  async health(): Promise<ProviderHealth> {
    const circuit = this.http.circuitStats();
    try {
      await this.http.request({ method: 'GET', path: this.cfg.statsPath ?? '/stats', idempotent: true });
      return realHealth(true, { state: circuit.state, failures: circuit.failures });
    } catch (err) {
      return realHealth(false, { state: circuit.state, failures: circuit.failures },
        err instanceof Error ? err.message : 'unknown');
    }
  }

  async getStats(): Promise<FraudStats> {
    return this.http.request<FraudStats>({ method: 'GET', path: this.cfg.statsPath ?? '/stats', idempotent: true });
  }

  async listAnomalies(): Promise<FraudAnomaly[]> {
    const res = await this.http.request<{ anomalies: FraudAnomaly[] }>({
      method: 'GET', path: this.cfg.anomaliesPath ?? '/anomalies', idempotent: true,
    });
    return res.anomalies ?? [];
  }

  async score(req: FraudScoreRequest): Promise<FraudScoreResult> {
    logger.info('[ml-fraud-engine] scoring transaction', { txId: req.transactionId });
    return this.http.request<FraudScoreResult>({
      method: 'POST', path: this.cfg.scorePath ?? '/score', body: req,
    });
  }
}

// ── Demo provider ──
export class DemoFraudProvider implements FraudProvider {
  readonly name = 'ml-fraud-engine';

  async health(): Promise<ProviderHealth> {
    return demoHealth('Nenhum motor de fraude configurado. Usando dados demonstrativos.');
  }

  async getStats(): Promise<FraudStats> {
    const j = () => (Math.random() - 0.5) * 0.1;
    return {
      fraudRate: Math.max(0, 0.02 + j() * 0.1),
      transactionsScored: Math.floor(847000 * (1 + j())),
      blocked: Math.floor(1200 * (1 + j())),
      underReview: Math.floor(340 * (1 + j())),
      falsePositiveRate: Math.max(0, 1.8 + j()),
      lastUpdated: new Date().toISOString(),
    };
  }

  async listAnomalies(): Promise<FraudAnomaly[]> {
    return [
      { id: '1', type: 'velocity',       severity: 'high',   description: 'Volume 340% acima da média às 03:00', score: 0.94, detectedAt: new Date(Date.now()-5*60000).toISOString() },
      { id: '2', type: 'geo_anomaly',    severity: 'medium', description: 'Transações de localização incomum',   score: 0.71, detectedAt: new Date(Date.now()-23*60000).toISOString() },
      { id: '3', type: 'amount_pattern', severity: 'low',    description: 'Padrão de valores fracionados',        score: 0.45, detectedAt: new Date(Date.now()-90*60000).toISOString() },
    ];
  }

  async score(req: FraudScoreRequest): Promise<FraudScoreResult> {
    const score = Math.random() * 0.3; // demo: mostly low risk
    return {
      transactionId: req.transactionId,
      score,
      decision: score > 0.8 ? 'block' : score > 0.5 ? 'review' : 'approve',
      reasons: ['demo-scoring'],
    };
  }
}
