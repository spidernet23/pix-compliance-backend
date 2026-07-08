import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.middleware';
import { auditService } from '../services/audit.service';
import { db } from '../database/store';
import { sendSuccess, sendPaginated, sendError } from '../utils/response';
import { v4 as uuidv4 } from 'uuid';
import { Incident, IncidentSeverity, IncidentStatus } from '../domain/types';
import { KVStore } from '../database/file-db';
import { realMeta, demoMeta, integrationStatus } from '../domain/data-source';
import { getPixProvider } from '../integrations/bacen/provider-factory';
import {
  getFraudProvider, getSiemProvider, getBusinessProvider, getTxDbProvider,
} from '../integrations/registry';

const router = Router();

router.use(authenticate);

/**
 * DATA PROVENANCE — every response carries a `meta` field on its envelope
 * declaring whether `data` is 'real' (produced & persisted here) or 'demo'
 * (illustrative, would come from an external integration not yet connected).
 * The frontend renders a visible badge on demo data. This is a compliance
 * product: nobody may ever be misled about what is live.
 */

// ── INTEGRATIONS — honest connection status (REAL) ──
router.get('/integrations/status', async (_req: Request, res: Response) => {
  const status = await integrationStatus();
  sendSuccess(res, status, undefined, 200,
    realMeta('Status real das integrações, verificado ao vivo.'));
});

// ── COMPLIANCE (DEMO) ──
router.get('/compliance/scores', (req: Request, res: Response) => {
  const scores = [
    { framework: 'LGPD',       score: 98.7, status: 'compliant', requirements: { total: 12, met: 12 }, lastAudit: new Date('2024-01-15'), nextReview: new Date('2024-04-15') },
    { framework: 'PCI_DSS',    score: 96.5, status: 'compliant', requirements: { total: 8,  met: 8  }, lastAudit: new Date('2024-01-10'), nextReview: new Date('2024-04-10') },
    { framework: 'BACEN_4893', score: 94.2, status: 'review',    requirements: { total: 15, met: 14 }, lastAudit: new Date('2024-01-05'), nextReview: new Date('2024-04-05') },
    { framework: 'ISO_27001',  score: 91.8, status: 'compliant', requirements: { total: 20, met: 19 }, lastAudit: new Date('2024-01-08'), nextReview: new Date('2024-07-08') },
    { framework: 'NIST',       score: 97.1, status: 'compliant', requirements: { total: 23, met: 23 }, lastAudit: new Date('2024-01-12'), nextReview: new Date('2024-04-12') },
  ];
  auditService.log({ userId: req.user!.sub, userEmail: req.user!.email, action: 'DATA_ACCESS', resource: 'compliance/scores', ip: req.ip });
  sendSuccess(res, scores, undefined, 200, demoMeta('business-metrics'));
});

router.get('/compliance/overview', (_req: Request, res: Response) => {
  sendSuccess(res, {
    overallScore: 95.8, trend: 'up', lastUpdated: new Date(), activeAlerts: 2, upcomingReviews: 3,
    recentChanges: [
      { date: new Date(Date.now() - 86400000),  framework: 'BACEN_4893', change: '+1.2%', description: 'Controle 4.2.1 implementado' },
      { date: new Date(Date.now() - 172800000), framework: 'LGPD',       change: '+0.5%', description: 'Portal do Titular atualizado' },
    ],
  }, undefined, 200, demoMeta('business-metrics'));
});

// ── PIX MONITORING (real if BACEN connected, else demo) ──
router.get('/pix/metrics', async (_req: Request, res: Response) => {
  const provider = getPixProvider();
  const health = await provider.health();
  const metrics = await provider.getMetrics();
  const meta = health.connected
    ? realMeta('Dados reais agregados da API PIX do BACEN.')
    : demoMeta('bacen-pix-api');
  sendSuccess(res, metrics, undefined, 200, meta);
});

router.get('/pix/anomalies', async (_req: Request, res: Response) => {
  const fraud = getFraudProvider();
  const health = await fraud.health();
  const anomalies = await fraud.listAnomalies();
  const meta = health.connected ? realMeta('Anomalias reais do motor de fraude.') : demoMeta('ml-fraud-engine');
  sendPaginated(res, anomalies, anomalies.length, 1, 50, meta);
});

