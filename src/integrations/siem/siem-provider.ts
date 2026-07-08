import { ResilientHttpClient } from '../core/http-client';
import { BaseProvider, ProviderHealth, demoHealth, realHealth } from '../core/provider-base';

/**
 * SIEM Provider
 * ═══════════════════════════════════════════════════════════════
 *
 * Every institution runs a different SIEM (Splunk, Elastic, Sentinel,
 * QRadar). Instead of one vendor connector, the real provider queries
 * any SIEM that exposes a search/events REST API returning security
 * events — the common denominator all of them support. The customer
 * points us at their SIEM's query endpoint + token.
 *
 * Feeds the 9-layer security view, threat feed, and automation stats.
 */

export interface SecurityLayer {
  layer: number;
  name: string;
  health: number;
  threatsDetected: number;
  threatsBlocked: number;
  services: string[];
}

export interface ThreatEvent {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  layer: string;
  blocked: boolean;
  detectedAt: string;
}

export interface SecuritySnapshot {
  layers: SecurityLayer[];
  overallHealth: number;
  totalThreatsDetected: number;
  totalThreatsBlocked: number;
  blockRate: number;
  lastUpdated: string;
}

export interface SiemProvider extends BaseProvider {
  getSecuritySnapshot(): Promise<SecuritySnapshot>;
  listThreats(): Promise<ThreatEvent[]>;
}

export interface SiemConfig {
  baseUrl: string;
  apiKey: string;
  eventsPath?: string;
  layersPath?: string;
}

export class RestSiemConnector implements SiemProvider {
  readonly name = 'siem';
  private readonly http: ResilientHttpClient;

  constructor(private readonly cfg: SiemConfig) {
    this.http = new ResilientHttpClient({
      name: 'siem',
      baseUrl: cfg.baseUrl,
      defaultHeaders: { Authorization: `Bearer ${cfg.apiKey}` },
      timeoutMs: 10_000,
    });
  }

  async health(): Promise<ProviderHealth> {
    const c = this.http.circuitStats();
    try {
      await this.http.request({ method: 'GET', path: this.cfg.layersPath ?? '/security/layers', idempotent: true });
      return realHealth(true, { state: c.state, failures: c.failures });
    } catch (err) {
      return realHealth(false, { state: c.state, failures: c.failures }, err instanceof Error ? err.message : 'unknown');
    }
  }

  async getSecuritySnapshot(): Promise<SecuritySnapshot> {
    return this.http.request<SecuritySnapshot>({ method: 'GET', path: this.cfg.layersPath ?? '/security/layers', idempotent: true });
  }

  async listThreats(): Promise<ThreatEvent[]> {
    const res = await this.http.request<{ events: ThreatEvent[] }>({
      method: 'GET', path: this.cfg.eventsPath ?? '/security/events', idempotent: true,
    });
    return res.events ?? [];
  }
}

const DEMO_LAYERS: SecurityLayer[] = [
  { layer: 1, name: 'Edge Protection',        health: 98.5, threatsDetected: 247, threatsBlocked: 245, services: ['WAF', 'DDoS Protection', 'CDN Security'] },
  { layer: 2, name: 'Network Security',       health: 97.2, threatsDetected: 156, threatsBlocked: 154, services: ['Firewall', 'IPS/IDS', 'Network Segmentation'] },
  { layer: 3, name: 'Application Security',    health: 96.8, threatsDetected: 89,  threatsBlocked: 87,  services: ['Code Analysis', 'OWASP Protection', 'API Security'] },
  { layer: 4, name: 'Identity & Access',       health: 99.1, threatsDetected: 78,  threatsBlocked: 78,  services: ['MFA', 'RBAC', 'Zero Trust'] },
  { layer: 5, name: 'Data Protection',         health: 98.9, threatsDetected: 23,  threatsBlocked: 23,  services: ['AES-256', 'DLP', 'HSM'] },
  { layer: 6, name: 'Endpoint Security',       health: 97.5, threatsDetected: 134, threatsBlocked: 131, services: ['EDR', 'Antivirus', 'Device Control'] },
  { layer: 7, name: 'Monitoring & SIEM',       health: 98.2, threatsDetected: 456, threatsBlocked: 452, services: ['SIEM', 'Log Analysis', 'Threat Detection'] },
  { layer: 8, name: 'AI/ML Security',          health: 94.7, threatsDetected: 89,  threatsBlocked: 85,  services: ['Behavioral Analysis', 'ML Threat Prediction'] },
  { layer: 9, name: 'Compliance & Governance', health: 96.3, threatsDetected: 12,  threatsBlocked: 12,  services: ['Audit', 'Policy Enforcement', 'Risk Management'] },
];

export class DemoSiemProvider implements SiemProvider {
  readonly name = 'siem';

  async health(): Promise<ProviderHealth> {
    return demoHealth('Nenhum SIEM configurado. Usando dados demonstrativos.');
  }

  async getSecuritySnapshot(): Promise<SecuritySnapshot> {
    return {
      layers: DEMO_LAYERS,
      overallHealth: 97.6,
      totalThreatsDetected: DEMO_LAYERS.reduce((a, l) => a + l.threatsDetected, 0),
      totalThreatsBlocked: DEMO_LAYERS.reduce((a, l) => a + l.threatsBlocked, 0),
      blockRate: 99.2,
      lastUpdated: new Date().toISOString(),
    };
  }

  async listThreats(): Promise<ThreatEvent[]> {
    return [
      { id: '1', type: 'DDoS Attempt',       severity: 'high',     source: '203.45.12.0/24', layer: 'Edge Protection',     blocked: true,  detectedAt: new Date(Date.now()-5*60000).toISOString() },
      { id: '2', type: 'SQL Injection',      severity: 'high',     source: '185.234.9.45',   layer: 'Application Security', blocked: true,  detectedAt: new Date(Date.now()-12*60000).toISOString() },
      { id: '3', type: 'Brute Force',        severity: 'medium',   source: '91.108.56.89',   layer: 'Identity & Access',   blocked: true,  detectedAt: new Date(Date.now()-23*60000).toISOString() },
      { id: '4', type: 'Data Exfil Attempt', severity: 'critical', source: '45.155.205.12',  layer: 'Data Protection',     blocked: false, detectedAt: new Date(Date.now()-45*60000).toISOString() },
    ];
  }
}
