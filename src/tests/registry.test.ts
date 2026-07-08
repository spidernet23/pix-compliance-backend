import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFraudProvider, getSiemProvider, getHsmProvider,
  getWafProvider, getTxDbProvider, getBusinessProvider,
  allIntegrationsHealth, resetRegistry,
} from '../integrations/registry';
import { DemoFraudProvider } from '../integrations/fraud/fraud-provider';
import { DemoSiemProvider } from '../integrations/siem/siem-provider';
import { DemoBusinessProvider } from '../integrations/business/business-provider';

/**
 * Registry tests: without external config, every integration must fall
 * back to its demo provider and honestly report connected=false. This
 * locks in the "demo unless configured" contract across all 6 new
 * integrations, matching the BACEN pattern.
 */
describe('Integration registry — demo fallback', () => {
  beforeEach(() => resetRegistry());

  it('returns demo providers when no config is present', () => {
    expect(getFraudProvider()).toBeInstanceOf(DemoFraudProvider);
    expect(getSiemProvider()).toBeInstanceOf(DemoSiemProvider);
    expect(getBusinessProvider()).toBeInstanceOf(DemoBusinessProvider);
  });

  it('every provider reports connected=false and mode=demo', async () => {
    const providers = [
      getFraudProvider(), getSiemProvider(), getHsmProvider(),
      getWafProvider(), getTxDbProvider(), getBusinessProvider(),
    ];
    for (const p of providers) {
      const h = await p.health();
      expect(h.connected).toBe(false);
      expect(h.mode).toBe('demo');
      expect(h.reason).toBeTruthy();
    }
  });

  it('allIntegrationsHealth reports all 7 integrations as not connected', async () => {
    const health = await allIntegrationsHealth();
    const ids = Object.keys(health);
    expect(ids).toContain('bacen-pix-api');
    expect(ids).toContain('ml-fraud-engine');
    expect(ids).toContain('siem');
    expect(ids).toContain('hsm');
    expect(ids).toContain('waf-edge');
    expect(ids).toContain('transaction-db');
    expect(ids).toContain('business-metrics');
    expect(Object.values(health).every(v => v === false)).toBe(true);
  });

  it('demo providers fulfill their full contracts', async () => {
    const fraud = await getFraudProvider().getStats();
    expect(fraud.fraudRate).toBeGreaterThanOrEqual(0);

    const siem = await getSiemProvider().getSecuritySnapshot();
    expect(siem.layers.length).toBe(9);

    const biz = await getBusinessProvider().getKpis();
    expect(biz.revenueProtected).toBeGreaterThan(0);

    const hsm = await getHsmProvider().getHsmHealth();
    expect(hsm.keysActive).toBeGreaterThan(0);

    const waf = await getWafProvider().getWafStats();
    expect(waf.threatsBlocked).toBeGreaterThanOrEqual(0);

    const txdb = await getTxDbProvider().getHistory(7);
    expect(txdb.length).toBe(7);
  });

  it('memoizes provider instances', () => {
    const a = getFraudProvider();
    const b = getFraudProvider();
    expect(a).toBe(b);
  });
});
