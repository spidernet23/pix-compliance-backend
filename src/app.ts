import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { config } from './config/env';
import { logger } from './utils/logger';
import { requestId } from './middleware/auth.middleware';
import authRoutes from './routes/auth.routes';
import apiRoutes from './routes/api.routes';
import { sendError } from './utils/response';

const app = express();

// ─────────────────────────────────────────
// Security headers
// ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
}));

// ─────────────────────────────────────────
// CORS
// ─────────────────────────────────────────
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
}));

// ─────────────────────────────────────────
// Global rate limit
// ─────────────────────────────────────────
app.use(rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Muitas requisições. Tente novamente mais tarde.' },
}));

// ─────────────────────────────────────────
// Request parsing & logging
// ─────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestId);
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
  skip: (req: Request) => req.url === '/health',
}));

// ─────────────────────────────────────────
// Health check (no auth required)
// ─────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: config.APP_NAME,
    version: config.APP_VERSION,
    env: config.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────
// Routes
// ─────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// 404
app.use((_req: Request, res: Response) => {
  sendError(res, 404, 'Rota não encontrada');
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  sendError(res, 500, 'Erro interno do servidor');
});

export default app;
