/**
 * FileDatabase — persistent JSON store with atomic writes.
 *
 * Each collection lives in its own file under DATA_DIR:
 *   data/users.json, data/sessions.json, data/audit.json, etc.
 *
 * Writes are atomic (write-to-tmp then rename) so a crash mid-write
 * never corrupts the existing file.
 *
 * Interface is intentionally shaped like a minimal ORM so it can be
 * swapped for a real PostgreSQL client (Drizzle / Prisma) without
 * touching service layer code.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function filePath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readFile<T>(name: string, defaults: T): T {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return defaults;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8')) as T;
  } catch {
    return defaults;
  }
}

function writeFile<T>(name: string, data: T): void {
  const fp = filePath(name);
  const tmp = fp + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, fp); // atomic on Linux/macOS
}

/**
 * Generic collection backed by a JSON file.
 * T must have an `id: string` field.
 */
export class Collection<T extends { id: string }> {
  private name: string;
  private cache: T[];

  constructor(name: string) {
    this.name = name;
    this.cache = readFile<T[]>(name, []);
  }

  private flush() {
    writeFile(this.name, this.cache);
  }

  findAll(): T[] {
    return [...this.cache];
  }

  findById(id: string): T | undefined {
    return this.cache.find(r => r.id === id);
  }

  findOne(predicate: (r: T) => boolean): T | undefined {
    return this.cache.find(predicate);
  }

  findMany(predicate: (r: T) => boolean): T[] {
    return this.cache.filter(predicate);
  }

  insert(record: T): T {
    this.cache.push(record);
    this.flush();
    return record;
  }

  upsert(record: T): T {
    const idx = this.cache.findIndex(r => r.id === record.id);
    if (idx === -1) {
      this.cache.push(record);
    } else {
      this.cache[idx] = record;
    }
    this.flush();
    return record;
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const idx = this.cache.findIndex(r => r.id === id);
    if (idx === -1) return undefined;
    this.cache[idx] = { ...this.cache[idx], ...patch };
    this.flush();
    return this.cache[idx];
  }

  updateMany(predicate: (r: T) => boolean, patch: Partial<T>): number {
    let count = 0;
    this.cache = this.cache.map(r => {
      if (predicate(r)) { count++; return { ...r, ...patch }; }
      return r;
    });
    if (count > 0) this.flush();
    return count;
  }

  delete(id: string): boolean {
    const before = this.cache.length;
    this.cache = this.cache.filter(r => r.id !== id);
    if (this.cache.length < before) { this.flush(); return true; }
    return false;
  }

  count(): number {
    return this.cache.length;
  }

  /** Replace entire collection — for audit log append */
  appendOne(record: T): void {
    this.cache.push(record);
    this.flush();
  }
}

/**
 * Simple key-value store backed by a JSON file.
 * Used for: used refresh tokens set, config values.
 */
export class KVStore {
  private name: string;
  private cache: Record<string, unknown>;

  constructor(name: string) {
    this.name = name;
    this.cache = readFile<Record<string, unknown>>(name, {});
  }

  private flush() {
    writeFile(this.name, this.cache);
  }

  get<T>(key: string): T | undefined {
    return this.cache[key] as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.cache[key] = value;
    this.flush();
  }

  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.cache, key);
  }

  delete(key: string): void {
    delete this.cache[key];
    this.flush();
  }

  keys(): string[] {
    return Object.keys(this.cache);
  }
}
