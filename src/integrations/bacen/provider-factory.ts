import { PixDataProvider } from './pix-provider';
import { BacenPixConnector, BacenPixConfig } from './bacen-pix-connector';
import { DemoPixProvider } from './demo-pix-provider';
import { logger } from '../../utils/logger';

/**
 * PIX Provider Factory
 * ═══════════════════════════════════════════════════════════════
 *
 * Decides — at startup — whether the platform has everything needed to
 * talk to the real BACEN PIX API. If all required config + certificate
 * material is present, it wires the real connector. Otherwise it falls
 * back to the demo provider and the platform honestly reports the
 * BACEN integration as "not connected".
 *
 * This is the single seam a customer configures to go live.
 */

function readBacenConfig(): BacenPixConfig | null {
  const {
    BACEN_PIX_BASE_URL,
    BACEN_PIX_TOKEN_URL,
    BACEN_PIX_CLIENT_ID,
    BACEN_PIX_CLIENT_SECRET,
    BACEN_PIX_ISPB,
    BACEN_PIX_CERT,
    BACEN_PIX_KEY,
    BACEN_PIX_CA,
    BACEN_PIX_KEY_PASSPHRASE,
    BACEN_PIX_SCOPE,
  } = process.env;

  const required = {
    BACEN_PIX_BASE_URL,
    BACEN_PIX_TOKEN_URL,
    BACEN_PIX_CLIENT_ID,
    BACEN_PIX_CLIENT_SECRET,
    BACEN_PIX_ISPB,
    BACEN_PIX_CERT,
    BACEN_PIX_KEY,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v || v.trim() === '')
    .map(([k]) => k);

  if (missing.length > 0) {
    logger.info('[bacen-factory] real BACEN PIX config incomplete → using demo provider', {
      missing,
    });
    return null;
  }

  return {
    baseUrl: BACEN_PIX_BASE_URL!,
    tokenUrl: BACEN_PIX_TOKEN_URL!,
    clientId: BACEN_PIX_CLIENT_ID!,
    clientSecret: BACEN_PIX_CLIENT_SECRET!,
    ispb: BACEN_PIX_ISPB!,
    scope: BACEN_PIX_SCOPE,
    mtls: {
      // Certificates may be provided inline (PEM) or as base64 to survive env vars.
      cert: decodePem(BACEN_PIX_CERT!),
      key: decodePem(BACEN_PIX_KEY!),
      ca: BACEN_PIX_CA ? decodePem(BACEN_PIX_CA) : undefined,
      passphrase: BACEN_PIX_KEY_PASSPHRASE,
    },
  };
}

/** Accepts raw PEM or base64-encoded PEM (common in secret stores). */
function decodePem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('-----BEGIN')) return trimmed;
  try {
    return Buffer.from(trimmed, 'base64').toString('utf8');
  } catch {
    return trimmed;
  }
}

let cached: PixDataProvider | null = null;

export function getPixProvider(): PixDataProvider {
  if (cached) return cached;

  const config = readBacenConfig();
  if (config) {
    logger.info('[bacen-factory] real BACEN PIX API connector active', { ispb: config.ispb });
    cached = new BacenPixConnector(config);
  } else {
    cached = new DemoPixProvider();
  }
  return cached;
}

/** For tests: reset the memoized provider. */
export function resetPixProvider(): void {
  cached = null;
}
