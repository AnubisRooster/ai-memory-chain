'use client';

import { useEffect, useState } from 'react';
import { getMemory, type MemoryDetail as MemoryDetailType, type FileAttachment } from '@/lib/api';
import EmbeddingChart from './EmbeddingChart';

interface MemoryDetailProps {
  memoryId: number | null;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function truncateHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  const colors: Record<string, string> = {
    note: 'bg-blue-900/40 text-blue-400 ring-blue-500/30',
    conversation: 'bg-purple-900/40 text-purple-400 ring-purple-500/30',
    code: 'bg-emerald-900/40 text-emerald-400 ring-emerald-500/30',
    file: 'bg-amber-900/40 text-amber-400 ring-amber-500/30',
    image: 'bg-pink-900/40 text-pink-400 ring-pink-500/30',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${colors[type] || 'bg-gray-800 text-gray-400 ring-gray-600'}`}
    >
      {type}
    </span>
  );
}

function FileList({ files, gateway }: { files: FileAttachment[]; gateway: string }) {
  return (
    <div className="card">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Attachments ({files.length})
      </h4>
      <ul className="space-y-2">
        {files.map((f, i) => {
          const url = `${gateway}/ipfs/${f.cid}`;
          const isImage = f.mimetype.startsWith('image/');
          return (
            <li key={i} className="rounded-lg bg-gray-800/50 p-3">
              <div className="flex items-start gap-3">
                {isImage && (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={f.filename}
                      className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-gray-700"
                    />
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-chain-400 transition hover:text-chain-300"
                  >
                    {f.filename}
                  </a>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>{formatBytes(f.size)}</span>
                    <span>{f.mimetype}</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-gray-500">{f.cid}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MemoryDetail({ memoryId }: MemoryDetailProps) {
  const [memory, setMemory] = useState<MemoryDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (memoryId === null) {
      setMemory(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getMemory(memoryId!);
        if (!cancelled) setMemory(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [memoryId]);

  if (memoryId === null) {
    return (
      <div className="card flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-gray-500">Select a memory from the timeline</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card animate-pulse space-y-4">
        <div className="h-5 w-40 rounded bg-gray-800" />
        <div className="h-4 w-full rounded bg-gray-800" />
        <div className="h-4 w-3/4 rounded bg-gray-800" />
        <div className="h-24 rounded bg-gray-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="rounded-lg bg-red-900/30 p-4 text-sm text-red-400">{error}</div>
      </div>
    );
  }

  if (!memory) return null;

  const ipfs = memory.ipfsContent;
  const ipfsGateway = '/api/ipfs';
  const hasContent = ipfs?.data && typeof ipfs.data === 'object' && 'content' in ipfs.data;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-500">Memory #{memory.id}</span>
              <TypeBadge type={ipfs?.type} />
              {ipfs?.tags?.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h3 className="mt-1 text-lg font-semibold text-white">{memory.summary}</h3>
          </div>
          <span className="whitespace-nowrap text-xs text-gray-500">
            {formatTime(memory.timestamp)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-800/50 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              IPFS CID
            </span>
            <p className="mt-1 break-all font-mono text-xs text-chain-400">{memory.ipfsCID}</p>
          </div>
          <div className="rounded-lg bg-gray-800/50 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              SHA-256
            </span>
            <p className="mt-1 font-mono text-xs text-amber-400" title={memory.sha256Hash}>
              {truncateHash(memory.sha256Hash)}
            </p>
          </div>
          <div className="rounded-lg bg-gray-800/50 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Author
            </span>
            <p className="mt-1 font-mono text-xs text-gray-300" title={memory.author}>
              {truncateHash(memory.author)}
            </p>
          </div>
          <div className="rounded-lg bg-gray-800/50 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Timestamp
            </span>
            <p className="mt-1 text-xs text-gray-300">{formatTime(memory.timestamp)}</p>
          </div>
        </div>
      </div>

      {/* Text content */}
      {hasContent && (
        <div className="card">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Content
          </h4>
          <pre
            className={`max-h-80 overflow-auto rounded-lg bg-gray-800/50 p-4 text-xs text-gray-300 whitespace-pre-wrap ${
              ipfs?.type === 'code' ? 'font-mono' : ''
            }`}
          >
            {String(ipfs!.data.content)}
          </pre>
        </div>
      )}

      {/* File attachments */}
      {ipfs?.files && ipfs.files.length > 0 && (
        <FileList files={ipfs.files} gateway={ipfsGateway} />
      )}

      {/* IPFS JSON data (excluding content which is shown above) */}
      {ipfs && (
        <div className="card">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            IPFS Data
          </h4>
          <pre className="max-h-64 overflow-auto rounded-lg bg-gray-800/50 p-4 text-xs text-gray-300">
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(ipfs.data).filter(([k]) => k !== 'content'),
              ),
              null,
              2,
            )}
          </pre>
        </div>
      )}

      {memory.embedding.length > 0 && (
        <div className="card">
          <EmbeddingChart embedding={memory.embedding} />
        </div>
      )}
    </div>
  );
}
