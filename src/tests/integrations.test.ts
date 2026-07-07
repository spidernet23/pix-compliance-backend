import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../integrations/core/circuit-breaker';
import { getPixProvider, resetPixProvider } from '../integrations/bacen/provider-factory';
import { DemoPixProvider } from '../integrations/bacen/demo-pix-provider';

describe('CircuitBreaker', () => {
  it('starts closed and passes calls through', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('opens after reaching the failure threshold', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
    const boom = async () => { throw new Error('fail'); };

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(boom)).rejects.toThrow('fail');
    }
    expect(cb.getState()).toBe('open');
  });

  it('rejects immediately with CircuitOpenError while open', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 });
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    // Now open: the next call must be rejected without executing fn.
    let executed = false;
    await expect(cb.execute(async () => { executed = true; return 'x'; }))
      .rejects.toBeInstanceOf(CircuitOpenError);
    expect(executed).toBe(false);
  });

  it('transitions to half_open after the reset timeout and closes on success', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, successThreshold: 1, resetTimeoutMs: 10 });
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    await new Promise(r => setTimeout(r, 15));
    expect(cb.getState()).toBe('half_open'); // reset window elapsed

    const result = await cb.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe('closed');
  });

  it('re-opens immediately if the half_open probe fails', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10 });
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await new Promise(r => setTimeout(r, 15));
    expect(cb.getState()).toBe('half_open');

    await expect(cb.execute(async () => { throw new Error('still failing'); })).rejects.toThrow();
    expect(cb.getState()).toBe('open');
  });
});

describe('PIX provider factory', () => {
  beforeEach(() => resetPixProvider());

  it('returns the demo provider when no BACEN credentials are configured', () => {
    // Test env has no BACEN_PIX_* vars set.
    const provider = getPixProvider();
    expect(provider).toBeInstanceOf(DemoPixProvider);
  });

  it('demo provider honestly reports connected=false and mode=demo', async () => {
    const provider = getPixProvider();
    const health = await provider.health();
    expect(health.connected).toBe(false);
    expect(health.mode).toBe('demo');
    expect(health.reason).toBeTruthy();
  });

  it('demo provider still fulfills the full contract (metrics + listReceived)', async () => {
    const provider = getPixProvider();
    const metrics = await provider.getMetrics();
    expect(metrics.volumeTotal).toBeGreaterThan(0);
    expect(metrics.transactionCount).toBeGreaterThan(0);

    const received = await provider.listReceived({ inicio: '2024-01-01T00:00:00Z', fim: '2024-01-02T00:00:00Z' });
    expect(Array.isArray(received.transactions)).toBe(true);
    expect(received.total).toBe(received.transactions.length);
    // Demo payer data must be masked (LGPD hygiene even in demo).
    expect(received.transactions[0]?.pagador?.cpf).toContain('*');
  });

  it('memoizes the provider instance', () => {
    const a = getPixProvider();
    const b = getPixProvider();
    expect(a).toBe(b);
  });
});
