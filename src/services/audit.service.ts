import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuditEntry, AuditAction } from '../domain/types';
import { auditLog } from '../database/store';
import { logger } from '../utils/logger';

interface AuditParams {
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  resource?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  status?: 'SUCCESS' | 'FAILURE' | 'WARNING';
}

class AuditService {
  private getLastHash(): string {
    const all = auditLog.findAll();
    if (all.length === 0) return '0'.repeat(64);
    return all[all.length - 1].hash;
  }

  private computeHash(entry: Omit<AuditEntry, 'hash'>): string {
    const content = JSON.stringify({
      id: entry.id, timestamp: entry.timestamp,
      userId: entry.userId, action: entry.action,
      resource: entry.resource, ip: entry.ip,
      status: entry.status, details: entry.details,
      previousHash: entry.previousHash,
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  log(params: AuditParams): AuditEntry {
    const previousHash = this.getLastHash();
    const id = uuidv4();
    const timestamp = new Date();

    const partial: Omit<AuditEntry, 'hash'> = {
      id, timestamp, previousHash,
      userId: params.userId, userEmail: params.userEmail,
      action: params.action, resource: params.resource,
      ip: params.ip, userAgent: params.userAgent,
      details: params.details,
      status: params.status ?? 'SUCCESS',
    };

    const hash = this.computeHash(partial);
    const entry: AuditEntry = { ...partial, hash };

    auditLog.appendOne(entry);

    logger.info('AUDIT', {
      action: entry.action, userId: entry.userId,
      status: entry.status, resource: entry.resource,
      hash: entry.hash.substring(0, 16) + '...',
    });

    return entry;
  }

  getAll(limit = 50, offset = 0): AuditEntry[] {
    return auditLog.findAll().reverse().slice(offset, offset + limit);
  }

  getByUserId(userId: string, limit = 50): AuditEntry[] {
    return auditLog.findMany(e => e.userId === userId).reverse().slice(0, limit);
  }

  verifyIntegrity(): { valid: boolean; tamperedAt?: number } {
    const all = auditLog.findAll();
    let previousHash = '0'.repeat(64);
    for (let i = 0; i < all.length; i++) {
      const entry = all[i];
      if (entry.previousHash !== previousHash) return { valid: false, tamperedAt: i };
      const expected = this.computeHash({ ...entry });
      if (entry.hash !== expected) return { valid: false, tamperedAt: i };
      previousHash = entry.hash;
    }
    return { valid: true };
  }

  totalCount(): number {
    return auditLog.count();
  }
}

export const auditService = new AuditService();
