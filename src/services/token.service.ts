import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import { JwtPayload, RefreshPayload, TokenPair, Session, User } from '../domain/types';
import { db } from '../database/store';

class TokenService {
  generateTokenPair(user: User, ip?: string, userAgent?: string): TokenPair {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN,
    } as jwt.SignOptions);

    const tokenFamily = uuidv4();
    const refreshToken = jwt.sign(
      { sub: user.id, tokenFamily } as RefreshPayload,
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
    );

    const session: Session = {
      id: uuidv4(),
      userId: user.id,
      refreshToken,
      tokenFamily,
      ip,
      userAgent,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      revoked: false,
    };

    db.saveSession(session);

    return { accessToken, refreshToken, expiresIn: 3600 };
  }

  verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
  }

  verifyRefreshToken(token: string): RefreshPayload {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshPayload;
  }

  /**
   * Refresh token rotation:
   * - Old refresh token is invalidated
   * - If a reused token is detected, the entire token family is revoked (breach protection)
   */
  rotate(refreshToken: string, ip?: string, userAgent?: string): TokenPair & { userId: string } {
    const payload = this.verifyRefreshToken(refreshToken);
    const session = db.findSessionByRefreshToken(refreshToken);

    if (!session) {
      // Token was already used — potential token theft. Revoke entire family.
      db.revokeSessionsByFamily(payload.tokenFamily);
      throw new Error('Refresh token reuse detected — all sessions revoked');
    }

    if (session.revoked) {
      db.revokeSessionsByFamily(session.tokenFamily);
      throw new Error('Revoked refresh token used — potential breach');
    }

    if (new Date() > session.expiresAt) {
      throw new Error('Refresh token expired');
    }

    // Revoke current session
    db.sessions.set(session.id, { ...session, revoked: true });
    // Mark token as used to detect reuse
    db.usedRefreshTokens.add(refreshToken);

    const user = db.findUserById(session.userId);
    if (!user || !user.active) throw new Error('User not found or inactive');

    const tokens = this.generateTokenPair(user, ip, userAgent);
    return { ...tokens, userId: user.id };
  }

  revokeAllUserSessions(userId: string): void {
    db.revokeSessionsByUserId(userId);
  }
}

export const tokenService = new TokenService();
