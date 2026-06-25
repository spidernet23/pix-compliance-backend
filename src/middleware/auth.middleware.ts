import { Request, Response, NextFunction } from 'express';
import { tokenService } from '../services/token.service';
import { JwtPayload, UserRole } from '../domain/types';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

// Augment Express request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestId?: string;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 401, 'Token de acesso não fornecido');
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = tokenService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Token inválido';
    const isExpired = message.includes('expired');
    logger.warn('JWT verification failed', { message, ip: req.ip });
    sendError(res, 401, isExpired ? 'Token expirado' : 'Token inválido');
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'Não autenticado');
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Unauthorized role access attempt', {
        userId: req.user.sub,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      sendError(res, 403, 'Acesso negado: permissão insuficiente');
      return;
    }

    next();
  };
}

// Request ID middleware
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = require('uuid').v4();
  next();
}
