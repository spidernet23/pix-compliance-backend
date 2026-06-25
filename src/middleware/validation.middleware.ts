import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(e => e.msg as string);
    sendError(res, 400, 'Dados inválidos', messages);
    return;
  }
  next();
}

export const loginValidators = [
  body('email')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail()
    .trim(),
  body('password')
    .isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres')
    .trim(),
];

export const mfaValidators = [
  body('userId')
    .isUUID().withMessage('userId inválido'),
  body('mfaToken')
    .isLength({ min: 6, max: 6 }).withMessage('Código MFA deve ter 6 dígitos')
    .isNumeric().withMessage('Código MFA deve conter apenas números'),
];

export const refreshValidators = [
  body('refreshToken')
    .notEmpty().withMessage('refreshToken é obrigatório'),
];
