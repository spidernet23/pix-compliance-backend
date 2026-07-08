import { ResilientHttpClient } from '../core/http-client';
import { BaseProvider, ProviderHealth, demoHealth, realHealth } from '../core/provider-base';

/**
 * HSM Provider
 * ═══════════════════════════════════════════════════════════════
 *
 * Reports health of the cryptographic key-management layer. Institutions
 * use different HSMs (Thales, AWS CloudHSM, Azure Key Vault). The real
 * provider queries any KMS/HSM exposing a health/status REST endpoint —
 * the pattern cloud KMS and HSM management APIs share.
 */

export interface HsmHealth {
  operational: boolean;
  keysActive: number;
  keysExpiringSoon: number;
  lastKeyRotation: string;
  operationsPerSec: number;
  latencyMs: number;
  lastUpdated: string;
}

export interface HsmProvider extends BaseProvider {
  getHsmHealth(): Promise<HsmHealth>;
}

export interface HsmConfig {
  baseUrl: string;
  apiKey: string;
  healthPath?: string;
}

export class RestHsmConnector implements HsmProvider {
  readonly name = 'hsm';
  private readonly http: ResilientHttpClient;

  constructor(private readonly cfg: HsmConfig) {
    this.http = new ResilientHttpClient({
      name: 'hsm',
      baseUrl: cfg.baseUrl,
      defaultHeaders: { Authorization: `Bearer ${cfg.apiKey}` },
      timeoutMs: 6_000,
    });
  }

  async health(): Promise<ProviderHealth> {
    const c = this.http.circuitStats();
    try {
      await this.http.request({ method: 'GET', path: this.cfg.healthPath ?? '/health', idempotent: true });
      return realHealth(true, { state: c.state, failures: c.failures });
    } catch (err) {
      return realHealth(false, { state: c.state, failures: c.failures }, err instanceof Error ? err.message : 'unknown');
    }
  }

  async getHsmHealth(): Promise<HsmHealth> {
    return this.http.request<HsmHealth>({ method: 'GET', path: this.cfg.healthPath ?? '/health', idempotent: true });
  }
}

export class DemoHsmProvider implements HsmProvider {
  readonly name = 'hsm';
  async health(): Promise<ProviderHealth> {
    return demoHealth('Nenhum HSM configurado. Usando dados demonstrativos.');
  }
  async getHsmHealth(): Promise<HsmHealth> {
    return {
      operational: true,
      keysActive: 128,
      keysExpiringSoon: 2,
      lastKeyRotation: new Date(Date.now() - 15 * 86400000).toISOString(),
      operationsPerSec: Math.floor(4200 + Math.random() * 800),
      latencyMs: Math.floor(2 + Math.random() * 3),
      lastUpdated: new Date().toISOString(),
    };
  }
}
