import { ResilientHttpClient } from '../core/http-client';
import { BaseProvider, ProviderHealth, demoHealth, realHealth } from '../core/provider-base';

/**
 * WAF / Edge Provider
 * ═══════════════════════════════════════════════════════════════
 *
 * Edge protection metrics (blocked threats, DDoS attempts). Institutions
 * use Cloudflare, AWS WAF, Akamai. The real provider queries any WAF
 * exposing an analytics REST endpoint returning blocked-request counts —
 * the shape all major WAF analytics APIs share.
 */

export interface WafStats {
  requestsTotal: number;
  threatsBlocked: number;
  ddosMitigated: number;
  topAttackTypes: Array<{ type: string; count: number }>;
  blockRate: number;
  lastUpdated: string;
}

export interface WafProvider extends BaseProvider {
  getWafStats(): Promise<WafStats>;
}

export interface WafConfig {
  baseUrl: string;
  apiKey: string;
  statsPath?: string;
}

export class RestWafConnector implements WafProvider {
  readonly name = 'waf-edge';
  private readonly http: ResilientHttpClient;

  constructor(private readonly cfg: WafConfig) {
    this.http = new ResilientHttpClient({
      name: 'waf-edge',
      baseUrl: cfg.baseUrl,
      defaultHeaders: { Authorization: `Bearer ${cfg.apiKey}` },
      timeoutMs: 8_000,
    });
  }

  async health(): Promise<ProviderHealth> {
    const c = this.http.circuitStats();
    try {
      await this.http.request({ method: 'GET', path: this.cfg.statsPath ?? '/stats', idempotent: true });
      return realHealth(true, { state: c.state, failures: c.failures });
    } catch (err) {
      return realHealth(false, { state: c.state, failures: c.failures }, err instanceof Error ? err.message : 'unknown');
    }
  }

  async getWafStats(): Promise<WafStats> {
    return this.http.request<WafStats>({ method: 'GET', path: this.cfg.statsPath ?? '/stats', idempotent: true });
  }
}

export class DemoWafProvider implements WafProvider {
  readonly name = 'waf-edge';
  async health(): Promise<ProviderHealth> {
    return demoHealth('Nenhum WAF configurado. Usando dados demonstrativos.');
  }
  async getWafStats(): Promise<WafStats> {
    const j = () => (Math.random() - 0.5) * 0.1;
    return {
      requestsTotal: Math.floor(12_400_000 * (1 + j())),
      threatsBlocked: Math.floor(247 * (1 + j())),
      ddosMitigated: Math.floor(3 * (1 + j())),
      topAttackTypes: [
        { type: 'SQL Injection', count: 89 },
        { type: 'XSS', count: 67 },
        { type: 'Path Traversal', count: 34 },
      ],
      blockRate: 99.2,
      lastUpdated: new Date().toISOString(),
    };
  }
}
