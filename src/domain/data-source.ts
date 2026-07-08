/**
 * Data Provenance System
 * ══════════════════════════════════════════════════════════════
 *
 * Every piece of data this platform serves is explicitly classified.
 * This is a COMPLIANCE product — claiming data is real when it is
 * synthetic would destroy the trust the product depends on.
 *
 * Two classes of data:
 *
 *   REAL  — genuinely produced by this system and persisted:
 *           auth, audit trail (SHA-256 chained), incidents, LGPD
 *           requests, user sessions, consent log, system settings.
 *           These survive restarts and are backed by real logic.
 *
 *   DEMO  — illustrative values shown so evaluators can see the
 *           interface. These would come from an external integration
 *           (BACEN PIX API, SIEM, HSM, transaction database) that is
 *           NOT yet connected. Every DEMO payload carries metadata
 *           saying exactly which integration would replace it.
 *
 * The frontend reads `_meta` and renders a visible "Demonstrativo"
 * badge on any DEMO data, so nobody — auditor, CISO, or buyer — can
 * ever be misled about what is live.
 */

export type DataSourceKind = 'real' | 'demo';

/** Integrations that would supply real data for each demo endpoint. */
export type IntegrationId =
  | 'bacen-pix-api'        // PIX transaction volume, fraud signals
  | 'siem'                 // security events, threat intelligence
  | 'hsm'                  // key management, crypto layer health
  | 'waf-edge'             // edge/WAF threat counts
  | 'transaction-db'       // customer transaction store
  | 'ml-fraud-engine'      // fraud/anomaly ML scoring
  | 'business-metrics';    // revenue, active users, ROI (from billing/CRM)

export interface IntegrationDescriptor {
  id: IntegrationId;
  name: string;
  description: string;
  /** What real data this integration would provide once connected. */
  provides: string;
  /** Connection state. Always false until a customer wires their source. */
  connected: boolean;
}

export const INTEGRATIONS: Record<IntegrationId, IntegrationDescriptor> = {
  'bacen-pix-api': {
    id: 'bacen-pix-api',
    name: 'API PIX / BACEN',
    description: 'Conexão com o Sistema de Pagamentos Instantâneos do Banco Central',
    provides: 'Volume transacional PIX, contagem de transações, disponibilidade do DICT',
    connected: false,
  },
  'siem': {
    id: 'siem',
    name: 'SIEM',
    description: 'Security Information and Event Management (ex: Splunk, Elastic, Sentinel)',
    provides: 'Eventos de segurança, threat intelligence, detecção de ameaças por camada',
    connected: false,
  },
  'hsm': {
    id: 'hsm',
    name: 'HSM',
    description: 'Hardware Security Module para gestão de chaves criptográficas',
    provides: 'Saúde da camada de criptografia, status de chaves, operações HSM',
    connected: false,
  },
  'waf-edge': {
    id: 'waf-edge',
    name: 'WAF / Edge Protection',
    description: 'Web Application Firewall e proteção de borda (ex: Cloudflare, AWS WAF)',
    provides: 'Ameaças bloqueadas na borda, tentativas de DDoS, requisições maliciosas',
    connected: false,
  },
  'transaction-db': {
    id: 'transaction-db',
    name: 'Base de Transações',
    description: 'Banco de dados transacional do cliente',
    provides: 'Histórico de transações, padrões de volume, dados para análise',
    connected: false,
  },
  'ml-fraud-engine': {
    id: 'ml-fraud-engine',
    name: 'Motor de Fraude (ML)',
    description: 'Engine de machine learning para scoring de fraude e anomalias',
    provides: 'Taxa de fraude, detecção de anomalias, scores preditivos',
    connected: false,
  },
  'business-metrics': {
    id: 'business-metrics',
    name: 'Métricas de Negócio',
    description: 'Fonte de dados financeiros e de uso (billing, CRM, data warehouse)',
    provides: 'Receita protegida, usuários ativos, ROI, KPIs executivos',
    connected: false,
  },
};

export interface DataMeta {
  source: DataSourceKind;
  /** Present only when source === 'demo'. */
  integration?: IntegrationId;
  integrationName?: string;
  connected?: boolean;
  /** Human-readable note shown in tooltips / audit exports. */
  note?: string;
}

/** Build a provenance block declaring data as REAL. */
export function realMeta(note?: string): DataMeta {
  return { source: 'real', connected: true, note };
}

/** Build a provenance block declaring data as DEMO, tied to an integration. */
export function demoMeta(integration: IntegrationId): DataMeta {
  const descriptor = INTEGRATIONS[integration];
  return {
    source: 'demo',
    integration,
    integrationName: descriptor.name,
    connected: descriptor.connected,
    note: `Dado demonstrativo. Em produção, provido pela integração "${descriptor.name}" (${descriptor.provides}), atualmente não conectada.`,
  };
}

/** Returns the connection status of all integrations (for the Integrations page). */
export async function integrationStatus() {
  // Query live health of every integration via the registry.
  const { allIntegrationsHealth } = await import('../integrations/registry');
  let healthMap: Record<string, boolean> = {};
  try {
    healthMap = await allIntegrationsHealth();
  } catch {
    healthMap = {};
  }

  return Object.values(INTEGRATIONS).map(i => ({
    id: i.id,
    name: i.name,
    description: i.description,
    provides: i.provides,
    connected: healthMap[i.id] ?? i.connected,
  }));
}
