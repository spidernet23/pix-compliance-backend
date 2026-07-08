import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { seedIfEmpty } from '../database/store';
import { validatePassword } from '../security/password-policy';

let adminToken: string;

async function login(email: string, password: string): Promise<string> {
  const l1 = await request(app).post('/api/auth/login').send({ email, password });
  const l2 = await request(app).post('/api/auth/mfa').send({ userId: l1.body.data.userId, mfaToken: '000000' });
  return l2.body.data.tokens.accessToken;
}

beforeAll(async () => {
  await seedIfEmpty();
  adminToken = await login('roberto.silva@pixcompliance.com', 'Admin@2024!Secure');
});

/**
 * Security regression tests. These lock in defenses against the vectors
 * a penetration test probes: injection, prototype pollution, security
 * headers, account enumeration, and authorization bypass.
 */

describe('Security headers', () => {
  it('sets strict security headers and hides framework fingerprint', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['permissions-policy']).toContain('geolocation=()');
  });
});

describe('Prototype pollution defense', () => {
  it('rejects a raw JSON body containing __proto__', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send('{"title":"x","severity":"low","__proto__":{"polluted":true}}');
    expect(res.status).toBe(400);
  });

  it('rejects a body with constructor.prototype nesting', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(JSON.parse('{"title":"x","severity":"low","constructor":{"prototype":{"x":1}}}'));
    expect(res.status).toBe(400);
  });

  it('did not pollute Object.prototype', () => {
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('Authentication & authorization', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered/garbage bearer token', async () => {
    const res = await request(app).get('/api/users').set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('enforces role-based access (Analista cannot list users)', async () => {
    const analistaToken = await login('ana.rodriguez@pixcompliance.com', 'Analista@2024!Secure');
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${analistaToken}`);
    expect(res.status).toBe(403);
  });

  it('never leaks passwordHash or mfaSecret', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('mfaSecret');
    expect(body).not.toContain('$2a$'); // bcrypt hash prefix
  });
});

describe('Account enumeration resistance', () => {
  it('returns the same generic error for unknown and known emails', async () => {
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@nowhere.com', password: 'whatever123!' });
    const known = await request(app).post('/api/auth/login').send({ email: 'roberto.silva@pixcompliance.com', password: 'WrongPassword123!' });
    // Both must fail with the same generic message — no "user not found" leak.
    expect(unknown.body.message).toBe(known.body.message);
    expect(unknown.body.message).toContain('inválid');
  });
});

describe('Input size limits', () => {
  it('rejects oversized JSON bodies', async () => {
    const huge = 'a'.repeat(20 * 1024); // 20kb > 10kb limit
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: huge, severity: 'low' });
    expect(res.status).toBe(413);
  });
});

describe('Password policy (ASVS 2.1)', () => {
  it('rejects short passwords', () => {
    expect(validatePassword('Abc1!').valid).toBe(false);
  });
  it('requires all character classes', () => {
    expect(validatePassword('alllowercase123').valid).toBe(false);
    expect(validatePassword('ALLUPPERCASE123!').valid).toBe(false);
  });
  it('rejects common passwords', () => {
    expect(validatePassword('Password123!').errors.some(e => e.includes('comum'))).toBe(true);
  });
  it('rejects passwords containing the email local-part', () => {
    const check = validatePassword('Roberto2024!!', 'roberto@x.com');
    expect(check.valid).toBe(false);
  });
  it('accepts a strong password', () => {
    expect(validatePassword('Tr0ub4dour&Xk9z').valid).toBe(true);
  });
  it('rejects repeated character runs', () => {
    expect(validatePassword('Aaaa1111!!!!bbbb').valid).toBe(false);
  });
});