// ── PIX received transactions (real if connected) ──
router.get('/pix/received', async (req: Request, res: Response) => {
  const provider = getPixProvider();
  const health = await provider.health();
  const fim = req.query['fim'] ? String(req.query['fim']) : new Date().toISOString();
  const inicio = req.query['inicio'] ? String(req.query['inicio']) : new Date(Date.now() - 24 * 3600_000).toISOString();
  const page = parseInt(String(req.query['page'] ?? 0));

  try {
    const { transactions, total } = await provider.listReceived({ inicio, fim, page });
    const meta = health.connected
      ? realMeta('Transações PIX reais recebidas via API BACEN.')
      : demoMeta('bacen-pix-api');
    sendSuccess(res, { transactions, total }, undefined, 200, meta);
  } catch (err) {
    sendError(res, 502, `Falha ao consultar API PIX: ${err instanceof Error ? err.message : 'erro'}`);
  }
});

// ── BACEN integration health (circuit breaker diagnostics) ──
router.get('/integrations/bacen/health', requireRoles('Admin', 'Diretor'), async (_req: Request, res: Response) => {
  const health = await getPixProvider().health();
  sendSuccess(res, health, undefined, 200, realMeta('Diagnóstico real da conexão BACEN.'));
});

router.get('/pix/history', async (_req: Request, res: Response) => {
  const txdb = getTxDbProvider();
  const health = await txdb.health();
  const history = await txdb.getHistory(30);
  const meta = health.connected ? realMeta('Histórico real da base de transações.') : demoMeta('transaction-db');
  sendSuccess(res, history, undefined, 200, meta);
});

router.get('/pix/chart', (_req: Request, res: Response) => {
  const now = new Date();
  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = new Date(now); h.setHours(i, 0, 0, 0);
    const isPeak = i >= 8 && i <= 20; const base = isPeak ? 350 : 90;
    return { time: `${String(i).padStart(2, '0')}:00`, volume: Math.floor(base + Math.random() * base * 0.4), value: Math.floor((base + Math.random() * base * 0.4) * 20000) };
  });
  sendSuccess(res, hours, undefined, 200, demoMeta('bacen-pix-api'));
});

// ── SECURITY CENTER (real if SIEM connected, else demo) ──
router.get('/security/layers', async (_req: Request, res: Response) => {
  const siem = getSiemProvider();
  const health = await siem.health();
  const snapshot = await siem.getSecuritySnapshot();
  const meta = health.connected ? realMeta('Dados reais do SIEM.') : demoMeta('siem');
  sendSuccess(res, snapshot, undefined, 200, meta);
});

router.get('/security/kpis', async (_req: Request, res: Response) => {
  const biz = getBusinessProvider();
  const fraud = getFraudProvider();
  const [bizHealth, kpis, stats] = await Promise.all([biz.health(), biz.getKpis(), fraud.getStats()]);
  const meta = bizHealth.connected ? realMeta('KPIs reais das métricas de negócio.') : demoMeta('business-metrics');
  sendSuccess(res, {
    revenueProtected: kpis.revenueProtected,
    complianceScore: kpis.complianceScore,
    activeUsers: kpis.activeUsers,
    riskIncidents: 3,
    roi: kpis.securityRoi,
    mttr: kpis.mttrMinutes,
    falsePositiveRate: stats.falsePositiveRate,
    lastUpdated: new Date(),
  }, undefined, 200, meta);
});

router.get('/security/threats', async (_req: Request, res: Response) => {
  const siem = getSiemProvider();
  const health = await siem.health();
  const threats = await siem.listThreats();
  const meta = health.connected ? realMeta('Ameaças reais do SIEM.') : demoMeta('siem');
  const blocked = threats.filter(t => t.blocked).length;
  sendSuccess(res, {
    totalDetected: threats.length,
    totalBlocked: blocked,
    blockRate: threats.length ? Math.round(blocked / threats.length * 1000) / 10 : 100,
    activeThreats: threats.filter(t => !t.blocked).length,
    lastUpdated: new Date(),
    recentThreats: threats.map(t => ({
      id: t.id, type: t.type, severity: t.severity, source: t.source,
      blockedAt: t.detectedAt, layer: t.layer, blocked: t.blocked,
    })),
  }, undefined, 200, meta);
});

