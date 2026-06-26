import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.middleware';
import { auditService } from '../services/audit.service';
import { db } from '../database/store';
import { sendSuccess, sendPaginated, sendError } from '../utils/response';
import { v4 as uuidv4 } from 'uuid';
import { Incident, IncidentSeverity, IncidentStatus } from '../domain/types';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────
// COMPLIANCE
// ─────────────────────────────────────────
router.get('/compliance/scores', (req: Request, res: Response) => {
  const scores = [
    {
      framework: 'LGPD',
      score: 98.7,
      status: 'compliant',
      requirements: { total: 12, met: 12 },
      lastAudit: new Date('2024-01-15'),
      nextReview: new Date('2024-04-15'),
    },
    {
      framework: 'PCI_DSS',
      score: 96.5,
      status: 'compliant',
      requirements: { total: 8, met: 8 },
      lastAudit: new Date('2024-01-10'),
      nextReview: new Date('2024-04-10'),
    },
    {
      framework: 'BACEN_4893',
      score: 94.2,
      status: 'review',
      requirements: { total: 15, met: 14 },
      lastAudit: new Date('2024-01-05'),
      nextReview: new Date('2024-04-05'),
    },
    {
      framework: 'ISO_27001',
      score: 91.8,
      status: 'compliant',
      requirements: { total: 20, met: 19 },
      lastAudit: new Date('2024-01-08'),
      nextReview: new Date('2024-07-08'),
    },
    {
      framework: 'NIST',
      score: 97.1,
      status: 'compliant',
      requirements: { total: 23, met: 23 },
      lastAudit: new Date('2024-01-12'),
      nextReview: new Date('2024-04-12'),
    },
  ];

  auditService.log({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    action: 'DATA_ACCESS',
    resource: 'compliance/scores',
    ip: req.ip,
  });

  sendSuccess(res, scores);
});

router.get('/compliance/overview', (_req: Request, res: Response) => {
  sendSuccess(res, {
    overallScore: 95.8,
    trend: 'up',
    lastUpdated: new Date(),
    activeAlerts: 2,
    upcomingReviews: 3,
    recentChanges: [
      { date: new Date(Date.now() - 86400000), framework: 'BACEN_4893', change: '+1.2%', description: 'Controle 4.2.1 implementado' },
      { date: new Date(Date.now() - 172800000), framework: 'LGPD', change: '+0.5%', description: 'Portal do Titular atualizado' },
    ],
  });
});

// ─────────────────────────────────────────
// PIX MONITORING
// ─────────────────────────────────────────
router.get('/pix/metrics', (_req: Request, res: Response) => {
  // Simulate live-ish metrics with small variations
  const jitter = () => (Math.random() - 0.5) * 0.02;
  sendSuccess(res, {
    timestamp: new Date(),
    volumeTotal: 2.4e9 * (1 + jitter()),
    transactionCount: Math.floor(847000 * (1 + jitter())),
    fraudRate: Math.max(0, 0.02 + jitter() * 0.1),
    availability: Math.min(100, 99.97 + jitter() * 0.01),
    avgLatencyMs: Math.max(80, 120 + jitter() * 20),
  });
});

router.get('/pix/anomalies', (_req: Request, res: Response) => {
  const anomalies = [...db.pixAnomalies.values()];
  sendPaginated(res, anomalies, anomalies.length, 1, 50);
});

router.get('/pix/history', (_req: Request, res: Response) => {
  // 30 days of historical data
  const history = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86400000);
    return {
      date: date.toISOString().split('T')[0],
      volume: 2.0e9 + Math.random() * 0.8e9,
      transactions: 700000 + Math.floor(Math.random() * 200000),
      fraudRate: 0.01 + Math.random() * 0.02,
      availability: 99.9 + Math.random() * 0.1,
    };
  });
  sendSuccess(res, history);
});

