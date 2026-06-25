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
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
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
