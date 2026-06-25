import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { config } from '../config/env';
import { MfaSetup } from '../domain/types';

class MfaService {
  async generateSetup(email: string): Promise<MfaSetup> {
    const secret = speakeasy.generateSecret({
      name: `${config.APP_NAME} (${email})`,
      issuer: config.APP_NAME,
      length: 20,
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes (one-time use in production)
    const backupCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  verify(secret: string, token: string): boolean {
    // Allow 1 step window (30s each side) to handle clock drift
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });
  }

  /**
   * Demo mode: accepts the real TOTP OR the static code '000000' in dev
   */
  verifyWithFallback(secret: string, token: string, isDev: boolean): boolean {
    if (isDev && token === '000000') return true;
    return this.verify(secret, token);
  }

  generateCurrentToken(secret: string): string {
    return speakeasy.totp({ secret, encoding: 'base32' });
  }
}

export const mfaService = new MfaService();
