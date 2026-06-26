import { describe, it, expect, beforeAll } from 'vitest';
import { tokenService } from '../services/token.service';
import { seedIfEmpty, db } from '../database/store';

let testUserId: string;

beforeAll(async () => {
  await seedIfEmpty();
  const user = db.findUserByEmail('roberto.silva@pixcompliance.com');
  testUserId = user!.id;
});

describe('TokenService', () => {
  it('generates valid token pair', () => {
    const user = db.findUserById(testUserId)!;
    const pair = tokenService.generateTokenPair(user);

    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(pair.expiresIn).toBe(3600);
  });

  it('access token contains correct payload', () => {
    const user = db.findUserById(testUserId)!;
    const pair = tokenService.generateTokenPair(user);
    const payload = tokenService.verifyAccessToken(pair.accessToken);

    expect(payload.sub).toBe(testUserId);
    expect(payload.email).toBe(user.email);
    expect(payload.role).toBe(user.role);
  });

  it('rotate issues new token pair and revokes old refresh token', () => {
    const user = db.findUserById(testUserId)!;
    const pair = tokenService.generateTokenPair(user, '127.0.0.1', 'test-agent');
    const rotated = tokenService.rotate(pair.refreshToken, '127.0.0.1', 'test-agent');

    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(pair.refreshToken);
    expect(rotated.userId).toBe(testUserId);
  });

  it('reusing a refresh token revokes the entire session family', () => {
    const user = db.findUserById(testUserId)!;
    const pair = tokenService.generateTokenPair(user);

    // First use is fine
    tokenService.rotate(pair.refreshToken);

    // Reuse triggers breach protection
    expect(() => tokenService.rotate(pair.refreshToken)).toThrow();
  });

  it('verifyAccessToken throws on invalid token', () => {
    expect(() => tokenService.verifyAccessToken('invalid.token.here')).toThrow();
  });

  it('revokeAllUserSessions marks all sessions revoked', () => {
    const user = db.findUserById(testUserId)!;
    tokenService.generateTokenPair(user);
    tokenService.generateTokenPair(user);
    tokenService.revokeAllUserSessions(testUserId);

    const sessions = [...db.sessions.values()].filter(
      s => s.userId === testUserId && !s.revoked
    );
    expect(sessions).toHaveLength(0);
  });
});
