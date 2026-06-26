import { describe, it, expect, beforeAll } from 'vitest';
import { auditService } from '../services/audit.service';
import { seedIfEmpty } from '../database/store';

beforeAll(async () => {
  await seedIfEmpty();
});

describe('AuditService — hash chain integrity', () => {
  it('genesis hash is 64 zeros before first entry', () => {
    const result = auditService.verifyIntegrity();
    expect(result.valid).toBe(true);
  });

  it('each new entry has valid hash and previous hash reference', () => {
    const before = auditService.totalCount();

    auditService.log({ action: 'DATA_ACCESS', status: 'SUCCESS', resource: 'test/unit' });
    auditService.log({ action: 'COMPLIANCE_CHECK', status: 'SUCCESS' });

    const entries = auditService.getAll(5);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    entries.forEach(e => {
      expect(e.hash).toHaveLength(64);
      expect(e.previousHash).toHaveLength(64);
    });

    expect(auditService.totalCount()).toBe(before + 2);
  });

  it('integrity check passes after multiple entries', () => {
    auditService.log({ action: 'LOGIN_SUCCESS', userId: 'test-user', status: 'SUCCESS' });
    auditService.log({ action: 'LOGOUT',        userId: 'test-user', status: 'SUCCESS' });

    const result = auditService.verifyIntegrity();
    expect(result.valid).toBe(true);
    expect(result.tamperedAt).toBeUndefined();
  });

  it('getAll returns entries in reverse chronological order', () => {
    const entries = auditService.getAll(10);
    for (let i = 1; i < entries.length; i++) {
      const prev = new Date(entries[i - 1].timestamp).getTime();
      const curr = new Date(entries[i].timestamp).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('logs sensitive action with correct fields', () => {
    const entry = auditService.log({
      action: 'USER_CREATED',
      userId: 'admin-id',
      userEmail: 'admin@test.com',
      resource: 'users/new-user',
      ip: '192.168.1.1',
      status: 'SUCCESS',
      details: { role: 'Analista' },
    });

    expect(entry.action).toBe('USER_CREATED');
    expect(entry.userId).toBe('admin-id');
    expect(entry.hash).toHaveLength(64);
    expect(entry.id).toBeTruthy();
  });
});
