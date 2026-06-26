// Clean isolated data dir per test file
import fs from 'fs';
import path from 'path';
import { afterAll, beforeEach } from 'vitest';

// Unique dir per vitest worker to avoid cross-file contamination
const testDir = `./data-test-${process.pid}`;
process.env['DATA_DIR'] = testDir;
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-key-min-32-chars-padding!!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-min-32-chars!!';
process.env['COOKIE_SECRET'] = 'test-cookie-secret-min-32-chars-pad!!';
process.env['PORT'] = '3099';

// Wipe any leftover data before tests start
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

// Import store AFTER setting DATA_DIR
import { users } from '../database/store';

// Reset lockouts between individual tests
beforeEach(() => {
  users.findAll().forEach(u => {
    if (u.loginAttempts > 0 || u.lockedUntil) {
      users.update(u.id, { loginAttempts: 0, lockedUntil: undefined });
    }
  });
});

afterAll(() => {
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
});
