/**
 * Request metrics middleware.
 * Collects latency histograms and error counts per route.
 * Exposed at GET /metrics (Admin only) for Prometheus scraping.
 */
import { Request, Response, NextFunction } from 'express';

interface RouteMetric {
  route: string;
  method: string;
  count: number;
  errors: number;
  totalMs: number;
  p50Ms: number;
  p95Ms: number;
  latencies: number[];
}

class MetricsCollector {
  private routes = new Map<string, RouteMetric>();
  readonly startTime = Date.now();

  record(method: string, route: string, statusCode: number, durationMs: number) {
    const key = `${method} ${route}`;
    let m = this.routes.get(key);
    if (!m) {
      m = { route, method, count: 0, errors: 0, totalMs: 0, p50Ms: 0, p95Ms: 0, latencies: [] };
      this.routes.set(key, m);
    }
    m.count++;
    m.totalMs += durationMs;
    if (statusCode >= 400) m.errors++;

    // Keep last 1000 latencies for percentile calculation
    m.latencies.push(durationMs);
    if (m.latencies.length > 1000) m.latencies.shift();

    const sorted = [...m.latencies].sort((a, b) => a - b);
    m.p50Ms = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    m.p95Ms = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  }

  summary() {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      routes: [...this.routes.values()].map(m => ({
        route: `${m.method} ${m.route}`,
        requests: m.count,
        errors: m.errors,
        errorRate: m.count > 0 ? ((m.errors / m.count) * 100).toFixed(2) + '%' : '0%',
        avgMs: m.count > 0 ? Math.round(m.totalMs / m.count) : 0,
        p50Ms: m.p50Ms,
        p95Ms: m.p95Ms,
      })),
      totalRequests: [...this.routes.values()].reduce((a, m) => a + m.count, 0),
      totalErrors:   [...this.routes.values()].reduce((a, m) => a + m.errors, 0),
    };
  }
}

export const metrics = new MetricsCollector();

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const route = (req.route?.path as string | undefined) ?? req.path;
    metrics.record(req.method, route, res.statusCode, Date.now() - start);
  });
  next();
}