// ── INCIDENTS (REAL — persisted, audit-logged) ──
router.get('/incidents', (_req: Request, res: Response) => {
  const page = parseInt(String(_req.query['page'] ?? 1));
  const limit = parseInt(String(_req.query['limit'] ?? 20));
  const all = [...db.incidents.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const paginated = all.slice((page - 1) * limit, page * limit);
  sendPaginated(res, paginated, all.length, page, limit, realMeta('Incidentes persistidos com trilha de auditoria.'));
});

router.get('/incidents/:id', (req: Request, res: Response) => {
  const incident = db.incidents.get(req.params['id'] as string);
  if (!incident) { sendError(res, 404, 'Incidente não encontrado'); return; }
  sendSuccess(res, incident, undefined, 200, realMeta());
});

router.post('/incidents', requireRoles('Admin', 'Diretor', 'Analista'), (req: Request, res: Response) => {
  const { title, description, severity, assignee, tags } = req.body;
  if (!title || !severity) { sendError(res, 400, 'title e severity são obrigatórios'); return; }
  const incident: Incident = {
    id: uuidv4(), title, description: description ?? '', severity: severity as IncidentSeverity, status: 'open',
    assignee, tags: tags ?? [], createdAt: new Date(), updatedAt: new Date(), slaDeadline: new Date(Date.now() + 8 * 3600000),
  };
  db.incidents.set(incident.id, incident);
  auditService.log({ userId: req.user!.sub, userEmail: req.user!.email, action: 'INCIDENT_CREATED', resource: `incident/${incident.id}`, ip: req.ip, details: { title, severity }, status: 'SUCCESS' });
  sendSuccess(res, incident, 'Incidente criado', 201, realMeta());
});

router.patch('/incidents/:id', requireRoles('Admin', 'Diretor', 'Analista'), (req: Request, res: Response) => {
  const incident = db.incidents.get(req.params['id'] as string);
  if (!incident) { sendError(res, 404, 'Incidente não encontrado'); return; }
  const { status, assignee, description } = req.body;
  const updated: Incident = {
    ...incident, status: (status as IncidentStatus) ?? incident.status, assignee: assignee ?? incident.assignee,
    description: description ?? incident.description, updatedAt: new Date(),
    resolvedAt: status === 'resolved' || status === 'closed' ? new Date() : incident.resolvedAt,
  };
  db.incidents.set(updated.id, updated);
  auditService.log({ userId: req.user!.sub, userEmail: req.user!.email, action: 'INCIDENT_UPDATED', resource: `incident/${incident.id}`, ip: req.ip, details: { status, assignee }, status: 'SUCCESS' });
  sendSuccess(res, updated, 'Incidente atualizado', 200, realMeta());
});

// ── AUDIT LOG (REAL — SHA-256 chained) ──
router.get('/audit/log', requireRoles('Admin', 'Auditor', 'Diretor'), (req: Request, res: Response) => {
  const page = parseInt(String(req.query['page'] ?? 1));
  const limit = Math.min(parseInt(String(req.query['limit'] ?? 50)), 200);
  const offset = (page - 1) * limit;
  const entries = auditService.getAll(limit, offset);
  const total = db.auditLog.length;
  auditService.log({ userId: req.user!.sub, userEmail: req.user!.email, action: 'DATA_ACCESS', resource: 'audit/log', ip: req.ip });
  sendPaginated(res, entries, total, page, limit, realMeta('Trilha de auditoria imutável com hash SHA-256 encadeado.'));
});

router.get('/audit/integrity', requireRoles('Admin', 'Auditor'), (_req: Request, res: Response) => {
  const result = auditService.verifyIntegrity();
  sendSuccess(res, { ...result, totalEntries: db.auditLog.length, checkedAt: new Date() }, undefined, 200, realMeta('Verificação criptográfica real da cadeia de auditoria.'));
});

// ── USERS (REAL) ──
router.get('/users', requireRoles('Admin', 'Diretor'), (_req: Request, res: Response) => {
  const users = [...db.users.values()].map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, mfaEnabled: u.mfaEnabled, lastLogin: u.lastLogin, createdAt: u.createdAt }));
  sendSuccess(res, users, undefined, 200, realMeta('Usuários reais persistidos no sistema.'));
});

