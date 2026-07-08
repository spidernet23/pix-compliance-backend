import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/env';
import { sendError } from '../utils/response';

/**
 * CSRF Protection — Double-Submit Cookie (stateless, signed)
 * ═══════════════════════════════════════════════════════════════
 *
 * The refresh token lives in an httpOnly cookie, so state-changing
 * requests are theoretically CSRF-able. SameSite=Strict already blocks
 * the common cases, but defense-in-depth (and ASVS 4.2.2) calls for an
 * explicit anti-CSRF token.
 *
 * Flow:
 *   1. Server issues a random CSRF token in a NON-httpOnly cookie
 *      (readable by our SPA) plus a signed HMAC in an httpOnly cookie.
 *   2. The SPA reads the token and echoes it in the X-CSRF-Token header.
 *   3. On mutating requests, the server verifies header == cookie and
 *      that the HMAC matches — proving the caller can read our cookie
 *      (same-origin), which a cross-site attacker cannot.
 *
 * Safe methods (GET/HEAD/OPTIONS) are exempt. Bearer-only API calls
 * (no cookie) are exempt because they aren't CSRF-able.
 */

const CSRF_COOKIE = 'pix_csrf';
const CSRF_SIG_COOKIE = 'pix_csrf_sig';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sign(token: string): string {
  return crypto.createHmac('sha256', config.COOKIE_SECRET).update(token).digest('hex');
}

/** Issues a fresh CSRF token pair. Call on login and token refresh. */
export function issueCsrfToken(res: Response): string {
  const token = crypto.randomBytes(32).toString('hex');
  const signature = sign(token);

  // Readable by the SPA (not httpOnly) so it can echo it in the header.
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SECURE ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600 * 1000,
  });
  // Signature is httpOnly so an attacker can't forge a valid pair.
  res.cookie(CSRF_SIG_COOKIE, signature, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SECURE ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600 * 1000,
  });
  return token;
}

/** Clears CSRF cookies (on logout). */
export function clearCsrfToken(res: Response): void {
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  res.clearCookie(CSRF_SIG_COOKIE, { path: '/' });
}

/** Verifies the anti-CSRF token on state-changing requests. */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) { next(); return; }

  // If there's no refresh cookie, this is a pure Bearer API call — not CSRF-able.
  const hasCookieAuth = Boolean(req.cookies?.[CSRF_SIG_COOKIE] || req.cookies?.['pix_refresh']);
  if (!hasCookieAuth) { next(); return; }

  const headerToken = req.get(CSRF_HEADER);
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const cookieSig = req.cookies?.[CSRF_SIG_COOKIE];

  if (!headerToken || !cookieToken || !cookieSig) {
    sendError(res, 403, 'Token CSRF ausente');
    return;
  }

  // header must equal cookie (double-submit) …
  const tokensMatch = timingSafeEqual(headerToken, cookieToken);
  // … and the cookie must carry our valid signature (proves we issued it).
  const sigValid = timingSafeEqual(cookieSig, sign(cookieToken));

  if (!tokensMatch || !sigValid) {
    sendError(res, 403, 'Token CSRF inválido');
    return;
  }
  next();
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
