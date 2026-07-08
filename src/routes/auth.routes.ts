import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authService } from '../services/auth.service';
import { authenticate } from '../middleware/auth.middleware';
import { validate, loginValidators, mfaValidators, refreshValidators } from '../middleware/validation.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { setRefreshCookie, clearRefreshCookie, getRefreshFromCookie } from '../utils/cookies';
import { issueCsrfToken, clearCsrfToken } from '../security/csrf';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const router = Router();

const authRateLimit = rateLimit({
  skip: () => process.env['NODE_ENV'] === 'test',
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.AUTH_RATE_LIMIT_MAX,
  message: { success: false, message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false },
});

/**
 * POST /api/auth/login
 * Step 1 — validate email + password
 */
router.post('/login', authRateLimit, loginValidators, validate, async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const result = await authService.validateCredentials(email, password, req.ip, req.headers['user-agent']);
  if (!result.valid) { sendError(res, 401, result.error ?? 'Credenciais inválidas'); return; }
  sendSuccess(res, { requiresMfa: result.requiresMfa, userId: result.userId });
});

/**
 * POST /api/auth/mfa
 * Step 2 — validate TOTP → issue JWT pair
 * Access token returned in body; refresh token set in httpOnly cookie
 */
router.post('/mfa', authRateLimit, mfaValidators, validate, async (req: Request, res: Response) => {
  const { userId, mfaToken } = req.body as { userId: string; mfaToken: string };
  const result = await authService.completeMfaAndLogin(userId, mfaToken, req.ip, req.headers['user-agent']);
  if (!result.success) { sendError(res, 401, result.error ?? 'Código MFA inválido'); return; }

  // Refresh token → httpOnly cookie; access token → body
  setRefreshCookie(res, result.tokens!.refreshToken);
  const csrfToken = issueCsrfToken(res); // anti-CSRF double-submit token
  logger.info('User logged in', { userId, ip: req.ip });

  sendSuccess(res, {
    tokens: { accessToken: result.tokens!.accessToken, expiresIn: result.tokens!.expiresIn },
    user: result.user,
    csrfToken,
  }, 'Login realizado com sucesso');
});

/**
 * POST /api/auth/refresh
 * Reads refresh token from httpOnly cookie (preferred) or body (fallback for API clients)
 */
router.post('/refresh', refreshValidators, validate, async (req: Request, res: Response) => {
  const cookieToken = getRefreshFromCookie(req);
  const bodyToken   = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  const refreshToken = cookieToken ?? bodyToken;

  if (!refreshToken) { sendError(res, 401, 'Refresh token não fornecido'); return; }

  try {
    const result = await authService.refreshTokens(refreshToken, req.ip, req.headers['user-agent']);
    setRefreshCookie(res, result.refreshToken);
    const csrfToken = issueCsrfToken(res);
    sendSuccess(res, {
      tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
      user: result.user,
      csrfToken,
    }, 'Tokens renovados');
  } catch (err: unknown) {
    clearRefreshCookie(res);
    logger.warn('Token refresh failed', { message: err instanceof Error ? err.message : '?', ip: req.ip });
    sendError(res, 401, 'Sessão expirada — faça login novamente');
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  const cookieToken = getRefreshFromCookie(req);
  const bodyToken   = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  await authService.logout(req.user!.sub, cookieToken ?? bodyToken, req.ip);
  clearRefreshCookie(res);
  clearCsrfToken(res);
  sendSuccess(res, null, 'Logout realizado com sucesso');
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  const user = authService.getMe(req.user!.sub);
  if (!user) { sendError(res, 404, 'Usuário não encontrado'); return; }
  sendSuccess(res, user);
});

export default router;
