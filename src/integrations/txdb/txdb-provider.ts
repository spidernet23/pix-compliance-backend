import { ResilientHttpClient } from '../core/http-client';
import { BaseProvider, ProviderHealth, demoHealth, realHealth } from '../core/provider-base';

/**
 * Transaction DB Provider
 * ═══════════════════════════════════════════════════════════════
 *
 * Historical transaction data for trend charts. The customer exposes
 * their transaction store through a read REST endpoint (a data gateway
 * or reporting API) returning aggregated daily volume. Keeps the
 * customer's raw transaction DB isolated — we only read aggregates.
 */

export interface TxHistoryPoint {
  date: string;
  volume: number;
  transactions: number;
  avgTicket: number;
}

export interface TxDbProvider extends BaseProvider {
  getHistory(days: number): Promise<TxHistoryPoint[]>;
}

export interface TxDbConfig {
  baseUrl: string;
  apiKey: string;
  historyPath?: string;
}

export class RestTxDbConnector implements TxDbProvider {
  readonly name = 'transaction-db';
  private readonly http: ResilientHttpClient;

  constructor(private readonly cfg: TxDbConfig) {
    this.http = new ResilientHttpClient({
      name: 'transaction-db',
      baseUrl: cfg.baseUrl,
      defaultHeaders: { Authorization: `Bearer ${cfg.apiKey}` },
      timeoutMs: 10_000,
    });
  }

  async health(): Promise<ProviderHealth> {
    const c = this.http.circuitStats();
    try {
      await this.http.request({ method: 'GET', path: this.cfg.historyPath ?? '/history', query: { days: 1 }, idempotent: true });
      return realHealth(true, { state: c.state, failures: c.failures });
    } catch (err) {
      return realHealth(false, { state: c.state, failures: c.failures }, err instanceof Error ? err.message : 'unknown');
    }
  }

  async getHistory(days: number): Promise<TxHistoryPoint[]> {
    const res = await this.http.request<{ history: TxHistoryPoint[] }>({
      method: 'GET', path: this.cfg.historyPath ?? '/history', query: { days }, idempotent: true,
    });
    return res.history ?? [];
  }
}

export class DemoTxDbProvider implements TxDbProvider {
  readonly name = 'transaction-db';
  async health(): Promise<ProviderHealth> {
    return demoHealth('Nenhuma base de transações configurada. Usando dados demonstrativos.');
  }
  async getHistory(days: number): Promise<TxHistoryPoint[]> {
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.now() - (days - 1 - i) * 86400000);
      const transactions = 700000 + Math.floor(Math.random() * 200000);
      const volume = 2.0e9 + Math.random() * 0.8e9;
      return {
        date: date.toISOString().split('T')[0]!,
        volume,
        transactions,
        avgTicket: Math.round(volume / transactions),
      };
    });
  }
}
