'use client';

import { useState, useCallback } from 'react';
import {
  searchMemories,
  type SearchQuery,
  type SearchResult,
  type MemoryType,
  type MemoryDetail,
} from '@/lib/api';

interface BlockchainExplorerProps {
  onSelectMemory: (id: number) => void;
  onClose: () => void;
}

const MEMORY_TYPES: { value: MemoryType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'note', label: 'Note' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'code', label: 'Code' },
  { value: 'file', label: 'File' },
  { value: 'image', label: 'Image' },
];

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '...';
}

type TabId = 'search' | 'filters' | 'vector';

export default function BlockchainExplorer({ onSelectMemory, onClose }: BlockchainExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('search');
  const [textQuery, setTextQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MemoryType | ''>('');
  const [tagsFilter, setTagsFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [embeddingInput, setEmbeddingInput] = useState('');
  const [topK, setTopK] = useState(20);

  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: SearchQuery = { topK };

      if (textQuery.trim()) query.q = textQuery.trim();
      if (typeFilter) query.type = typeFilter;
      if (tagsFilter.trim()) {
        query.tags = tagsFilter.split(',').map((t) => t.trim()).filter(Boolean);
      }
      if (authorFilter.trim()) query.author = authorFilter.trim();
      if (fromDate) query.fromTimestamp = Math.floor(new Date(fromDate).getTime() / 1000);
      if (toDate) query.toTimestamp = Math.floor(new Date(toDate).getTime() / 1000);

      if (embeddingInput.trim()) {
        try {
          const parsed = JSON.parse(
            embeddingInput.trim().startsWith('[') ? embeddingInput.trim() : `[${embeddingInput.trim()}]`,
          );
          if (Array.isArray(parsed) && parsed.every((n: unknown) => typeof n === 'number')) {
            query.embedding = parsed;
          }
        } catch {
          setError('Invalid embedding format. Use comma-separated numbers or a JSON array.');
          setLoading(false);
          return;
        }
      }

      const data = await searchMemories(query);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [textQuery, typeFilter, tagsFilter, authorFilter, fromDate, toDate, embeddingInput, topK]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'search', label: 'Text Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { id: 'filters', label: 'Filters', icon: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' },
    { id: 'vector', label: 'Vector Search', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 p-5">
          <div>
            <h2 className="text-xl font-bold text-white">Blockchain Explorer</h2>
            <p className="mt-0.5 text-sm text-gray-400">
              Search and filter memories across the chain
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

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'border-b-2 border-chain-500 text-chain-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search panels */}
        <div className="p-5">
          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search summaries, content, tags, custom data..."
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-chain-500 focus:outline-none focus:ring-1 focus:ring-chain-500"
                />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as MemoryType | '')}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-chain-500 focus:outline-none"
                >
                  {MEMORY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="rounded-lg bg-chain-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-chain-700 disabled:opacity-50"
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={tagsFilter}
                  onChange={(e) => setTagsFilter(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Filter by tags (comma-separated)"
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-chain-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Filter by author (0x...)"
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-chain-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'filters' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Memory Type</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as MemoryType | '')}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-chain-500 focus:outline-none"
                  >
                    {MEMORY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Author Address</label>
                  <input
                    type="text"
                    value={authorFilter}
                    onChange={(e) => setAuthorFilter(e.target.value)}
                    placeholder="0x..."
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-chain-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={tagsFilter}
                    onChange={(e) => setTagsFilter(e.target.value)}
                    placeholder="ai, memory, preferences"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-chain-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Max Results</label>
                  <input
                    type="number"
                    value={topK}
                    onChange={(e) => setTopK(Math.max(1, parseInt(e.target.value) || 20))}
                    min={1}
                    max={200}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-chain-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">From Date</label>
                  <input
                    type="datetime-local"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-chain-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">To Date</label>
                  <input
                    type="datetime-local"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-chain-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Optional: text search across all fields"
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-chain-500 focus:outline-none"
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="rounded-lg bg-chain-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-chain-700 disabled:opacity-50"
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'vector' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Embedding Vector (comma-separated or JSON array)
                </label>
                <textarea
                  value={embeddingInput}
                  onChange={(e) => setEmbeddingInput(e.target.value)}
                  placeholder="[0.12, -0.45, 0.78, 0.33, -0.91, ...]"
                  rows={3}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-chain-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Paste an embedding vector to find memories by cosine similarity.
                  Results are ranked by similarity score.
                </p>
              </div>
              <div className="flex items-end gap-3">
                <div className="w-32">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Top K</label>
                  <input
                    type="number"
                    value={topK}
                    onChange={(e) => setTopK(Math.max(1, parseInt(e.target.value) || 20))}
                    min={1}
                    max={200}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-chain-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={loading || !embeddingInput.trim()}
                  className="rounded-lg bg-chain-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-chain-700 disabled:opacity-50"
                >
                  {loading ? 'Searching...' : 'Find Similar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-4 rounded-lg bg-red-900/30 p-3 text-sm text-red-400">{error}</div>
        )}

        {/* Results */}
        {results && (
          <div className="border-t border-gray-800 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {results.total} result{results.total !== 1 ? 's' : ''} found
              </h3>
              {results.results.some((r) => r.score !== undefined) && (
                <span className="text-xs text-gray-500">Ranked by cosine similarity</span>
              )}
            </div>

            {results.results.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No memories match your search criteria.</p>
            ) : (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {results.results.map((mem) => (
                  <ResultCard
                    key={mem.id}
                    memory={mem}
                    expanded={expandedId === mem.id}
                    onToggle={() => setExpandedId(expandedId === mem.id ? null : mem.id)}
                    onOpen={() => { onSelectMemory(mem.id); onClose(); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  memory,
  expanded,
  onToggle,
  onOpen,
}: {
  memory: MemoryDetail & { score?: number };
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const ipfs = memory.ipfsContent;
  const typeColors: Record<string, string> = {
    note: 'bg-blue-900/40 text-blue-400',
    conversation: 'bg-purple-900/40 text-purple-400',
    code: 'bg-emerald-900/40 text-emerald-400',
    file: 'bg-amber-900/40 text-amber-400',
    image: 'bg-pink-900/40 text-pink-400',
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-800/30 transition hover:border-gray-700">
      <button onClick={onToggle} className="w-full p-3 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-gray-500">#{memory.id}</span>
              {ipfs?.type && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColors[ipfs.type] || 'bg-gray-800 text-gray-400'}`}>
                  {ipfs.type}
                </span>
              )}
              {ipfs?.tags?.map((tag) => (
                <span key={tag} className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">
                  {tag}
                </span>
              ))}
              {memory.score !== undefined && (
                <span className="rounded bg-chain-900/40 px-2 py-0.5 text-[10px] font-medium text-chain-400">
                  {(memory.score * 100).toFixed(1)}% match
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-200">{memory.summary}</p>
          </div>
          <span className="shrink-0 text-[11px] text-gray-500">{formatTime(memory.timestamp)}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-3 pt-2">
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <span className="text-gray-500">CID: </span>
              <span className="font-mono text-chain-400">{truncate(memory.ipfsCID, 24)}</span>
            </div>
            <div>
              <span className="text-gray-500">SHA-256: </span>
              <span className="font-mono text-amber-400">{truncate(memory.sha256Hash, 24)}</span>
            </div>
            <div>
              <span className="text-gray-500">Author: </span>
              <span className="font-mono text-gray-300">{truncate(memory.author, 18)}</span>
            </div>
            <div>
              <span className="text-gray-500">Embedding dims: </span>
              <span className="text-gray-300">{memory.embedding.length}</span>
            </div>
          </div>

          {ipfs?.data && Object.keys(ipfs.data).length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-gray-500">Data: </span>
              <pre className="mt-1 max-h-24 overflow-auto rounded bg-gray-800/60 p-2 text-[11px] text-gray-400">
                {JSON.stringify(ipfs.data, null, 2)}
              </pre>
            </div>
          )}

          <button
            onClick={onOpen}
            className="mt-2 text-xs font-medium text-chain-400 transition hover:text-chain-300"
          >
            Open full detail view →
          </button>
        </div>
      )}
    </div>
  );
}
