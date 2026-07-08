import { getPixProvider } from './bacen/provider-factory';
import { FraudProvider, RestFraudConnector, DemoFraudProvider } from './fraud/fraud-provider';
import { SiemProvider, RestSiemConnector, DemoSiemProvider } from './siem/siem-provider';
import { HsmProvider, RestHsmConnector, DemoHsmProvider } from './hsm/hsm-provider';
import { WafProvider, RestWafConnector, DemoWafProvider } from './waf/waf-provider';
import { TxDbProvider, RestTxDbConnector, DemoTxDbProvider } from './txdb/txdb-provider';
import { BusinessProvider, RestBusinessConnector, DemoBusinessProvider } from './business/business-provider';
import { logger } from '../utils/logger';

/**
 * Integration Registry
 * ═══════════════════════════════════════════════════════════════
 *
 * Single place that builds every integration provider. Each one uses
 * the real connector when its config (base URL + API key) is present in
 * the environment, and the demo provider otherwise. This is the seam a
 * customer wires to go live per integration — independently. Connecting
 * fraud scoring does not require connecting the SIEM, and so on.
 */

function envPair(prefix: string): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env[`${prefix}_BASE_URL`];
  const apiKey = process.env[`${prefix}_API_KEY`];
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

let fraud: FraudProvider | null = null;
let siem: SiemProvider | null = null;
let hsm: HsmProvider | null = null;
let waf: WafProvider | null = null;
let txdb: TxDbProvider | null = null;
let business: BusinessProvider | null = null;

export function getFraudProvider(): FraudProvider {
  if (fraud) return fraud;
  const cfg = envPair('FRAUD_ENGINE');
  fraud = cfg ? new RestFraudConnector(cfg) : new DemoFraudProvider();
  if (cfg) logger.info('[registry] real fraud engine connector active');
  return fraud;
}

export function getSiemProvider(): SiemProvider {
  if (siem) return siem;
  const cfg = envPair('SIEM');
  siem = cfg ? new RestSiemConnector(cfg) : new DemoSiemProvider();
  if (cfg) logger.info('[registry] real SIEM connector active');
  return siem;
}

export function getHsmProvider(): HsmProvider {
  if (hsm) return hsm;
  const cfg = envPair('HSM');
  hsm = cfg ? new RestHsmConnector(cfg) : new DemoHsmProvider();
  if (cfg) logger.info('[registry] real HSM connector active');
  return hsm;
}

export function getWafProvider(): WafProvider {
  if (waf) return waf;
  const cfg = envPair('WAF');
  waf = cfg ? new RestWafConnector(cfg) : new DemoWafProvider();
  if (cfg) logger.info('[registry] real WAF connector active');
  return waf;
}

export function getTxDbProvider(): TxDbProvider {
  if (txdb) return txdb;
  const cfg = envPair('TXDB');
  txdb = cfg ? new RestTxDbConnector(cfg) : new DemoTxDbProvider();
  if (cfg) logger.info('[registry] real transaction DB connector active');
  return txdb;
}

export function getBusinessProvider(): BusinessProvider {
  if (business) return business;
  const cfg = envPair('BUSINESS_METRICS');
  business = cfg ? new RestBusinessConnector(cfg) : new DemoBusinessProvider();
  if (cfg) logger.info('[registry] real business metrics connector active');
  return business;
}

/** Live health of every integration (for the Integrations page). */
export async function allIntegrationsHealth(): Promise<Record<string, boolean>> {
  const providers = [
    getPixProvider(), getFraudProvider(), getSiemProvider(),
    getHsmProvider(), getWafProvider(), getTxDbProvider(), getBusinessProvider(),
  ];
  const entries = await Promise.all(providers.map(async p => {
    try {
      const h = await p.health();
      return [p.name, h.connected] as const;
    } catch {
      return [p.name, false] as const;
    }
  }));
  return Object.fromEntries(entries);
}

/** For tests: reset all memoized providers. */
export function resetRegistry(): void {
  fraud = siem = null;
  hsm = waf = txdb = business = null;
}
