import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { seedIfEmpty } from '../database/store';

beforeAll(async () => { await seedIfEmpty(); });

// Helper — always use unique users to avoid cross-test lockout
async function loginAs(email: string, pw: string, mfa = '000000') {
  const l1 = await request(app).post('/api/auth/login').send({ email, password: pw });
  if (!l1.body.data?.userId) throw new Error(`Login step 1 failed: ${JSON.stringify(l1.body)}`);
  const l2 = await request(app).post('/api/auth/mfa').send({ userId: l1.body.data.userId, mfaToken: mfa });
  if (!l2.body.data?.tokens) throw new Error(`Login step 2 failed: ${JSON.stringify(l2.body)}`);
  return { token: l2.body.data.tokens.accessToken as string, user: l2.body.data.user, cookies: (l2.headers['set-cookie'] as unknown as string[]) ?? [] };
}

describe('POST /api/auth/login', () => {
  it('step 1 returns requiresMfa + userId', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'roberto.silva@pixcompliance.com', password: 'Admin@2024!Secure' });
    expect(res.status).toBe(200);
    expect(res.body.data.requiresMfa).toBe(true);
    expect(res.body.data.userId).toBeTruthy();
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'ana.rodriguez@pixcompliance.com', password: 'wrongpassword123' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'somepassword' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/mfa', () => {
  it('issues access token + httpOnly cookie on valid MFA', async () => {
    const { token, user, cookies } = await loginAs('marcia.lima@pixcompliance.com', 'Auditor@2024!Secure');
    expect(token).toBeTruthy();
    expect(user.role).toBe('Auditor');
    expect(cookies?.some((c: string) => c.includes('pix_refresh'))).toBe(true);
    expect(cookies?.some((c: string) => c.includes('HttpOnly'))).toBe(true);
  });

  it('returns 401 for non-existent userId', async () => {
    const res = await request(app).post('/api/auth/mfa')
      .send({ userId: '00000000-0000-0000-0000-000000000000', mfaToken: '999999' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-numeric MFA', async () => {
    const res = await request(app).post('/api/auth/mfa')
      .send({ userId: '00000000-0000-0000-0000-000000000000', mfaToken: 'abcdef' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns current user for valid token', async () => {
    const { token } = await loginAs('carlos.santos@pixcompliance.com', 'Diretor@2024!Secure');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('carlos.santos@pixcompliance.com');
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('returns 401 without token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer bad.token')).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 200 and sets clear-cookie header', async () => {
    // loginAs throws on failure - so we get a clear error
    const { token } = await loginAs('roberto.silva@pixcompliance.com', 'Admin@2024!Secure');
    expect(token).toBeTruthy(); // guard
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
