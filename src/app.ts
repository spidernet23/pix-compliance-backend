import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { logger } from './utils/logger';
import { requestId, authenticate, requireRoles } from './middleware/auth.middleware';
import { metricsMiddleware, metrics } from './middleware/metrics.middleware';
import authRoutes from './routes/auth.routes';
import apiRoutes from './routes/api.routes';
import lgpdRoutes from './routes/lgpd.routes';
import { sendError } from './utils/response';
import { hardenPayload, sanitizeStrings } from './security/input-hardening';
import { csrfProtection } from './security/csrf';

const app = express();

// ─── Security headers ──────────────────────────────────────
app.disable('x-powered-by'); // don't advertise Express

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"], // Tailwind runtime styles
      imgSrc:      ["'self'", 'data:', 'https:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
      frameAncestors: ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
      upgradeInsecureRequests: config.COOKIE_SECURE ? [] : null,
    },
  },
  hsts: config.COOKIE_SECURE
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
  noSniff:    true,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hidePoweredBy: true,
  dnsPrefetchControl: { allow: false },
  ieNoOpen: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// Permissions-Policy: deny powerful features the app doesn't use.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()');
  next();
});

// ─── CORS ──────────────────────────────────────────────────
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true, // required for cookies
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
}));

// ─── Global rate limit ─────────────────────────────────────
app.use(rateLimit({
  skip: () => process.env['NODE_ENV'] === 'test',
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false },
  message: { success: false, message: 'Muitas requisições. Tente novamente em breve.' },
}));

// ─── Parsing ───────────────────────────────────────────────
// The reviver rejects prototype-pollution keys during parse itself,
// before they can reach any object graph.
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
app.use(express.json({
  limit: '10kb',
  reviver: (key, value) => {
    if (DANGEROUS_KEYS.includes(key)) {
      throw Object.assign(new Error('forbidden key'), { type: 'entity.parse.failed' });
    }
    return value;
  },
}));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser(config.COOKIE_SECRET)); // enables req.cookies
app.use(requestId);

// ─── Input hardening (post-parse, pre-handler) ─────────────
app.use(hardenPayload);   // reject prototype-pollution / nesting bombs
app.use(sanitizeStrings); // strip null bytes / control chars

// ─── Logging ───────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
  skip: (req: Request) => req.url === '/health',
}));

app.use(metricsMiddleware);

// ─── Health ────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  const uptimeSec = Math.floor(process.uptime());
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    service: config.APP_NAME,
    version: config.APP_VERSION,
    env: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptimeSec/3600)}h ${Math.floor((uptimeSec%3600)/60)}m`,
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
    },
    requests: metrics.summary().totalRequests,
  });
});

// ─── Metrics ───────────────────────────────────────────────
app.get('/metrics', authenticate, requireRoles('Admin'), (_req: Request, res: Response) => {
  res.json({ ...metrics.summary(), generatedAt: new Date().toISOString() });
});

// ─── Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/lgpd', csrfProtection, lgpdRoutes);
app.use('/api',      csrfProtection, apiRoutes);

// ─── 404 ───────────────────────────────────────────────────
app.use((_req: Request, res: Response) => sendError(res, 404, 'Rota não encontrada'));

// ─── Global error handler ──────────────────────────────────
app.use((err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // Body-parser errors: payload too large, malformed JSON.
  if (err.type === 'entity.too.large') {
    sendError(res, 413, 'Payload excede o tamanho máximo permitido');
    return;
  }
  if (err.type === 'entity.parse.failed') {
    sendError(res, 400, 'JSON malformado');
    return;
  }
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  sendError(res, 500, 'Erro interno do servidor');
});

export default app;
