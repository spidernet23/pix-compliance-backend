import winston from 'winston';
import { config } from '../config/env';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  simple()
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: config.NODE_ENV === 'production' ? prodFormat : devFormat,
  defaultMeta: { service: 'pix-compliance-api' },
  transports: [
    new winston.transports.Console(),
  ],
  // Never log passwords, tokens, or sensitive fields
  silent: false,
});

// Sanitize sensitive fields from logs
export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = new Set(['password', 'token', 'secret', 'mfaSecret', 'passwordHash', 'authorization', 'cookie']);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) =>
      SENSITIVE.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, v]
    )
  );
}