// ─────────────────────────────────────────
// SECURITY CENTER
// ─────────────────────────────────────────
router.get('/security/layers', (_req: Request, res: Response) => {
  const layers = [
    { layer: 1, name: 'Edge Protection', health: 98.5, threatsDetected: 247, threatsBlocked: 245, services: ['WAF', 'DDoS Protection', 'CDN Security'] },
    { layer: 2, name: 'Network Security', health: 97.2, threatsDetected: 156, threatsBlocked: 154, services: ['Firewall', 'IPS/IDS', 'Network Segmentation'] },
    { layer: 3, name: 'Application Security', health: 96.8, threatsDetected: 89, threatsBlocked: 87, services: ['Code Analysis', 'OWASP Protection', 'API Security'] },
    { layer: 4, name: 'Identity & Access', health: 99.1, threatsDetected: 78, threatsBlocked: 78, services: ['MFA', 'RBAC', 'Zero Trust'] },
    { layer: 5, name: 'Data Protection', health: 98.9, threatsDetected: 23, threatsBlocked: 23, services: ['AES-256', 'DLP', 'HSM'] },
    { layer: 6, name: 'Endpoint Security', health: 97.5, threatsDetected: 134, threatsBlocked: 131, services: ['EDR', 'Antivirus', 'Device Control'] },
    { layer: 7, name: 'Monitoring & SIEM', health: 98.2, threatsDetected: 456, threatsBlocked: 452, services: ['SIEM', 'Log Analysis', 'Threat Detection'] },
    { layer: 8, name: 'AI/ML Security', health: 94.7, threatsDetected: 89, threatsBlocked: 85, services: ['Behavioral Analysis', 'ML Threat Prediction'] },
    { layer: 9, name: 'Compliance & Governance', health: 96.3, threatsDetected: 12, threatsBlocked: 12, services: ['Audit', 'Policy Enforcement', 'Risk Management'] },
  ];
  sendSuccess(res, {
    layers,
    overallHealth: 97.6,
    totalThreatsDetected: layers.reduce((a, l) => a + l.threatsDetected, 0),
    totalThreatsBlocked: layers.reduce((a, l) => a + l.threatsBlocked, 0),
    blockRate: 99.2,
    lastUpdated: new Date(),
  });
});

router.get('/security/kpis', (_req: Request, res: Response) => {
  sendSuccess(res, {
    revenueProtected: 847e6,
    complianceScore: 98.7,
    activeUsers: 2.4e6,
    riskIncidents: 3,
    roi: 347,
    mttr: 2.8,
    falsePositiveRate: 1.8,
    lastUpdated: new Date(),
  });
});

