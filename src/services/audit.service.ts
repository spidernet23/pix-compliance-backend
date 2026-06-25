import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuditEntry, AuditAction } from '../domain/types';
import { db } from '../database/store';
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
    if (db.auditLog.length === 0) return '0'.repeat(64); // Genesis hash
    return db.auditLog[db.auditLog.length - 1].hash;
  }

  private computeHash(entry: Omit<AuditEntry, 'hash'>): string {
    const content = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      ip: entry.ip,
      status: entry.status,
      details: entry.details,
      previousHash: entry.previousHash,
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  log(params: AuditParams): AuditEntry {
    const previousHash = this.getLastHash();
    const id = uuidv4();
    const timestamp = new Date();

    const entryWithoutHash: Omit<AuditEntry, 'hash'> = {
      id,
      timestamp,
      userId: params.userId,
      userEmail: params.userEmail,
      action: params.action,
      resource: params.resource,
      ip: params.ip,
      userAgent: params.userAgent,
      details: params.details,
      status: params.status ?? 'SUCCESS',
      previousHash,
    };

    const hash = this.computeHash(entryWithoutHash);
    const entry: AuditEntry = { ...entryWithoutHash, hash };

    db.auditLog.push(entry);

    logger.info('AUDIT', {
      action: entry.action,
      userId: entry.userId,
      status: entry.status,
      resource: entry.resource,
      hash: entry.hash.substring(0, 16) + '...',
    });

    return entry;
  }

  getAll(limit = 50, offset = 0): AuditEntry[] {
    return [...db.auditLog]
      .reverse()
      .slice(offset, offset + limit);
  }

  getByUserId(userId: string, limit = 50): AuditEntry[] {
    return [...db.auditLog]
      .reverse()
      .filter(e => e.userId === userId)
      .slice(0, limit);
  }

  verifyIntegrity(): { valid: boolean; tamperedAt?: number } {
    let previousHash = '0'.repeat(64);
    for (let i = 0; i < db.auditLog.length; i++) {
      const entry = db.auditLog[i];
      if (entry.previousHash !== previousHash) {
        return { valid: false, tamperedAt: i };
      }
      const expected = this.computeHash({ ...entry });
      if (entry.hash !== expected) {
        return { valid: false, tamperedAt: i };
      }
      previousHash = entry.hash;
    }
    return { valid: true };
  }
}

export const auditService = new AuditService();
