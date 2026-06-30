import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { seedIfEmpty } from '../database/store';

let adminToken: string;
let auditorToken: string;

async function login(email: string, password: string): Promise<string> {
  const l1 = await request(app).post('/api/auth/login').send({ email, password });
  if (!l1.body?.data?.userId) return '';
  const l2 = await request(app).post('/api/auth/mfa').send({ userId: l1.body.data.userId, mfaToken: '000000' });
  return l2.body?.data?.tokens?.accessToken ?? '';
}

beforeAll(async () => {
  await seedIfEmpty();
  adminToken   = await login('roberto.silva@pixcompliance.com',  'Admin@2024!Secure');
  auditorToken = await login('marcia.lima@pixcompliance.com',    'Auditor@2024!Secure');
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBeTruthy();
  });
});

describe('Compliance endpoints', () => {
  it('GET /api/compliance/scores returns 5 frameworks', async () => {
    const res = await request(app)
      .get('/api/compliance/scores')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0].score).toBeGreaterThan(0);
    expect(res.body.data[0].requirements).toBeDefined();
  });

  it('GET /api/compliance/scores requires auth', async () => {
    const res = await request(app).get('/api/compliance/scores');
    expect(res.status).toBe(401);
  });
});

describe('PIX endpoints', () => {
  it('GET /api/pix/metrics returns live metrics', async () => {
    const res = await request(app)
      .get('/api/pix/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.volumeTotal).toBeGreaterThan(0);
    expect(res.body.data.availability).toBeGreaterThan(95);
    expect(res.body.data.fraudRate).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/pix/history returns 30 entries', async () => {
    const res = await request(app)
      .get('/api/pix/history')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(30);
  });

  it('GET /api/pix/chart returns 24 hourly entries', async () => {
    const res = await request(app)
      .get('/api/pix/chart')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(24);
  });
});

describe('Security endpoints', () => {
  it('GET /api/security/layers returns 9 layers', async () => {
    const res = await request(app)
      .get('/api/security/layers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.layers).toHaveLength(9);
    expect(res.body.data.overallHealth).toBeGreaterThan(0);
  });

  it('GET /api/security/kpis returns revenue and mttr', async () => {
    const res = await request(app)
      .get('/api/security/kpis')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.revenueProtected).toBeGreaterThan(0);
    expect(res.body.data.mttr).toBeGreaterThan(0);
  });
});

describe('Incidents endpoints', () => {
  let incidentId: string;

  it('GET /api/incidents returns paginated list', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('POST /api/incidents creates new incident', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Incident', severity: 'medium', description: 'Integration test' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.status).toBe('open');
    incidentId = res.body.data.id;
  });

  it('PATCH /api/incidents/:id updates status', async () => {
    const res = await request(app)
      .patch(`/api/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('resolved');
    expect(res.body.data.resolvedAt).toBeTruthy();
  });

  it('Auditor cannot create incidents (role guard)', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ title: 'Should fail', severity: 'low' });
    expect(res.status).toBe(403);
  });
});

describe('Audit endpoints', () => {
  it('GET /api/audit/log returns paginated entries', async () => {
    const res = await request(app)
      .get('/api/audit/log')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('GET /api/audit/integrity verifies chain', async () => {
    const res = await request(app)
      .get('/api/audit/integrity')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.totalEntries).toBeGreaterThan(0);
  });

  it('Analista cannot access audit log (role guard)', async () => {
    const analistaToken = await login('ana.rodriguez@pixcompliance.com', 'Analista@2024!Secure');
    const res = await request(app)
      .get('/api/audit/log')
      .set('Authorization', `Bearer ${analistaToken}`);
    expect(res.status).toBe(403);
  });
});

describe('LGPD endpoints', () => {
  it('POST /api/lgpd/requests (public) creates request with SLA', async () => {
    const res = await request(app)
      .post('/api/lgpd/requests')
      .send({
        type: 'access',
        titularName: 'Test User',
        titularEmail: 'test@example.com',
        titularDocument: '12345678901',
        description: 'Solicito acesso aos meus dados pessoais',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.status).toBe('pending');
    const sla = new Date(res.body.data.slaDeadline);
    const diff = sla.getTime() - Date.now();
    expect(diff).toBeGreaterThan(14 * 24 * 3600 * 1000); // ≥ 14 days
  });

  it('GET /api/lgpd/requests requires auth', async () => {
    const res = await request(app).get('/api/lgpd/requests');
    expect(res.status).toBe(401);
  });

  it('GET /api/lgpd/stats returns counts', async () => {
    const res = await request(app)
      .get('/api/lgpd/stats')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(0);
    expect(res.body.data.byStatus).toBeDefined();
  });

  it('GET /api/lgpd/ropa returns ROPA entries', async () => {
    const res = await request(app)
      .get('/api/lgpd/ropa')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].legalBasis).toBeTruthy();
  });
});

describe('RBAC — role enforcement', () => {
  it('Users list requires Admin or Diretor', async () => {
    const analistaToken = await login('ana.rodriguez@pixcompliance.com', 'Analista@2024!Secure');
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${analistaToken}`);
    expect(res.status).toBe(403);
  });

  it('Executive KPIs requires Admin or Diretor', async () => {
    const analistaToken = await login('ana.rodriguez@pixcompliance.com', 'Analista@2024!Secure');
    const res = await request(app)
      .get('/api/executive/kpis')
      .set('Authorization', `Bearer ${analistaToken}`);
    expect(res.status).toBe(403);
  });
});