// ─────────────────────────────────────────
// INCIDENTS
// ─────────────────────────────────────────
router.get('/incidents', (_req: Request, res: Response) => {
  const page = parseInt(String(_req.query['page'] ?? 1));
  const limit = parseInt(String(_req.query['limit'] ?? 20));
  const all = [...db.incidents.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const paginated = all.slice((page - 1) * limit, page * limit);
  sendPaginated(res, paginated, all.length, page, limit);
});

router.get('/incidents/:id', (req: Request, res: Response) => {
  const incident = db.incidents.get(req.params['id'] as string);
  if (!incident) {
    sendError(res, 404, 'Incidente não encontrado');
    return;
  }
  sendSuccess(res, incident);
});

router.post('/incidents', requireRoles('Admin', 'Diretor', 'Analista'), (req: Request, res: Response) => {
  const { title, description, severity, assignee, tags } = req.body;
  if (!title || !severity) {
    sendError(res, 400, 'title e severity são obrigatórios');
    return;
  }

  const incident: Incident = {
    id: uuidv4(),
    title,
    description: description ?? '',
    severity: severity as IncidentSeverity,
    status: 'open',
    assignee,
    tags: tags ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
    slaDeadline: new Date(Date.now() + 8 * 3600000),
  };

  db.incidents.set(incident.id, incident);

  auditService.log({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    action: 'INCIDENT_CREATED',
    resource: `incident/${incident.id}`,
    ip: req.ip,
    details: { title, severity },
    status: 'SUCCESS',
  });

  sendSuccess(res, incident, 'Incidente criado', 201);
});

router.patch('/incidents/:id', requireRoles('Admin', 'Diretor', 'Analista'), (req: Request, res: Response) => {
  const incident = db.incidents.get(req.params['id'] as string);
  if (!incident) {
    sendError(res, 404, 'Incidente não encontrado');
    return;
  }

  const { status, assignee, description } = req.body;
  const updated: Incident = {
    ...incident,
    status: (status as IncidentStatus) ?? incident.status,
    assignee: assignee ?? incident.assignee,
    description: description ?? incident.description,
    updatedAt: new Date(),
    resolvedAt: status === 'resolved' || status === 'closed' ? new Date() : incident.resolvedAt,
  };

  db.incidents.set(updated.id, updated);

  auditService.log({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    action: 'INCIDENT_UPDATED',
    resource: `incident/${incident.id}`,
    ip: req.ip,
    details: { status, assignee },
    status: 'SUCCESS',
  });

  sendSuccess(res, updated, 'Incidente atualizado');
});

// ─────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────
router.get('/audit/log', requireRoles('Admin', 'Auditor', 'Diretor'), (req: Request, res: Response) => {
  const page = parseInt(String(req.query['page'] ?? 1));
  const limit = Math.min(parseInt(String(req.query['limit'] ?? 50)), 200);
  const offset = (page - 1) * limit;

  const entries = auditService.getAll(limit, offset);
  const total = db.auditLog.length;

  auditService.log({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    action: 'DATA_ACCESS',
    resource: 'audit/log',
    ip: req.ip,
  });

  sendPaginated(res, entries, total, page, limit);
});

router.get('/audit/integrity', requireRoles('Admin', 'Auditor'), (_req: Request, res: Response) => {
  const result = auditService.verifyIntegrity();
  sendSuccess(res, {
    ...result,
    totalEntries: db.auditLog.length,
    checkedAt: new Date(),
  });
});

// ─────────────────────────────────────────
// USERS (Admin only)
// ─────────────────────────────────────────
router.get('/users', requireRoles('Admin', 'Diretor'), (_req: Request, res: Response) => {
  const users = [...db.users.values()].map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    mfaEnabled: u.mfaEnabled,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
  }));
  sendSuccess(res, users);
});

// ─────────────────────────────────────────
// EXECUTIVE DASHBOARD
// ─────────────────────────────────────────
router.get('/executive/kpis', requireRoles('Admin', 'Diretor'), (_req: Request, res: Response) => {
  sendSuccess(res, {
    revenueProtected: { value: 847e6, trend: '+12%', label: 'Receita Protegida' },
    complianceScore: { value: 98.7, trend: '+1.2%', label: 'Score Compliance' },
    activeUsers: { value: 2400000, trend: '+5.3%', label: 'Usuários Ativos' },
    securityROI: { value: 347, trend: '+23%', label: 'ROI Segurança (%)' },
    incidentsResolved: { value: 99.2, trend: '+0.8%', label: 'Incidentes Resolvidos (%)' },
    mttr: { value: 2.8, trend: '-30s', label: 'MTTR (min)' },
    lastUpdated: new Date(),
  });
});

// ─────────────────────────────────────────
// DASHBOARD SUMMARY (main dashboard)
// ─────────────────────────────────────────
router.get('/dashboard/summary', (_req: Request, res: Response) => {
  const incidents = [...db.incidents.values()];
  const activeIncidents = incidents.filter(i => i.status === 'open' || i.status === 'investigating');

  sendSuccess(res, {
    complianceScore: 98.7,
    activeIncidents: activeIncidents.length,
    pixVolume: 2.4e9,
    securityHealth: 97.6,
    recentAuditEntries: auditService.getAll(5),
    lastUpdated: new Date(),
  });
});

export default router;

// ─────────────────────────────────────────
// USERS — sessions (derived from sessions collection)
// ─────────────────────────────────────────
router.get('/users/sessions', requireRoles('Admin', 'Diretor'), (_req: Request, res: Response) => {
  const allSessions = [...db.sessions.values()]
    .filter(s => !s.revoked && new Date() < s.expiresAt)
    .map(s => {
      const user = db.findUserById(s.userId);
      return {
        id: s.id,
        userId: s.userId,
        userName: user?.name ?? 'Unknown',
        userEmail: user?.email ?? '',
        userRole: user?.role ?? '',
        ip: s.ip ?? '—',
        userAgent: s.userAgent ?? '—',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        risk: s.ip?.startsWith('192.168') ? 'low' : 'medium',
      };
    });
  sendSuccess(res, allSessions);
});

