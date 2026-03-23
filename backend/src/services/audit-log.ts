import Database from 'better-sqlite3';
import path from 'path';
import type { SecurityScanResult, SecurityThreat } from './security';

export interface AuditEntry {
  id: number;
  timestamp: string;
  sourceIP: string;
  inputSummary: string;
  memoryType: string | null;
  safe: boolean;
  threatCount: number;
  threats: SecurityThreat[];
  action: 'allowed' | 'blocked';
  requestMeta: Record<string, string>;
}

export interface AuditStats {
  totalScans: number;
  totalBlocked: number;
  totalAllowed: number;
  blockRate: number;
  threatBreakdown: Record<string, number>;
  recentBlockRate: { period: string; blocked: number; total: number; rate: number }[];
}

export interface AuditQuery {
  safe?: boolean;
  threatType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const DB_PATH = process.env.AUDIT_DB_PATH ||
  path.join(__dirname, '..', '..', 'data', 'audit.sqlite');

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (db) return db;

  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      source_ip TEXT NOT NULL DEFAULT '',
      input_summary TEXT NOT NULL DEFAULT '',
      memory_type TEXT,
      safe INTEGER NOT NULL DEFAULT 1,
      threat_count INTEGER NOT NULL DEFAULT 0,
      threats TEXT NOT NULL DEFAULT '[]',
      action TEXT NOT NULL DEFAULT 'allowed',
      request_meta TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_safe ON audit_log(safe);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
  `);
  return db;
}

export function logScan(
  scanResult: SecurityScanResult,
  meta: {
    sourceIP: string;
    inputSummary: string;
    memoryType?: string;
    userAgent?: string;
    contentType?: string;
  },
): AuditEntry {
  const database = getDB();
  const action = scanResult.safe ? 'allowed' : 'blocked';
  const requestMeta: Record<string, string> = {};
  if (meta.userAgent) requestMeta.userAgent = meta.userAgent;
  if (meta.contentType) requestMeta.contentType = meta.contentType;

  const stmt = database.prepare(`
    INSERT INTO audit_log (source_ip, input_summary, memory_type, safe, threat_count, threats, action, request_meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const truncatedSummary = meta.inputSummary.slice(0, 200);
  const result = stmt.run(
    meta.sourceIP,
    truncatedSummary,
    meta.memoryType || null,
    scanResult.safe ? 1 : 0,
    scanResult.threats.length,
    JSON.stringify(scanResult.threats),
    action,
    JSON.stringify(requestMeta),
  );

  return {
    id: result.lastInsertRowid as number,
    timestamp: new Date().toISOString(),
    sourceIP: meta.sourceIP,
    inputSummary: truncatedSummary,
    memoryType: meta.memoryType || null,
    safe: scanResult.safe,
    threatCount: scanResult.threats.length,
    threats: scanResult.threats,
    action,
    requestMeta,
  };
}

export function queryAuditLog(query: AuditQuery): { entries: AuditEntry[]; total: number } {
  const database = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.safe !== undefined) {
    conditions.push('safe = ?');
    params.push(query.safe ? 1 : 0);
  }
  if (query.threatType) {
    conditions.push("threats LIKE ?");
    params.push(`%"type":"${query.threatType}"%`);
  }
  if (query.from) {
    conditions.push('timestamp >= ?');
    params.push(query.from);
  }
  if (query.to) {
    conditions.push('timestamp <= ?');
    params.push(query.to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(query.limit || 50, 200);
  const offset = query.offset || 0;

  const countRow = database.prepare(`SELECT COUNT(*) as cnt FROM audit_log ${where}`).get(...params) as { cnt: number };

  const rows = database.prepare(
    `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    total: countRow.cnt,
    entries: rows.map(rowToEntry),
  };
}

export function getAuditStats(): AuditStats {
  const database = getDB();

  const totals = database.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN action = 'blocked' THEN 1 ELSE 0 END) as blocked,
       SUM(CASE WHEN action = 'allowed' THEN 1 ELSE 0 END) as allowed
     FROM audit_log`
  ).get() as { total: number; blocked: number; allowed: number };

  const threatRows = database.prepare(`SELECT threats FROM audit_log WHERE threat_count > 0`).all() as Array<{ threats: string }>;

  const threatBreakdown: Record<string, number> = {};
  for (const row of threatRows) {
    try {
      const threats: SecurityThreat[] = JSON.parse(row.threats);
      for (const t of threats) {
        threatBreakdown[t.type] = (threatBreakdown[t.type] || 0) + 1;
      }
    } catch { /* skip malformed */ }
  }

  const periods = [
    { label: '1h', sql: "datetime('now', '-1 hour')" },
    { label: '24h', sql: "datetime('now', '-1 day')" },
    { label: '7d', sql: "datetime('now', '-7 days')" },
  ];

  const recentBlockRate = periods.map(({ label, sql }) => {
    const row = database.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN action = 'blocked' THEN 1 ELSE 0 END) as blocked
       FROM audit_log WHERE timestamp >= ${sql}`
    ).get() as { total: number; blocked: number };
    return {
      period: label,
      blocked: row.blocked || 0,
      total: row.total || 0,
      rate: row.total > 0 ? (row.blocked || 0) / row.total : 0,
    };
  });

  return {
    totalScans: totals.total,
    totalBlocked: totals.blocked || 0,
    totalAllowed: totals.allowed || 0,
    blockRate: totals.total > 0 ? (totals.blocked || 0) / totals.total : 0,
    threatBreakdown,
    recentBlockRate,
  };
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function rowToEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: row.id as number,
    timestamp: row.timestamp as string,
    sourceIP: row.source_ip as string,
    inputSummary: row.input_summary as string,
    memoryType: row.memory_type as string | null,
    safe: (row.safe as number) === 1,
    threatCount: row.threat_count as number,
    threats: JSON.parse((row.threats as string) || '[]'),
    action: row.action as 'allowed' | 'blocked',
    requestMeta: JSON.parse((row.request_meta as string) || '{}'),
  };
}
