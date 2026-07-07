import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { seedIfEmpty } from '../database/store';

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
 * These tests lock in DATA HONESTY. A compliance product must never
 * present synthetic data as real. Every endpoint must correctly
 * declare its provenance via the `meta` envelope field.
 */
describe('Data provenance — REAL endpoints', () => {
  const realEndpoints = [
    '/api/incidents',
    '/api/audit/log',
    '/api/audit/integrity',
    '/api/users',
    '/api/users/sessions',
    '/api/settings',
    '/api/integrations/status',
  ];

  it.each(realEndpoints)('%s declares source=real', async (path) => {
    const res = await request(app).get(path).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.source).toBe('real');
  });
});

describe('Data provenance — DEMO endpoints', () => {
  const demoEndpoints = [
    '/api/compliance/scores',
    '/api/compliance/overview',
    '/api/pix/metrics',
    '/api/pix/anomalies',
    '/api/pix/history',
    '/api/pix/chart',
    '/api/security/layers',
    '/api/security/kpis',
    '/api/security/threats',
    '/api/executive/kpis',
    '/api/executive/risk-trends',
    '/api/executive/reports',
    '/api/automation/stats',
    '/api/automation/insights',
  ];

  it.each(demoEndpoints)('%s declares source=demo with an integration', async (path) => {
    const res = await request(app).get(path).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.source).toBe('demo');
    // Demo data must name the integration that would supply real data
    expect(res.body.meta.integration).toBeTruthy();
    expect(res.body.meta.connected).toBe(false); // nothing connected yet
    expect(res.body.meta.note).toContain('demonstrativo');
  });
});

describe('Integrations status — honest reporting', () => {
  it('reports all integrations as not connected', async () => {
    const res = await request(app).get('/api/integrations/status').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const integrations = res.body.data as Array<{ connected: boolean; name: string }>;
    expect(integrations.length).toBeGreaterThan(0);
    // Every integration must honestly report connected=false
    integrations.forEach(i => expect(i.connected).toBe(false));
  });
});