// ─────────────────────────────────────────
// SECURITY — threat intelligence feed
// ─────────────────────────────────────────
router.get('/security/threats', authenticate, (_req: Request, res: Response) => {
  sendSuccess(res, {
    totalDetected: 1284,
    totalBlocked: 1273,
    blockRate: 99.1,
    activeThreats: 3,
    lastUpdated: new Date(),
    recentThreats: [
      { id: '1', type: 'DDoS Attempt',       severity: 'high',     source: '203.45.12.0/24', blockedAt: new Date(Date.now()-5*60000),   layer: 'Edge Protection',    blocked: true },
      { id: '2', type: 'SQL Injection',       severity: 'high',     source: '185.234.9.45',  blockedAt: new Date(Date.now()-12*60000),  layer: 'Application Security', blocked: true },
      { id: '3', type: 'Brute Force',         severity: 'medium',   source: '91.108.56.89',  blockedAt: new Date(Date.now()-23*60000),  layer: 'Identity & Access',  blocked: true },
      { id: '4', type: 'Data Exfil Attempt',  severity: 'critical', source: '45.155.205.12', blockedAt: new Date(Date.now()-45*60000),  layer: 'Data Protection',    blocked: false },
      { id: '5', type: 'Port Scan',           severity: 'low',      source: '198.12.34.56',  blockedAt: new Date(Date.now()-90*60000),  layer: 'Network Security',   blocked: true },
    ],
  });
});

// ─────────────────────────────────────────
// PIX — real-time chart data (intraday)
// ─────────────────────────────────────────
router.get('/pix/chart', authenticate, (_req: Request, res: Response) => {
  const now = new Date();
  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = new Date(now);
    h.setHours(i, 0, 0, 0);
    const isPeak = i >= 8 && i <= 20;
    const base = isPeak ? 350 : 90;
    return {
      time: `${String(i).padStart(2, '0')}:00`,
      volume: Math.floor(base + Math.random() * base * 0.4),
      value: Math.floor((base + Math.random() * base * 0.4) * 20000),
    };
  });
  sendSuccess(res, hours);
});

// ─────────────────────────────────────────
// EXECUTIVE — risk trends (30 days)
// ─────────────────────────────────────────
router.get('/executive/risk-trends', requireRoles('Admin', 'Diretor'), (_req: Request, res: Response) => {
  const trends = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000);
    return {
      date: d.toISOString().split('T')[0],
      cybersecurity: Math.max(5, 20 - i * 0.4 + Math.random() * 4),
      operational:   Math.max(10, 45 - i * 0.3 + Math.random() * 5),
      compliance:    Math.max(3, 15 - i * 0.3 + Math.random() * 3),
      financial:     Math.max(2, 10 - i * 0.2 + Math.random() * 2),
    };
  });
  sendSuccess(res, trends);
});

// ─────────────────────────────────────────
// EXECUTIVE — reports list
// ─────────────────────────────────────────
router.get('/executive/reports', requireRoles('Admin', 'Diretor', 'Auditor'), (_req: Request, res: Response) => {
  sendSuccess(res, [
    { id: '1', name: 'Relatório LGPD — Junho 2026',   type: 'LGPD',       status: 'ready',    generatedAt: new Date(Date.now()-2*86400000),  size: '2.4 MB', pages: 48 },
    { id: '2', name: 'Compliance Summary Q2 2026',    type: 'Executive',  status: 'ready',    generatedAt: new Date(Date.now()-5*86400000),  size: '1.8 MB', pages: 32 },
    { id: '3', name: 'BACEN 4893 — Evidências',       type: 'Regulatory', status: 'ready',    generatedAt: new Date(Date.now()-7*86400000),  size: '5.1 MB', pages: 96 },
    { id: '4', name: 'PCI DSS Audit — Q2 2026',       type: 'PCI',        status: 'ready',    generatedAt: new Date(Date.now()-10*86400000), size: '3.2 MB', pages: 61 },
    { id: '5', name: 'Relatório LGPD — Julho 2026',   type: 'LGPD',       status: 'pending',  generatedAt: null,                            size: null,     pages: null },
  ]);
});

