import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(5),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  APP_NAME: z.string().default('Pix Compliance AaaS'),
  APP_VERSION: z.string().default('7.0.0'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  COOKIE_SECURE: z.string().transform(v => v === 'true').default(false),

  // ── BACEN PIX API integration (optional) ──
  // When all required vars are present, the real connector activates.
  // When absent, the platform uses the demo provider and reports the
  // integration as "not connected".
  BACEN_PIX_BASE_URL: z.string().optional(),
  BACEN_PIX_TOKEN_URL: z.string().optional(),
  BACEN_PIX_CLIENT_ID: z.string().optional(),
  BACEN_PIX_CLIENT_SECRET: z.string().optional(),
  BACEN_PIX_ISPB: z.string().optional(),
  BACEN_PIX_SCOPE: z.string().optional(),
  BACEN_PIX_CERT: z.string().optional(),
  BACEN_PIX_KEY: z.string().optional(),
  BACEN_PIX_CA: z.string().optional(),
  BACEN_PIX_KEY_PASSPHRASE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach(i => console.error(`  ${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}

export const config = parsed.data;
export const isDev  = config.NODE_ENV === 'development' || config.NODE_ENV === 'test';
export const isProd = config.NODE_ENV === 'production';
