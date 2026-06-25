import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, Session, AuditEntry, Incident, PixAnomaly } from '../domain/types';
import { Collection, KVStore } from './file-db';
import { logger } from '../utils/logger';

// ─── Persistent collections ──────────────────────────────────
export const users        = new Collection<User>('users');
export const sessions     = new Collection<Session>('sessions');
export const auditLog     = new Collection<AuditEntry>('audit');
export const incidents    = new Collection<Incident>('incidents');
export const pixAnomalies = new Collection<PixAnomaly>('pix-anomalies');
export const usedTokens   = new KVStore('used-tokens'); // refresh token reuse guard

// ─── Backwards-compatible db facade (keeps service layer unchanged) ──
export const db = {
  // Users
  users: { // Map-like API
    set: (id: string, u: User) => users.upsert(u),
    get: (id: string) => users.findById(id),
    values: () => users.findAll(),
  },
  // Sessions
  sessions: {
    set: (id: string, s: Session) => sessions.upsert(s),
    get: (id: string) => sessions.findById(id),
    values: () => sessions.findAll(),
    forEach: (cb: (s: Session, id: string) => void) =>
      sessions.findAll().forEach(s => cb(s, s.id)),
  },
  // Audit log (append-only array interface)
  auditLog: {
    get length() { return auditLog.count(); },
    push: (e: AuditEntry) => auditLog.appendOne(e),
    [Symbol.iterator]: function*() { yield* auditLog.findAll(); },
  },
  // Incidents
  incidents: {
    set: (id: string, i: Incident) => incidents.upsert(i),
    get: (id: string) => incidents.findById(id),
    values: () => incidents.findAll(),
    forEach: (cb: (i: Incident, id: string) => void) =>
      incidents.findAll().forEach(i => cb(i, i.id)),
  },
  // PIX anomalies
  pixAnomalies: {
    set: (id: string, a: PixAnomaly) => pixAnomalies.upsert(a),
    values: () => pixAnomalies.findAll(),
  },
  // Used refresh tokens (prevent reuse)
  usedRefreshTokens: {
    add: (token: string) => usedTokens.set(token, true),
    has: (token: string) => usedTokens.has(token),
  },

  // ── Query helpers ──
  findUserByEmail: (email: string): User | undefined =>
    users.findOne(u => u.email === email),

  findUserById: (id: string): User | undefined =>
    users.findById(id),

  findSessionByRefreshToken: (token: string): Session | undefined =>
    sessions.findOne(s => s.refreshToken === token),

  revokeSessionsByUserId: (userId: string): void => {
    sessions.updateMany(s => s.userId === userId, { revoked: true } as Partial<Session>);
  },

  revokeSessionsByFamily: (tokenFamily: string): void => {
    sessions.updateMany(s => s.tokenFamily === tokenFamily, { revoked: true } as Partial<Session>);
  },

  saveSession: (session: Session): void => {
    sessions.upsert(session);
  },
};

// ─── Seed (runs only if collections are empty) ───────────────
export async function seedIfEmpty() {
  if (users.count() > 0) {
    logger.info(`Database loaded from disk (${users.count()} users, ${auditLog.count()} audit entries, ${incidents.count()} incidents)`);
    return;
  }

  logger.info('Seeding database with demo users...');

  const seeds = [
    { name: 'Roberto Silva',  email: 'roberto.silva@pixcompliance.com',  role: 'Admin'       as const, pw: 'Admin@2024!Secure',    secret: 'JBSWY3DPEHPK3PXP' },
    { name: 'Ana Rodriguez',  email: 'ana.rodriguez@pixcompliance.com',   role: 'Analista'    as const, pw: 'Analista@2024!Secure', secret: 'JBSWY3DPEHPK3PXQ' },
    { name: 'Carlos Santos',  email: 'carlos.santos@pixcompliance.com',   role: 'Diretor'     as const, pw: 'Diretor@2024!Secure',  secret: 'JBSWY3DPEHPK3PXR' },
    { name: 'Márcia Lima',    email: 'marcia.lima@pixcompliance.com',     role: 'Auditor'     as const, pw: 'Auditor@2024!Secure',  secret: 'JBSWY3DPEHPK3PXS' },
  ];

  for (const s of seeds) {
    const hash = await bcrypt.hash(s.pw, 12);
    users.insert({
      id: uuidv4(), name: s.name, email: s.email,
      passwordHash: hash, role: s.role,
      mfaEnabled: true, mfaSecret: s.secret, mfaVerified: true,
      active: true, loginAttempts: 0,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });
  }

  const incidentSeeds: Omit<Incident, 'id'>[] = [
    { title: 'Tentativa de Breach em Blockchain', description: 'Atividade suspeita na camada Hyperledger Fabric', severity: 'critical', status: 'investigating', assignee: 'SOC Team Alpha', createdAt: new Date(Date.now() - 23*60000), updatedAt: new Date(Date.now()-5*60000), slaDeadline: new Date(Date.now()+2*3600000), tags: ['blockchain','breach'] },
    { title: 'Anomalia em Transações PIX',        description: 'Volume 340% acima da média nas últimas 2h',        severity: 'high',     status: 'open',          assignee: 'PIX Security Team', createdAt: new Date(Date.now() - 60*60000), updatedAt: new Date(Date.now()-10*60000), slaDeadline: new Date(Date.now()+6*3600000), tags: ['pix','anomaly'] },
    { title: 'Falha em HSM - Nível 3',            description: 'Hardware Security Module com erro de autenticação', severity: 'high',     status: 'contained',     assignee: 'Crypto Team',       createdAt: new Date(Date.now()-120*60000), updatedAt: new Date(Date.now()-30*60000), slaDeadline: new Date(Date.now()+4*3600000), tags: ['hsm','crypto'] },
  ];

  for (const i of incidentSeeds) {
    incidents.insert({ id: uuidv4(), ...i });
  }

  const anomalySeeds: Omit<PixAnomaly, 'id'>[] = [
    { detectedAt: new Date(Date.now()-5*60000),  type: 'volume_spike', severity: 'high',   description: 'Pico de 340% nas transações PIX nas últimas 2h', affectedTransactions: 12847, status: 'investigating' },
    { detectedAt: new Date(Date.now()-45*60000), type: 'geographic',   severity: 'medium', description: 'Concentração anômala de transações na região Sul',  affectedTransactions: 3421,  status: 'open' },
  ];

  for (const a of anomalySeeds) {
    pixAnomalies.insert({ id: uuidv4(), ...a });
  }

  logger.info(`Database seeded: ${users.count()} users, ${incidents.count()} incidents`);
}