// ─────────────────────────────────────────
// SETTINGS — system configuration state
// ─────────────────────────────────────────
import { KVStore } from '../database/file-db';
const settingsStore = new KVStore('system-settings');

// Default settings
const DEFAULT_SETTINGS = {
  mfaRequired: true,
  sessionTimeoutMin: 30,
  ipWhitelisting: false,
  auditLogging: true,
  aiPoweredResponses: true,
  predictiveAnalytics: true,
  autoRemediation: false,
  workflowOrchestration: true,
  backupEnabled: true,
  backupFrequencyHours: 24,
  backupRetentionDays: 35,
  logLevel: 'info',
  corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:8080',
};

router.get('/settings', requireRoles('Admin'), (_req: Request, res: Response) => {
  const saved = settingsStore.get<typeof DEFAULT_SETTINGS>('current') ?? DEFAULT_SETTINGS;
  sendSuccess(res, { ...DEFAULT_SETTINGS, ...saved, lastUpdated: new Date() });
});

router.patch('/settings', requireRoles('Admin'), (req: Request, res: Response) => {
  const current = settingsStore.get<typeof DEFAULT_SETTINGS>('current') ?? DEFAULT_SETTINGS;
  const updated = { ...current, ...req.body };
  settingsStore.set('current', updated);
  auditService.log({
    userId: req.user!.sub, userEmail: req.user!.email,
    action: 'CONFIG_UPDATED', resource: 'settings',
    ip: req.ip, status: 'SUCCESS',
    details: { changed: Object.keys(req.body) },
  });
  sendSuccess(res, updated, 'Configurações atualizadas');
});

// ─────────────────────────────────────────
// AUTOMATION — playbook stats and AI insights
// ─────────────────────────────────────────
router.get('/automation/stats', authenticate, (_req: Request, res: Response) => {
  const allIncidents = [...db.incidents.values()];
  const resolved = allIncidents.filter(i => i.status === 'resolved' || i.status === 'closed');
  sendSuccess(res, {
    playbooksActive: 23,
    timeSavedHoursWeek: 347,
    mlInsightsActive: 4200,
    avgResponseMin: 2.1,
    automationRate: resolved.length > 0 ? Math.round(resolved.length / allIncidents.length * 100) : 78,
    playbooksTriggeredToday: 12,
    lastUpdated: new Date(),
  });
});

router.get('/automation/insights', authenticate, (_req: Request, res: Response) => {
  sendSuccess(res, [
    { id: '1', type: 'anomaly',    severity: 'high',   title: 'Padrão de Acesso Anômalo',       description: 'Detectado 340% acima da média em transações PIX às 03:00', confidence: 94, action: 'Playbook anti-fraude ativado automaticamente', timestamp: new Date(Date.now()-5*60000) },
    { id: '2', type: 'compliance', severity: 'medium', title: 'Desvio LGPD Detectado',           description: '3 processos de tratamento de dados sem base legal documentada', confidence: 87, action: 'Alerta enviado ao DPO', timestamp: new Date(Date.now()-23*60000) },
    { id: '3', type: 'security',   severity: 'low',    title: 'Certificado TLS em Expiração',    description: 'Certificado api.pixcompliance.com expira em 14 dias', confidence: 100, action: 'Renovação automática agendada', timestamp: new Date(Date.now()-45*60000) },
    { id: '4', type: 'risk',       severity: 'medium', title: 'Concentração de Risco Operacional', description: 'Dois analistas com acesso simultâneo ao mesmo cliente', confidence: 79, action: 'Revisão de acesso recomendada', timestamp: new Date(Date.now()-90*60000) },
  ]);
});
