import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authService } from '../services/auth.service';
import { authenticate } from '../middleware/auth.middleware';
import { validate, loginValidators, mfaValidators, refreshValidators } from '../middleware/validation.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const router = Router();

// Strict rate limit for auth endpoints
const authRateLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.AUTH_RATE_LIMIT_MAX,
  message: { success: false, message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false },
});

/**
 * POST /api/auth/login
 * Step 1: Validate email + password
 * Returns: { requiresMfa: true, userId } — client must call /auth/mfa next
 */
router.post('/login', authRateLimit, loginValidators, validate, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];

  const result = await authService.validateCredentials(email, password, ip, userAgent);

  if (!result.valid) {
    sendError(res, 401, result.error ?? 'Credenciais inválidas');
    return;
  }

  sendSuccess(res, {
    requiresMfa: result.requiresMfa,
    userId: result.userId,
  }, 'Credenciais válidas. Verifique o código MFA.');
});

/**
 * POST /api/auth/mfa
 * Step 2: Validate MFA token and receive JWT pair
 */
router.post('/mfa', authRateLimit, mfaValidators, validate, async (req: Request, res: Response) => {
  const { userId, mfaToken } = req.body;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];

  const result = await authService.completeMfaAndLogin(userId, mfaToken, ip, userAgent);

  if (!result.success) {
    sendError(res, 401, result.error ?? 'Código MFA inválido');
    return;
  }

  logger.info('User logged in successfully', { userId, ip });
  sendSuccess(res, { tokens: result.tokens, user: result.user }, 'Login realizado com sucesso');
});

/**
 * POST /api/auth/refresh
 * Rotate refresh token and receive new token pair
 */
router.post('/refresh', refreshValidators, validate, async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];

  try {
    const result = await authService.refreshTokens(refreshToken, ip, userAgent);
    sendSuccess(res, result, 'Tokens renovados com sucesso');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Token inválido';
    logger.warn('Token refresh failed', { message, ip });
    sendError(res, 401, 'Refresh token inválido ou expirado');
  }
});

/**
 * POST /api/auth/logout
 * Revoke current session
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  await authService.logout(req.user!.sub, refreshToken, req.ip);
  sendSuccess(res, null, 'Logout realizado com sucesso');
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  const user = authService.getMe(req.user!.sub);
  if (!user) {
    sendError(res, 404, 'Usuário não encontrado');
    return;
  }
  sendSuccess(res, user);
});

export default router;
