'use client';

import { useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { listMemories, type MemoryListItem } from '@/lib/api';

interface MemoryTimelineProps {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export interface MemoryTimelineHandle {
  refresh: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

const MemoryTimeline = forwardRef<MemoryTimelineHandle, MemoryTimelineProps>(
  function MemoryTimeline({ selectedId, onSelect }, ref) {
    const [memories, setMemories] = useState<MemoryListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await listMemories();
        setMemories(list.reverse());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }

    useImperativeHandle(ref, () => ({ refresh: load }));

    useEffect(() => {
      load();
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }, []);

    if (loading && memories.length === 0) {
      return (
        <div className="card animate-pulse">
          <div className="h-4 w-32 rounded bg-gray-800" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-800" />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Memory Timeline</h2>
          <button
            onClick={load}
            className="rounded-md bg-gray-800 px-3 py-1 text-xs text-gray-300 transition hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-red-900/30 p-3 text-sm text-red-400">{error}</div>
        )}

        {memories.length === 0 ? (
          <p className="text-sm text-gray-500">No memories stored yet.</p>
        ) : (
          <ul className="space-y-2">
            {memories.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onSelect(m.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedId === m.id
                      ? 'border-chain-600 bg-chain-900/20'
                      : 'border-gray-800 bg-gray-800/30 hover:border-gray-700 hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs text-gray-500">#{m.id}</span>
                    <span className="text-[11px] text-gray-500">{formatTime(m.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-200 line-clamp-2">{m.summary}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

export default MemoryTimeline;
