/**
 * Circuit Breaker
 * ═══════════════════════════════════════════════════════════════
 *
 * Protects the platform from a failing external dependency. When an
 * integration (e.g. BACEN PIX API) starts failing, we stop hammering
 * it — failing fast instead of piling up timeouts that would degrade
 * the whole system.
 *
 * States:
 *   CLOSED     — normal operation, calls pass through
 *   OPEN       — dependency is failing; calls rejected immediately
 *   HALF_OPEN  — probing: allow one trial call to test recovery
 *
 * This is standard for competitive fintech infrastructure: a single
 * slow upstream must never cascade into a platform-wide outage.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. */
  failureThreshold: number;
  /** Consecutive successes in half-open before closing again. */
  successThreshold: number;
  /** How long to stay open before probing (ms). */
  resetTimeoutMs: number;
  /** Name for logging/telemetry. */
  name: string;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — dependency unavailable`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private nextAttempt = 0;
  private readonly opts: CircuitBreakerOptions;

  constructor(opts: Partial<CircuitBreakerOptions> & { name: string }) {
    this.opts = {
      failureThreshold: opts.failureThreshold ?? 5,
      successThreshold: opts.successThreshold ?? 2,
      resetTimeoutMs: opts.resetTimeoutMs ?? 30_000,
      name: opts.name,
    };
  }

  getState(): CircuitState {
    // Auto-transition OPEN → HALF_OPEN when the reset window elapses.
    if (this.state === 'open' && Date.now() >= this.nextAttempt) {
      this.state = 'half_open';
      this.successes = 0;
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();

    if (state === 'open') {
      throw new CircuitOpenError(this.opts.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half_open') {
      this.successes++;
      if (this.successes >= this.opts.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    if (this.state === 'half_open') {
      // Any failure while probing re-opens immediately.
      this.trip();
    } else if (this.failures >= this.opts.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'open';
    this.nextAttempt = Date.now() + this.opts.resetTimeoutMs;
  }

  /** Snapshot for health/telemetry endpoints. */
  stats() {
    return {
      name: this.opts.name,
      state: this.getState(),
      failures: this.failures,
      nextAttemptInMs: this.state === 'open' ? Math.max(0, this.nextAttempt - Date.now()) : 0,
    };
  }
}
