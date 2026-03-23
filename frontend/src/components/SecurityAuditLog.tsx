'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getSecurityAudit,
  getSecurityStats,
  type AuditEntry,
  type AuditStats,
  type AuditQuery,
} from '@/lib/api';

interface Props {
  onClose: () => void;
}

const THREAT_LABELS: Record<string, string> = {
  prompt_injection: 'Prompt Injection',
  jailbreak: 'Jailbreak',
  xss: 'XSS',
  sql_injection: 'SQL Injection',
  command_injection: 'Command Injection',
  path_traversal: 'Path Traversal',
  excessive_length: 'Excessive Length',
  encoding_attack: 'Encoding Attack',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export default function SecurityAuditLog({ onClose }: Props) {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [filter, setFilter] = useState<'all' | 'blocked' | 'allowed'>('all');
  const [threatTypeFilter, setThreatTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: AuditQuery = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (filter === 'blocked') query.safe = false;
      if (filter === 'allowed') query.safe = true;
      if (threatTypeFilter) query.threatType = threatTypeFilter;

      const [statsRes, logRes] = await Promise.all([
        getSecurityStats(),
        getSecurityAudit(query),
      ]);
      setStats(statsRes);
      setEntries(logRes.entries);
      setTotal(logRes.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit data');
    } finally {
      setLoading(false);
    }
  }, [filter, threatTypeFilter, page]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">Security Audit Log</h2>
            <p className="mt-0.5 text-sm text-gray-400">
              All input security scans with threat detection history
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Total Scans" value={stats.totalScans} />
              <StatCard
                label="Blocked"
                value={stats.totalBlocked}
                accent={stats.totalBlocked > 0 ? 'red' : undefined}
              />
              <StatCard label="Allowed" value={stats.totalAllowed} accent="green" />
              <StatCard
                label="Block Rate"
                value={`${(stats.blockRate * 100).toFixed(1)}%`}
                accent={stats.blockRate > 0.1 ? 'red' : undefined}
              />
            </div>
          )}

          {/* Threat Breakdown */}
          {stats && Object.keys(stats.threatBreakdown).length > 0 && (
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
              <h3 className="mb-3 text-sm font-medium text-gray-300">Threat Type Breakdown</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.threatBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <button
                      key={type}
                      onClick={() => {
                        setThreatTypeFilter(threatTypeFilter === type ? '' : type);
                        setPage(0);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        threatTypeFilter === type
                          ? 'border-chain-500 bg-chain-500/20 text-chain-400'
                          : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {THREAT_LABELS[type] || type}: {count}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3">
            {(['all', 'blocked', 'allowed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(0); }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  filter === f
                    ? 'bg-chain-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-sm text-gray-500">
              {total} {total === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {/* Log Table */}
          <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-700">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                Loading...
              </div>
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                No audit entries found
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-800 text-gray-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Time</th>
                    <th className="px-4 py-2.5 text-left font-medium">Summary</th>
                    <th className="px-4 py-2.5 text-left font-medium">Type</th>
                    <th className="px-4 py-2.5 text-center font-medium">Threats</th>
                    <th className="px-4 py-2.5 text-center font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {entries.map((entry) => (
                    <LogRow
                      key={entry.id}
                      entry={entry}
                      expanded={expandedId === entry.id}
                      onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="rounded px-3 py-1 text-sm text-gray-400 transition hover:bg-gray-800 hover:text-white disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-sm text-gray-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="rounded px-3 py-1 text-sm text-gray-400 transition hover:bg-gray-800 hover:text-white disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: 'red' | 'green' }) {
  const valueColor =
    accent === 'red' ? 'text-red-400' : accent === 'green' ? 'text-green-400' : 'text-white';
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

function LogRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ts = new Date(entry.timestamp + (entry.timestamp.endsWith('Z') ? '' : 'Z'));
  const timeStr = ts.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <>
      <tr
        onClick={entry.threatCount > 0 ? onToggle : undefined}
        className={`transition ${
          entry.threatCount > 0 ? 'cursor-pointer hover:bg-gray-800/70' : ''
        } ${!entry.safe ? 'bg-red-500/5' : ''}`}
      >
        <td className="whitespace-nowrap px-4 py-2.5 text-gray-400">{timeStr}</td>
        <td className="max-w-[200px] truncate px-4 py-2.5 text-gray-300">
          {entry.inputSummary || '(empty)'}
        </td>
        <td className="px-4 py-2.5 text-gray-400">{entry.memoryType || '-'}</td>
        <td className="px-4 py-2.5 text-center">
          {entry.threatCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
              {entry.threatCount}
            </span>
          ) : (
            <span className="text-gray-600">0</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-center">
          {entry.safe ? (
            <span className="inline-flex rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-400">
              Allowed
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400">
              Blocked
            </span>
          )}
        </td>
      </tr>
      {expanded && entry.threats.length > 0 && (
        <tr>
          <td colSpan={5} className="border-t border-gray-800 bg-gray-850 px-4 py-3">
            <div className="space-y-2">
              {entry.threats.map((t, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_COLORS[t.severity] || 'bg-gray-700/50 text-gray-300 border-gray-600'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      [{t.severity.toUpperCase()}] {THREAT_LABELS[t.type] || t.type}
                    </span>
                    <span className="text-gray-500">Field: {t.field}</span>
                  </div>
                  <p className="mt-1 text-gray-400">{t.description}</p>
                  {t.matchedPattern && (
                    <p className="mt-1 font-mono text-gray-500">
                      Pattern: {t.matchedPattern}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
