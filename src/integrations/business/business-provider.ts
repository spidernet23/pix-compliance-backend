import { ResilientHttpClient } from '../core/http-client';
import { BaseProvider, ProviderHealth, demoHealth, realHealth } from '../core/provider-base';

/**
 * Business Metrics Provider
 * ═══════════════════════════════════════════════════════════════
 *
 * Executive KPIs: protected revenue, active users, ROI, compliance
 * score. These come from the customer's billing/CRM/data-warehouse via
 * a metrics REST endpoint. Feeds the executive dashboard and security
 * KPI cards.
 */

export interface BusinessKpis {
  revenueProtected: number;
  complianceScore: number;
  activeUsers: number;
  securityRoi: number;
  incidentsResolvedPct: number;
  mttrMinutes: number;
  lastUpdated: string;
}

export interface RiskTrendPoint {
  date: string;
  cybersecurity: number;
  operational: number;
  compliance: number;
  financial: number;
}

export interface BusinessProvider extends BaseProvider {
  getKpis(): Promise<BusinessKpis>;
  getRiskTrends(days: number): Promise<RiskTrendPoint[]>;
}

export interface BusinessConfig {
  baseUrl: string;
  apiKey: string;
  kpisPath?: string;
  trendsPath?: string;
}

export class RestBusinessConnector implements BusinessProvider {
  readonly name = 'business-metrics';
  private readonly http: ResilientHttpClient;

  constructor(private readonly cfg: BusinessConfig) {
    this.http = new ResilientHttpClient({
      name: 'business-metrics',
      baseUrl: cfg.baseUrl,
      defaultHeaders: { Authorization: `Bearer ${cfg.apiKey}` },
      timeoutMs: 8_000,
    });
  }

  async health(): Promise<ProviderHealth> {
    const c = this.http.circuitStats();
    try {
      await this.http.request({ method: 'GET', path: this.cfg.kpisPath ?? '/kpis', idempotent: true });
      return realHealth(true, { state: c.state, failures: c.failures });
    } catch (err) {
      return realHealth(false, { state: c.state, failures: c.failures }, err instanceof Error ? err.message : 'unknown');
    }
  }

  async getKpis(): Promise<BusinessKpis> {
    return this.http.request<BusinessKpis>({ method: 'GET', path: this.cfg.kpisPath ?? '/kpis', idempotent: true });
  }

  async getRiskTrends(days: number): Promise<RiskTrendPoint[]> {
    const res = await this.http.request<{ trends: RiskTrendPoint[] }>({
      method: 'GET', path: this.cfg.trendsPath ?? '/risk-trends', query: { days }, idempotent: true,
    });
    return res.trends ?? [];
  }
}

export class DemoBusinessProvider implements BusinessProvider {
  readonly name = 'business-metrics';
  async health(): Promise<ProviderHealth> {
    return demoHealth('Nenhuma fonte de métricas de negócio configurada. Usando dados demonstrativos.');
  }
  async getKpis(): Promise<BusinessKpis> {
    return {
      revenueProtected: 847e6,
      complianceScore: 98.7,
      activeUsers: 2.4e6,
      securityRoi: 347,
      incidentsResolvedPct: 99.2,
      mttrMinutes: 2.8,
      lastUpdated: new Date().toISOString(),
    };
  }
  async getRiskTrends(days: number): Promise<RiskTrendPoint[]> {
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      return {
        date: d.toISOString().split('T')[0]!,
        cybersecurity: Math.max(5, 20 - i * 0.4 + Math.random() * 4),
        operational: Math.max(10, 45 - i * 0.3 + Math.random() * 5),
        compliance: Math.max(3, 15 - i * 0.3 + Math.random() * 3),
        financial: Math.max(2, 10 - i * 0.2 + Math.random() * 2),
      };
    });
  }
}
