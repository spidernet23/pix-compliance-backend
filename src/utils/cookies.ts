/**
 * Cookie helpers for secure refresh token storage.
 *
 * Refresh tokens stored in httpOnly + SameSite=Strict cookies:
 *   - Not accessible to JavaScript (XSS protection)
 *   - SameSite=Strict prevents CSRF on same-origin forms
 *   - Secure=true enforced in production (requires HTTPS)
 *
 * The CSRF double-submit pattern is handled via the
 * X-CSRF-Token header read from a non-httpOnly cookie.
 */

import { Response, Request } from 'express';
import { config } from '../config/env';

const REFRESH_COOKIE = 'pix_refresh';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SECURE ? 'strict' : 'lax', // lax allows dev over http
    maxAge: COOKIE_MAX_AGE,
    path: '/api/auth', // only sent to auth routes
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export function getRefreshFromCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
}
