import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

/**
 * Input Hardening Middleware
 * ═══════════════════════════════════════════════════════════════
 *
 * Defends against injection-class attacks that pentests probe:
 *
 *   • Prototype pollution — keys like __proto__, constructor, prototype
 *     in JSON bodies can corrupt Object.prototype and lead to RCE/DoS.
 *   • Oversized/deeply-nested payloads — nesting bombs that exhaust CPU.
 *   • Null-byte and control-character injection in string values.
 *
 * This runs after body parsing and before any handler touches the data.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 12;
const MAX_KEYS = 500;

function scan(value: unknown, depth: number, keyCount: { n: number }): boolean {
  if (depth > MAX_DEPTH) return false;
  if (value === null || typeof value !== 'object') return true;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!scan(item, depth + 1, keyCount)) return false;
    }
    return true;
  }

  for (const key of Object.keys(value)) {
    keyCount.n++;
    if (keyCount.n > MAX_KEYS) return false;
    if (FORBIDDEN_KEYS.has(key)) return false;
    if (!scan((value as Record<string, unknown>)[key], depth + 1, keyCount)) return false;
  }
  return true;
}

/** Rejects requests whose body contains dangerous keys or nesting. */
export function hardenPayload(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    const ok = scan(req.body, 0, { n: 0 });
    if (!ok) {
      sendError(res, 400, 'Payload inválido ou potencialmente malicioso');
      return;
    }
  }
  next();
}

/** Strips null bytes and trims control chars from all string values in-place. */
export function sanitizeStrings(req: Request, _res: Response, next: NextFunction): void {
  const clean = (obj: Record<string, unknown>): void => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        // Remove null bytes and non-printable control chars (keep \n, \t).
        obj[k] = v.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        clean(v as Record<string, unknown>);
      }
    }
  };
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    clean(req.body as Record<string, unknown>);
  }
  next();
}
