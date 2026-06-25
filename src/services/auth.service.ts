import bcrypt from 'bcryptjs';
import { db } from '../database/store';
import { tokenService } from './token.service';
import { mfaService } from './mfa.service';
import { auditService } from './audit.service';
import { isDev } from '../config/env';
import { TokenPair, User, UserPublic } from '../domain/types';
import { logger } from '../utils/logger';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface LoginResult {
  requiresMfa: boolean;
  mfaToken?: string; // Temporary token to proceed to MFA step
  tokens?: TokenPair;
  user?: UserPublic;
}

class AuthService {
  private toPublic(user: User): UserPublic {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      mfaVerified: user.mfaVerified,
      active: user.active,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    };
  }

  private isLocked(user: User): boolean {
    if (!user.lockedUntil) return false;
    return new Date() < user.lockedUntil;
  }

  private resetAttempts(user: User): void {
    user.loginAttempts = 0;
    user.lockedUntil = undefined;
    user.updatedAt = new Date();
    db.users.set(user.id, user);
  }

  private incrementAttempts(user: User, ip?: string): void {
    user.loginAttempts++;
    if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      logger.warn('Account locked due to too many failed attempts', {
        email: user.email,
        ip,
        attempts: user.loginAttempts,
      });
      auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: 'ACCOUNT_LOCKED',
        ip,
        status: 'WARNING',
        details: { attempts: user.loginAttempts },
      });
    }
    user.updatedAt = new Date();
    db.users.set(user.id, user);
  }

  /**
   * Step 1: Validate email + password
   * Returns requiresMfa: true if MFA is enabled (always for this system)
   */
  async validateCredentials(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ valid: boolean; userId?: string; requiresMfa: boolean; error?: string }> {
    const user = db.findUserByEmail(email.toLowerCase().trim());

    if (!user || !user.active) {
      // Always take same amount of time to prevent user enumeration
      await bcrypt.compare(password, '$2a$12$notarealhashjustpadding00000000000000000000000');
      return { valid: false, requiresMfa: false, error: 'Credenciais inválidas' };
    }

    if (this.isLocked(user)) {
      const remainingMs = user.lockedUntil!.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN_FAILED',
        ip,
        status: 'FAILURE',
        details: { reason: 'account_locked', remainingMin },
      });
      return { valid: false, requiresMfa: false, error: `Conta bloqueada. Tente novamente em ${remainingMin} minutos.` };
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      this.incrementAttempts(user, ip);
      auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN_FAILED',
        ip,
        userAgent,
        status: 'FAILURE',
        details: { reason: 'invalid_password', attempts: user.loginAttempts },
      });
      return { valid: false, requiresMfa: false, error: 'Credenciais inválidas' };
    }

    return { valid: true, userId: user.id, requiresMfa: true };
  }

  /**
   * Step 2: Validate MFA token and issue JWT pair
   */
  async completeMfaAndLogin(
    userId: string,
    mfaToken: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ success: boolean; tokens?: TokenPair; user?: UserPublic; error?: string }> {
    const user = db.findUserById(userId);
    if (!user || !user.active) {
      return { success: false, error: 'Sessão expirada, faça login novamente' };
    }

    if (!user.mfaSecret) {
      return { success: false, error: 'MFA não configurado para este usuário' };
    }

    const mfaValid = mfaService.verifyWithFallback(user.mfaSecret, mfaToken, isDev);

    if (!mfaValid) {
      this.incrementAttempts(user, ip);
      auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: 'MFA_FAILED',
        ip,
        userAgent,
        status: 'FAILURE',
        details: { attempts: user.loginAttempts },
      });
      return { success: false, error: 'Código MFA inválido ou expirado' };
    }

    // Successful login
    this.resetAttempts(user);
    user.lastLogin = new Date();
    db.users.set(user.id, user);

    const tokens = tokenService.generateTokenPair(user, ip, userAgent);

    auditService.log({
      userId: user.id,
      userEmail: user.email,
      action: 'LOGIN_SUCCESS',
      ip,
      userAgent,
      status: 'SUCCESS',
      details: { role: user.role, mfaMethod: 'TOTP' },
    });

    return { success: true, tokens, user: this.toPublic(user) };
  }

  async refreshTokens(
    refreshToken: string,
    ip?: string,
    userAgent?: string
  ): Promise<TokenPair & { user: UserPublic }> {
    const result = tokenService.rotate(refreshToken, ip, userAgent);
    const user = db.findUserById(result.userId)!;

    auditService.log({
      userId: user.id,
      userEmail: user.email,
      action: 'TOKEN_REFRESH',
      ip,
      userAgent,
      status: 'SUCCESS',
    });

    const { userId: _userId, ...tokens } = result;
    return { ...tokens, user: this.toPublic(user) };
  }

  async logout(userId: string, refreshToken?: string, ip?: string): Promise<void> {
    if (refreshToken) {
      const session = db.findSessionByRefreshToken(refreshToken);
      if (session) {
        db.sessions.set(session.id, { ...session, revoked: true });
      }
    }
    const user = db.findUserById(userId);
    auditService.log({
      userId,
      userEmail: user?.email,
      action: 'LOGOUT',
      ip,
      status: 'SUCCESS',
    });
  }

  getMe(userId: string): UserPublic | null {
    const user = db.findUserById(userId);
    if (!user) return null;
    return this.toPublic(user);
  }
}

export const authService = new AuthService();