router.get('/users/sessions', requireRoles('Admin', 'Diretor'), (_req: Request, res: Response) => {
  const allSessions = [...db.sessions.values()].filter(s => !s.revoked && new Date() < s.expiresAt).map(s => {
    const user = db.findUserById(s.userId);
    return { id: s.id, userId: s.userId, userName: user?.name ?? 'Unknown', userEmail: user?.email ?? '', userRole: user?.role ?? '', ip: s.ip ?? '—', userAgent: s.userAgent ?? '—', createdAt: s.createdAt, expiresAt: s.expiresAt, risk: s.ip?.startsWith('192.168') ? 'low' : 'medium' };
  });
  sendSuccess(res, allSessions, undefined, 200, realMeta('Sessões reais ativas no sistema.'));
});

// ── EXECUTIVE (real if business-metrics connected, else demo) ──
router.get('/executive/kpis', requireRoles('Admin', 'Diretor'), async (_req: Request, res: Response) => {
  const biz = getBusinessProvider();
  const health = await biz.health();
  const k = await biz.getKpis();
  const meta = health.connected ? realMeta('KPIs executivos reais.') : demoMeta('business-metrics');
  sendSuccess(res, {
    revenueProtected:  { value: k.revenueProtected, trend: '+12%',  label: 'Receita Protegida' },
    complianceScore:   { value: k.complianceScore,  trend: '+1.2%', label: 'Score Compliance' },
    activeUsers:       { value: k.activeUsers,      trend: '+5.3%', label: 'Usuários Ativos' },
    securityROI:       { value: k.securityRoi,      trend: '+23%',  label: 'ROI Segurança (%)' },
    incidentsResolved: { value: k.incidentsResolvedPct, trend: '+0.8%', label: 'Incidentes Resolvidos (%)' },
    mttr:              { value: k.mttrMinutes,      trend: '-30s',  label: 'MTTR (min)' },
    lastUpdated: new Date(),
  }, undefined, 200, meta);
});

router.get('/executive/risk-trends', requireRoles('Admin', 'Diretor'), async (_req: Request, res: Response) => {
  const biz = getBusinessProvider();
  const health = await biz.health();
  const trends = await biz.getRiskTrends(30);
  const meta = health.connected ? realMeta('Tendências de risco reais.') : demoMeta('business-metrics');
  sendSuccess(res, trends, undefined, 200, meta);
});

router.get('/executive/reports', requireRoles('Admin', 'Diretor', 'Auditor'), (_req: Request, res: Response) => {
  sendSuccess(res, [
    { id: '1', name: 'Relatório LGPD — Junho 2026', type: 'LGPD',       status: 'ready',   generatedAt: new Date(Date.now()-2*86400000),  size: '2.4 MB', pages: 48 },
    { id: '2', name: 'Compliance Summary Q2 2026',  type: 'Executive',  status: 'ready',   generatedAt: new Date(Date.now()-5*86400000),  size: '1.8 MB', pages: 32 },
    { id: '3', name: 'BACEN 4893 — Evidências',     type: 'Regulatory', status: 'ready',   generatedAt: new Date(Date.now()-7*86400000),  size: '5.1 MB', pages: 96 },
    { id: '4', name: 'PCI DSS Audit — Q2 2026',     type: 'PCI',        status: 'ready',   generatedAt: new Date(Date.now()-10*86400000), size: '3.2 MB', pages: 61 },
    { id: '5', name: 'Relatório LGPD — Julho 2026', type: 'LGPD',       status: 'pending', generatedAt: null,                             size: null,     pages: null },
  ], undefined, 200, demoMeta('business-metrics'));
});

