/**
 * Shared Provider Contracts
 * ═══════════════════════════════════════════════════════════════
 *
 * Common shapes every integration provider reuses. Each integration
 * (fraud, SIEM, HSM, WAF, transaction DB, business metrics) exposes a
 * real implementation and a demo implementation behind one interface,
 * selected by a factory based on whether the customer configured a
 * live source. This mirrors the BACEN PIX pattern across the board.
 */

export interface ProviderHealth {
  connected: boolean;
  mode: 'real' | 'demo';
  reason?: string;
  circuit?: { state: string; failures: number };
  checkedAt: string;
}

export interface BaseProvider {
  readonly name: string;
  health(): Promise<ProviderHealth>;
}

/** Helper: build a demo health block for an unconfigured integration. */
export function demoHealth(reason: string): ProviderHealth {
  return { connected: false, mode: 'demo', reason, checkedAt: new Date().toISOString() };
}

/** Helper: build a real health block from a live probe result. */
export function realHealth(
  connected: boolean,
  circuit?: { state: string; failures: number },
  reason?: string,
): ProviderHealth {
  return { connected, mode: 'real', circuit, reason, checkedAt: new Date().toISOString() };
}
