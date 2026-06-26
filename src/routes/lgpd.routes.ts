/**
 * LGPD Routes — Art. 18 Portal do Titular
 *
 * Implements the data subject rights required by Lei 13.709/2018:
 *  - Art. 18 I   — access (acesso)
 *  - Art. 18 III — rectification (retificação)
 *  - Art. 18 VI  — deletion (eliminação)
 *  - Art. 18 V   — portability (portabilidade)
 *  - Art. 18 IX  — revocation of consent (revogação)
 *  - Art. 18 II  — information about processing (informação)
 *
 * SLA: 15 calendar days per Art. 18 §3
 * Notification: Art. 48 breach pipeline
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import { authenticate, requireRoles } from '../middleware/auth.middleware';
import { auditService } from '../services/audit.service';
import { lgpdRequests, consentLog } from '../database/store';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { LgpdRequest, LgpdRequestType, ConsentRecord } from '../domain/types';

const router = Router();

// ─── Validators ──────────────────────────────────────────────
const requestValidators = [
  body('type').isIn(['access','rectification','deletion','portability','revocation','info']).withMessage('Tipo inválido'),
  body('titularName').trim().notEmpty().withMessage('Nome é obrigatório'),
  body('titularEmail').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('titularDocument').trim().isLength({ min: 11, max: 14 }).withMessage('CPF/CNPJ inválido'),
  body('description').trim().isLength({ min: 10 }).withMessage('Descrição muito curta (mín. 10 caracteres)'),
];

const validate = (req: Request, res: Response, next: () => void) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { sendError(res, 400, 'Dados inválidos', errors.array().map(e => e.msg as string)); return; }
  next();
};

const typeLabel: Record<LgpdRequestType, string> = {
  access:        'Acesso aos dados',
  rectification: 'Retificação',
  deletion:      'Eliminação',
  portability:   'Portabilidade',
  revocation:    'Revogação de consentimento',
  info:          'Informação sobre tratamento',
};

// ─── POST /api/lgpd/requests — Submit request (public, no auth) ─
router.post('/requests', requestValidators, validate, (req: Request, res: Response) => {
  const { type, titularName, titularEmail, titularDocument, description } = req.body as {
    type: LgpdRequestType; titularName: string; titularEmail: string; titularDocument: string; description: string;
  };

  const request: LgpdRequest = {
    id: uuidv4(),
    type,
    status: 'pending',
    titularName,
    titularEmail,
    titularDocument,
    description,
    createdAt: new Date(),
    updatedAt: new Date(),
    slaDeadline: new Date(Date.now() + 15 * 24 * 3600 * 1000), // 15 calendar days
  };

  lgpdRequests.insert(request);

  // Audit log — document masked for privacy
  auditService.log({
    action: 'DATA_ACCESS',
    resource: `lgpd/request/${request.id}`,
    ip: req.ip,
    status: 'SUCCESS',
    details: { type, requestId: request.id, titularEmail: titularEmail.replace(/(.{2}).+(@.+)/, '$1***$2') },
  });

  // Return without PII
  sendSuccess(res, {
    id: request.id,
    type,
    typeLabel: typeLabel[type],
    status: 'pending',
    slaDeadline: request.slaDeadline,
    message: `Solicitação de ${typeLabel[type]} registrada. Resposta em até 15 dias (Art. 18 §3 LGPD).`,
  }, 'Solicitação recebida com sucesso', 201);
});

// ─── GET /api/lgpd/requests — List all (internal, requires auth + role) ─
router.get('/requests', authenticate, requireRoles('Admin', 'Auditor', 'Diretor'), (req: Request, res: Response) => {
  const page  = parseInt(String(req.query['page'] ?? 1));
  const limit = Math.min(parseInt(String(req.query['limit'] ?? 20)), 100);
  const statusFilter = req.query['status'] as string | undefined;

  let all = lgpdRequests.findAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (statusFilter) all = all.filter(r => r.status === statusFilter);

  // Mask CPF in list response
  const masked = all.map(r => ({
    ...r,
    titularDocument: r.titularDocument.replace(/(\d{3})\d{3}(\d{3})(\d{2})/, '$1.***.$2-$3'),
  }));

  const paginated = masked.slice((page - 1) * limit, page * limit);

  auditService.log({
    userId: req.user!.sub, userEmail: req.user!.email,
    action: 'DATA_ACCESS', resource: 'lgpd/requests', ip: req.ip,
  });

  sendPaginated(res, paginated, all.length, page, limit);
});

// ─── GET /api/lgpd/requests/:id ─────────────────────────────
router.get('/requests/:id', authenticate, requireRoles('Admin', 'Auditor', 'Diretor'), (req: Request, res: Response) => {
  const request = lgpdRequests.findById(req.params['id'] as string);
  if (!request) { sendError(res, 404, 'Solicitação não encontrada'); return; }

  auditService.log({
    userId: req.user!.sub, userEmail: req.user!.email,
    action: 'DATA_ACCESS', resource: `lgpd/request/${request.id}`, ip: req.ip,
  });

  sendSuccess(res, {
    ...request,
    titularDocument: request.titularDocument.replace(/(\d{3})\d{3}(\d{3})(\d{2})/, '$1.***.$2-$3'),
  });
});

// ─── PATCH /api/lgpd/requests/:id — Update status ───────────
router.patch('/requests/:id',
  authenticate,
  requireRoles('Admin', 'Diretor'),
  body('status').isIn(['in_review','completed','rejected']).withMessage('Status inválido'),
  body('resolution').optional().trim(),
  body('assignee').optional().trim(),
  validate,
  (req: Request, res: Response) => {
    const request = lgpdRequests.findById(req.params['id'] as string);
    if (!request) { sendError(res, 404, 'Solicitação não encontrada'); return; }

    const { status, resolution, assignee } = req.body as { status: string; resolution?: string; assignee?: string };

    const updated = lgpdRequests.update(request.id, {
      status: status as LgpdRequest['status'],
      resolution,
      assignee,
      updatedAt: new Date(),
      resolvedAt: (status === 'completed' || status === 'rejected') ? new Date() : undefined,
    });

    auditService.log({
      userId: req.user!.sub, userEmail: req.user!.email,
      action: 'DATA_ACCESS', resource: `lgpd/request/${request.id}`,
      ip: req.ip, status: 'SUCCESS',
      details: { previousStatus: request.status, newStatus: status },
    });

    sendSuccess(res, updated, `Solicitação ${status === 'completed' ? 'concluída' : status === 'rejected' ? 'rejeitada' : 'em revisão'}`);
  }
);

// ─── GET /api/lgpd/stats ─────────────────────────────────────
router.get('/stats', authenticate, requireRoles('Admin', 'Auditor', 'Diretor'), (_req: Request, res: Response) => {
  const all = lgpdRequests.findAll();
  const now = Date.now();

  const stats = {
    total: all.length,
    byStatus: {
      pending:   all.filter(r => r.status === 'pending').length,
      in_review: all.filter(r => r.status === 'in_review').length,
      completed: all.filter(r => r.status === 'completed').length,
      rejected:  all.filter(r => r.status === 'rejected').length,
    },
    byType: Object.fromEntries(
      (['access','rectification','deletion','portability','revocation','info'] as LgpdRequestType[])
        .map(t => [t, all.filter(r => r.type === t).length])
    ),
    slaAtRisk: all.filter(r =>
      (r.status === 'pending' || r.status === 'in_review') &&
      new Date(r.slaDeadline).getTime() - now < 3 * 24 * 3600 * 1000 // < 3 days remaining
    ).length,
    avgResolutionDays: (() => {
      const resolved = all.filter(r => r.resolvedAt);
      if (!resolved.length) return null;
      const avg = resolved.reduce((a, r) => a + (new Date(r.resolvedAt!).getTime() - new Date(r.createdAt).getTime()), 0) / resolved.length;
      return Math.round(avg / 86400000);
    })(),
    lastUpdated: new Date(),
  };

  sendSuccess(res, stats);
});

// ─── GET /api/lgpd/ropa — Register of Processing Activities ─
router.get('/ropa', authenticate, requireRoles('Admin', 'Auditor', 'Diretor'), (_req: Request, res: Response) => {
  sendSuccess(res, [
    { id: '1', activity: 'Autenticação de Usuários',       purpose: 'Controle de acesso à plataforma', legalBasis: 'Art. 7 IX — legítimo interesse', dataCategories: ['email','nome','hash de senha'], retention: '5 anos após encerramento', controller: 'Pix Compliance AaaS' },
    { id: '2', activity: 'Monitoramento de Transações PIX', purpose: 'Prevenção a fraudes e compliance BACEN', legalBasis: 'Art. 7 II — cumprimento de obrigação legal', dataCategories: ['chave PIX','valor','timestamp'], retention: '5 anos (BCB 2020)', controller: 'Pix Compliance AaaS' },
    { id: '3', activity: 'Trilha de Auditoria',            purpose: 'Conformidade regulatória e rastreabilidade', legalBasis: 'Art. 7 II — cumprimento de obrigação legal', dataCategories: ['email','IP','ação realizada'], retention: '7 anos (BACEN 4893)', controller: 'Pix Compliance AaaS' },
    { id: '4', activity: 'Gestão de Incidentes',           purpose: 'Resposta a incidentes de segurança',       legalBasis: 'Art. 7 IX — legítimo interesse', dataCategories: ['dados de acesso','logs','evidências'], retention: '5 anos', controller: 'Pix Compliance AaaS' },
  ]);
});

// ─── POST /api/lgpd/consent — Record consent ─────────────────
router.post('/consent',
  body('titularEmail').isEmail().normalizeEmail(),
  body('purpose').trim().notEmpty(),
  body('legalBasis').trim().notEmpty(),
  body('granted').isBoolean(),
  body('version').trim().notEmpty(),
  validate,
  (req: Request, res: Response) => {
    const { titularEmail, purpose, legalBasis, granted, version } = req.body as ConsentRecord;

    const record: ConsentRecord = {
      id: uuidv4(), titularEmail, purpose, legalBasis,
      granted: Boolean(granted), grantedAt: new Date(), version, ip: req.ip,
    };

    consentLog.insert(record);
    sendSuccess(res, { id: record.id, granted: record.granted, grantedAt: record.grantedAt }, 'Consentimento registrado', 201);
  }
);

export default router;

// ─── POST /api/lgpd/anpd-notification — Art. 48 breach notification ─
router.post('/anpd-notification',
  authenticate,
  requireRoles('Admin', 'Diretor'),
  body('incidentId').notEmpty(),
  body('incidentDescription').trim().isLength({ min: 20 }),
  body('affectedDataCategories').isArray({ min: 1 }),
  body('estimatedAffectedCount').isInt({ min: 1 }),
  body('mitigationMeasures').trim().isLength({ min: 10 }),
  validate,
  (req: Request, res: Response) => {
    const {
      incidentId, incidentDescription, affectedDataCategories,
      estimatedAffectedCount, mitigationMeasures,
    } = req.body as {
      incidentId: string;
      incidentDescription: string;
      affectedDataCategories: string[];
      estimatedAffectedCount: number;
      mitigationMeasures: string;
    };

    const notification = {
      id: uuidv4(),
      type: 'ANPD_BREACH_NOTIFICATION',
      createdAt: new Date(),
      // Art. 48: notification must be within 72 hours of discovery
      deadline72h: new Date(Date.now() + 72 * 3600 * 1000),
      status: 'draft', // draft → submitted → acknowledged
      incidentId,
      incidentDescription,
      affectedDataCategories,
      estimatedAffectedCount,
      mitigationMeasures,
      responsibleController: 'Pix Compliance AaaS',
      dpoContact: 'dpo@pixcompliance.com',
      legalBasis: 'Art. 48 Lei 13.709/2018 (LGPD)',
      regulatoryRef: 'Resolução CD/ANPD nº 2/2022',
      // In production: this would POST to https://www.gov.br/anpd endpoint
      submissionEndpoint: 'https://www.gov.br/anpd/pt-br/assuntos/incidentes-de-seguranca',
      instructions: [
        '1. Revisar o rascunho gerado neste registro',
        '2. Complementar com evidências forenses',
        '3. Submeter ao portal gov.br/anpd até o prazo de 72h',
        '4. Registrar número de protocolo ANPD neste sistema',
      ],
    };

    auditService.log({
      userId: req.user!.sub,
      userEmail: req.user!.email,
      action: 'COMPLIANCE_VIOLATION',
      resource: `lgpd/anpd-notification/${notification.id}`,
      ip: req.ip,
      status: 'WARNING',
      details: {
        notificationId: notification.id,
        incidentId,
        affectedCount: estimatedAffectedCount,
        categories: affectedDataCategories,
      },
    });

    sendSuccess(res, notification,
      'Rascunho de notificação à ANPD gerado. Submeta ao portal gov.br/anpd em até 72h (Art. 48 LGPD).',
      201
    );
  }
);
