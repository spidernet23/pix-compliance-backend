# Pix Compliance AaaS v7.0 — Backend

API REST segura para a plataforma de compliance financeiro PIX.

## Stack
- Node.js + TypeScript + Express
- bcrypt (cost 12) para senhas
- JWT + Refresh Token Rotation
- TOTP MFA real (speakeasy RFC 6238)
- Audit log imutável com hash SHA-256 encadeado
- Helmet + CORS + Rate Limiting + express-validator

## Setup

```bash
cp .env.example .env
# Edite .env com seus valores
npm install
npm run dev
```

## Credenciais de desenvolvimento

| Usuário | Email | Senha | MFA |
|---------|-------|-------|-----|
| Admin (Roberto Silva) | roberto.silva@pixcompliance.com | Admin@2024!Secure | 000000 |
| Analista (Ana Rodriguez) | ana.rodriguez@pixcompliance.com | Analista@2024!Secure | 000000 |
| Diretor (Carlos Santos) | carlos.santos@pixcompliance.com | Diretor@2024!Secure | 000000 |
| Auditor (Márcia Lima) | marcia.lima@pixcompliance.com | Auditor@2024!Secure | 000000 |

> Em desenvolvimento o código MFA `000000` é aceito. Em produção, use um app autenticador real.

## Endpoints

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | /health | — | Health check |
| POST | /api/auth/login | — | Step 1: email + senha |
| POST | /api/auth/mfa | — | Step 2: código TOTP → JWT |
| POST | /api/auth/refresh | — | Renovar tokens |
| POST | /api/auth/logout | ✓ | Encerrar sessão |
| GET | /api/auth/me | ✓ | Usuário atual |
| GET | /api/dashboard/summary | ✓ | Resumo executivo |
| GET | /api/compliance/scores | ✓ | Scores por framework |
| GET | /api/pix/metrics | ✓ | Métricas PIX em tempo real |
| GET | /api/pix/anomalies | ✓ | Anomalias detectadas |
| GET | /api/pix/history | ✓ | Histórico 30 dias |
| GET | /api/security/layers | ✓ | Status 9 camadas |
| GET | /api/security/kpis | ✓ | KPIs de segurança |
| GET | /api/incidents | ✓ | Lista de incidentes |
| POST | /api/incidents | ✓ Admin/Diretor/Analista | Criar incidente |
| PATCH | /api/incidents/:id | ✓ Admin/Diretor/Analista | Atualizar incidente |
| GET | /api/audit/log | ✓ Admin/Auditor/Diretor | Trilha de auditoria |
| GET | /api/audit/integrity | ✓ Admin/Auditor | Verificar integridade |
| GET | /api/users | ✓ Admin/Diretor | Lista de usuários |
| GET | /api/executive/kpis | ✓ Admin/Diretor | KPIs executivos |

## Arquitetura

```
src/
├── config/env.ts          — Validação de env com Zod
├── domain/types.ts        — Tipos de domínio
├── database/store.ts      — Store in-memory + seed
├── services/
│   ├── auth.service.ts    — Login, bloqueio, logout
│   ├── token.service.ts   — JWT + refresh rotation
│   ├── mfa.service.ts     — TOTP real
│   └── audit.service.ts   — Hash encadeado SHA-256
├── middleware/
│   ├── auth.middleware.ts — JWT verify + RBAC
│   └── validation.middleware.ts
├── routes/
│   ├── auth.routes.ts
│   └── api.routes.ts
└── utils/
    ├── logger.ts          — Winston com PII sanitization
    └── response.ts        — Respostas padronizadas
```
