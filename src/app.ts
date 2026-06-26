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

const app = express();

// ─── Security headers ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'"],
      imgSrc:     ["'self'", 'data:'],
    },
  },
  hsts: config.COOKIE_SECURE
    ? { maxAge: 31536000, includeSubDomains: true }
    : false, // only enforce HSTS in prod (requires HTTPS)
  noSniff:    true,
  frameguard: { action: 'deny' },
}));

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
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.COOKIE_SECRET)); // enables req.cookies
app.use(requestId);

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
app.use('/api/lgpd', lgpdRoutes);
app.use('/api',      apiRoutes);

// ─── 404 ───────────────────────────────────────────────────
app.use((_req: Request, res: Response) => sendError(res, 404, 'Rota não encontrada'));

// ─── Global error handler ──────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  sendError(res, 500, 'Erro interno do servidor');
});

export default app;
