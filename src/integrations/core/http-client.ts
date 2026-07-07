import https from 'node:https';
import { CircuitBreaker } from './circuit-breaker';
import { logger } from '../../utils/logger';

/**
 * Resilient HTTP Client
 * ═══════════════════════════════════════════════════════════════
 *
 * Production-grade wrapper around fetch (Node 22 native) for calling
 * external financial APIs. Provides:
 *
 *   • mTLS  — client certificate + key (required by BACEN PIX API)
 *   • Timeout — no request hangs forever
 *   • Retry with exponential backoff + jitter — transient failures
 *   • Circuit breaker — stop calling a dead dependency
 *   • Structured logging — every call is observable (no PII leaked)
 *
 * This is the backbone that makes each integration robust enough for
 * a bank's production environment.
 */

export interface MtlsConfig {
  /** PEM-encoded client certificate. */
  cert: string;
  /** PEM-encoded private key. */
  key: string;
  /** Optional CA bundle (e.g. ICP-Brasil root). */
  ca?: string;
  /** Passphrase for the private key, if encrypted. */
  passphrase?: string;
}

export interface HttpClientOptions {
  name: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  mtls?: MtlsConfig;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Override the default timeout for this call. */
  timeoutMs?: number;
  /** Skip retry for non-idempotent calls that must not be duplicated. */
  idempotent?: boolean;
  query?: Record<string, string | number | undefined>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class ResilientHttpClient {
  private readonly breaker: CircuitBreaker;
  private readonly agent?: https.Agent;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly opts: HttpClientOptions) {
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.breaker = new CircuitBreaker({ name: opts.name });

    // mTLS: build a dedicated https.Agent with the client certificate.
    if (opts.mtls) {
      this.agent = new https.Agent({
        cert: opts.mtls.cert,
        key: opts.mtls.key,
        ca: opts.mtls.ca,
        passphrase: opts.mtls.passphrase,
        // Financial APIs require full chain validation. Never disable.
        rejectUnauthorized: true,
        keepAlive: true,
      });
    }
  }

  circuitStats() {
    return this.breaker.stats();
  }

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const method = options.method ?? 'GET';
    // Retry only idempotent methods unless explicitly marked.
    const canRetry = options.idempotent ?? (method === 'GET' || method === 'PUT' || method === 'DELETE');
    const maxAttempts = canRetry ? this.maxRetries : 1;

    return this.breaker.execute(async () => {
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await this.attempt<T>(url, method, options, attempt);
        } catch (err) {
          lastError = err;

          const retryable = this.isRetryable(err);
          if (!retryable || attempt === maxAttempts) break;

          const delay = this.backoffDelay(attempt);
          logger.warn(`[${this.opts.name}] attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`, {
            integration: this.opts.name,
            method,
            status: err instanceof HttpError ? err.status : undefined,
          });
          await this.sleep(delay);
        }
      }

      throw lastError;
    });
  }

  private async attempt<T>(
    url: string,
    method: string,
    options: RequestOptions,
    attempt: number,
  ): Promise<T> {
    const timeout = options.timeoutMs ?? this.timeoutMs;
    const started = Date.now();

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.opts.defaultHeaders,
      ...options.headers,
    };
    const bodyStr = options.body === undefined
      ? undefined
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);

    // When an mTLS agent is configured, use the native https module
    // (fetch does not expose client-certificate agents). Otherwise use
    // the faster native fetch path.
    const { status, text } = this.agent
      ? await this.httpsRequest(url, method, headers, bodyStr, timeout)
      : await this.fetchRequest(url, method, headers, bodyStr, timeout);

    const elapsed = Date.now() - started;
    logger.info(`[${this.opts.name}] ${method} ${options.path} → ${status} (${elapsed}ms)`, {
      integration: this.opts.name,
      status,
      elapsedMs: elapsed,
      attempt,
    });

    const data = text ? this.parseJson(text) : undefined;

    if (status < 200 || status >= 300) {
      throw new HttpError(status, `${this.opts.name} responded ${status}`, data);
    }

    return data as T;
  }

  private async fetchRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    timeout: number,
  ): Promise<{ status: number; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      const text = await res.text();
      return { status: res.status, text };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new HttpError(408, `${this.opts.name} request timed out after ${timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private httpsRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    timeout: number,
  ): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method,
          headers,
          agent: this.agent,
          timeout,
        },
        res => {
          const chunks: Buffer[] = [];
          res.on('data', c => chunks.push(c as Buffer));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new HttpError(408, `${this.opts.name} request timed out after ${timeout}ms`));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof HttpError) return RETRYABLE_STATUS.has(err.status);
    // Network errors (ECONNRESET, ENOTFOUND, etc.) are retryable.
    return err instanceof Error && err.name !== 'HttpError';
  }

  private backoffDelay(attempt: number): number {
    // Exponential backoff with full jitter: base * 2^(n-1), randomized.
    const base = 200;
    const exp = base * Math.pow(2, attempt - 1);
    const capped = Math.min(exp, 5_000);
    return Math.floor(Math.random() * capped);
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(path.replace(/^\//, ''), this.opts.baseUrl.replace(/\/?$/, '/'));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
