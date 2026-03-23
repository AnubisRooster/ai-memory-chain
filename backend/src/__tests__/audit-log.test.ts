import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { logScan, queryAuditLog, getAuditStats, getDB, closeDB } from '../services/audit-log';
import type { SecurityScanResult } from '../services/security';

process.env.AUDIT_DB_PATH = ':memory:';

describe('Audit Log Service', () => {
  beforeEach(() => {
    const db = getDB();
    db.exec('DELETE FROM audit_log');
  });

  afterAll(() => {
    closeDB();
  });

  it('logs a clean scan and returns an entry', () => {
    const scan: SecurityScanResult = { safe: true, threats: [] };
    const entry = logScan(scan, {
      sourceIP: '127.0.0.1',
      inputSummary: 'Test memory',
      memoryType: 'note',
      userAgent: 'test-agent',
      contentType: 'application/json',
    });

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.safe).toBe(true);
    expect(entry.action).toBe('allowed');
    expect(entry.threatCount).toBe(0);
    expect(entry.sourceIP).toBe('127.0.0.1');
    expect(entry.inputSummary).toBe('Test memory');
    expect(entry.memoryType).toBe('note');
    expect(entry.requestMeta).toHaveProperty('userAgent', 'test-agent');
  });

  it('logs a blocked scan with threats', () => {
    const scan: SecurityScanResult = {
      safe: false,
      threats: [
        { field: 'summary', type: 'prompt_injection', severity: 'critical', description: 'Override attempt' },
        { field: 'data.payload', type: 'xss', severity: 'high', description: 'Script tag' },
      ],
    };
    const entry = logScan(scan, {
      sourceIP: '10.0.0.5',
      inputSummary: 'Ignore all previous instructions',
      memoryType: 'note',
    });

    expect(entry.safe).toBe(false);
    expect(entry.action).toBe('blocked');
    expect(entry.threatCount).toBe(2);
    expect(entry.threats).toHaveLength(2);
    expect(entry.threats[0].type).toBe('prompt_injection');
  });

  it('truncates long summaries to 200 chars', () => {
    const longSummary = 'A'.repeat(500);
    const scan: SecurityScanResult = { safe: true, threats: [] };
    const entry = logScan(scan, { sourceIP: '127.0.0.1', inputSummary: longSummary });
    expect(entry.inputSummary.length).toBe(200);
  });

  it('queries log with no filters', () => {
    logScan({ safe: true, threats: [] }, { sourceIP: '1.1.1.1', inputSummary: 'A' });
    logScan({ safe: false, threats: [{ field: 's', type: 'xss', severity: 'high', description: 'x' }] },
      { sourceIP: '2.2.2.2', inputSummary: 'B' });

    const result = queryAuditLog({});
    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].inputSummary).toBe('B');
  });

  it('filters by safe=true', () => {
    logScan({ safe: true, threats: [] }, { sourceIP: '1.1.1.1', inputSummary: 'Good' });
    logScan({ safe: false, threats: [{ field: 's', type: 'xss', severity: 'high', description: 'x' }] },
      { sourceIP: '2.2.2.2', inputSummary: 'Bad' });

    const result = queryAuditLog({ safe: true });
    expect(result.total).toBe(1);
    expect(result.entries[0].safe).toBe(true);
  });

  it('filters by safe=false', () => {
    logScan({ safe: true, threats: [] }, { sourceIP: '1.1.1.1', inputSummary: 'Good' });
    logScan({ safe: false, threats: [{ field: 's', type: 'xss', severity: 'high', description: 'x' }] },
      { sourceIP: '2.2.2.2', inputSummary: 'Bad' });

    const result = queryAuditLog({ safe: false });
    expect(result.total).toBe(1);
    expect(result.entries[0].safe).toBe(false);
  });

  it('filters by threatType', () => {
    logScan({
      safe: false,
      threats: [{ field: 's', type: 'prompt_injection', severity: 'critical', description: 'pi' }],
    }, { sourceIP: '1.1.1.1', inputSummary: 'A' });
    logScan({
      safe: false,
      threats: [{ field: 's', type: 'xss', severity: 'high', description: 'x' }],
    }, { sourceIP: '2.2.2.2', inputSummary: 'B' });

    const result = queryAuditLog({ threatType: 'xss' });
    expect(result.total).toBe(1);
    expect(result.entries[0].threats[0].type).toBe('xss');
  });

  it('paginates with limit and offset', () => {
    for (let i = 0; i < 10; i++) {
      logScan({ safe: true, threats: [] }, { sourceIP: '1.1.1.1', inputSummary: `Entry ${i}` });
    }

    const page1 = queryAuditLog({ limit: 3, offset: 0 });
    expect(page1.total).toBe(10);
    expect(page1.entries).toHaveLength(3);

    const page2 = queryAuditLog({ limit: 3, offset: 3 });
    expect(page2.entries).toHaveLength(3);
    expect(page2.entries[0].id).not.toBe(page1.entries[0].id);
  });

  it('computes accurate stats', () => {
    logScan({ safe: true, threats: [] }, { sourceIP: '1.1.1.1', inputSummary: 'A' });
    logScan({ safe: true, threats: [] }, { sourceIP: '1.1.1.1', inputSummary: 'B' });
    logScan({
      safe: false,
      threats: [
        { field: 's', type: 'prompt_injection', severity: 'critical', description: 'pi' },
        { field: 'd', type: 'xss', severity: 'high', description: 'x' },
      ],
    }, { sourceIP: '2.2.2.2', inputSummary: 'C' });

    const stats = getAuditStats();
    expect(stats.totalScans).toBe(3);
    expect(stats.totalAllowed).toBe(2);
    expect(stats.totalBlocked).toBe(1);
    expect(stats.blockRate).toBeCloseTo(1 / 3, 2);
    expect(stats.threatBreakdown).toHaveProperty('prompt_injection', 1);
    expect(stats.threatBreakdown).toHaveProperty('xss', 1);
    expect(stats.recentBlockRate).toHaveLength(3);
    expect(stats.recentBlockRate[0].period).toBe('1h');
  });

  it('returns empty stats when no entries exist', () => {
    const stats = getAuditStats();
    expect(stats.totalScans).toBe(0);
    expect(stats.blockRate).toBe(0);
    expect(stats.threatBreakdown).toEqual({});
  });

  it('caps limit at 200', () => {
    for (let i = 0; i < 5; i++) {
      logScan({ safe: true, threats: [] }, { sourceIP: '1.1.1.1', inputSummary: `E ${i}` });
    }
    const result = queryAuditLog({ limit: 999 });
    expect(result.entries.length).toBeLessThanOrEqual(200);
  });
});