// ── DASHBOARD SUMMARY (MIXED) ──
router.get('/dashboard/summary', (_req: Request, res: Response) => {
  const incidents = [...db.incidents.values()];
  const activeIncidents = incidents.filter(i => i.status === 'open' || i.status === 'investigating');
  sendSuccess(res, {
    complianceScore: 98.7, activeIncidents: activeIncidents.length, pixVolume: 2.4e9, securityHealth: 97.6,
    recentAuditEntries: auditService.getAll(5), lastUpdated: new Date(),
  }, undefined, 200, { source: 'demo', note: 'Painel misto: contagem de incidentes e trilha de auditoria são reais; score de compliance, volume PIX e saúde de segurança são demonstrativos (dependem de integrações externas).' });
});

// ── SETTINGS (REAL) ──
const settingsStore = new KVStore('system-settings');
const DEFAULT_SETTINGS = {
  mfaRequired: true, sessionTimeoutMin: 30, ipWhitelisting: false, auditLogging: true,
  aiPoweredResponses: true, predictiveAnalytics: true, autoRemediation: false, workflowOrchestration: true,
  backupEnabled: true, backupFrequencyHours: 24, backupRetentionDays: 35, logLevel: 'info',
  corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:8080',
};

router.get('/settings', requireRoles('Admin'), (_req: Request, res: Response) => {
  const saved = settingsStore.get<typeof DEFAULT_SETTINGS>('current') ?? DEFAULT_SETTINGS;
  sendSuccess(res, { ...DEFAULT_SETTINGS, ...saved, lastUpdated: new Date() }, undefined, 200, realMeta('Configurações reais persistidas.'));
});

router.patch('/settings', requireRoles('Admin'), (req: Request, res: Response) => {
  const current = settingsStore.get<typeof DEFAULT_SETTINGS>('current') ?? DEFAULT_SETTINGS;
  const updated = { ...current, ...req.body };
  settingsStore.set('current', updated);
  auditService.log({ userId: req.user!.sub, userEmail: req.user!.email, action: 'CONFIG_UPDATED', resource: 'settings', ip: req.ip, status: 'SUCCESS', details: { changed: Object.keys(req.body) } });
  sendSuccess(res, updated, 'Configurações atualizadas', 200, realMeta());
});

// ── AUTOMATION (DEMO) ──
router.get('/automation/stats', async (_req: Request, res: Response) => {
  const allIncidents = [...db.incidents.values()];
  const resolved = allIncidents.filter(i => i.status === 'resolved' || i.status === 'closed');
  const fraud = getFraudProvider();
  const health = await fraud.health();
  const stats = await fraud.getStats();
  const meta = health.connected ? realMeta('Estatísticas reais do motor de fraude.') : demoMeta('ml-fraud-engine');
  sendSuccess(res, {
    playbooksActive: 23, timeSavedHoursWeek: 347,
    mlInsightsActive: stats.transactionsScored,
    avgResponseMin: 2.1,
    automationRate: resolved.length > 0 ? Math.round(resolved.length / allIncidents.length * 100) : 78,
    playbooksTriggeredToday: 12, lastUpdated: new Date(),
  }, undefined, 200, meta);
});

router.get('/automation/insights', (_req: Request, res: Response) => {
  sendSuccess(res, [
    { id: '1', type: 'anomaly',    severity: 'high',   title: 'Padrão de Acesso Anômalo',        description: 'Detectado 340% acima da média em transações PIX às 03:00', confidence: 94,  action: 'Playbook anti-fraude ativado automaticamente', timestamp: new Date(Date.now()-5*60000) },
    { id: '2', type: 'compliance', severity: 'medium', title: 'Desvio LGPD Detectado',            description: '3 processos de tratamento de dados sem base legal documentada', confidence: 87,  action: 'Alerta enviado ao DPO',                        timestamp: new Date(Date.now()-23*60000) },
    { id: '3', type: 'security',   severity: 'low',    title: 'Certificado TLS em Expiração',     description: 'Certificado expira em 14 dias',                                confidence: 100, action: 'Renovação automática agendada',                timestamp: new Date(Date.now()-45*60000) },
    { id: '4', type: 'risk',       severity: 'medium', title: 'Concentração de Risco Operacional', description: 'Dois analistas com acesso simultâneo ao mesmo cliente',        confidence: 79,  action: 'Revisão de acesso recomendada',                timestamp: new Date(Date.now()-90*60000) },
  ], undefined, 200, demoMeta('ml-fraud-engine'));
});

export default router;
