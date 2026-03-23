'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { createMemory, type MemoryType, type CreateMemoryResult } from '@/lib/api';

interface CreateMemoryProps {
  onCreated: (result: CreateMemoryResult) => void;
  onClose: () => void;
}

const MEMORY_TYPES: { value: MemoryType; label: string; icon: string; placeholder: string }[] = [
  {
    value: 'note',
    label: 'Note',
    icon: 'M',
    placeholder: 'A thought, observation, or preference to remember...',
  },
  {
    value: 'conversation',
    label: 'Conversation',
    icon: 'C',
    placeholder: 'Paste a conversation transcript or key exchange...',
  },
  {
    value: 'code',
    label: 'Code Snippet',
    icon: '<>',
    placeholder: 'Paste code, config, or a command to remember...',
  },
  {
    value: 'file',
    label: 'Document',
    icon: 'D',
    placeholder: 'Add a description for the attached document(s)...',
  },
  {
    value: 'image',
    label: 'Image',
    icon: 'I',
    placeholder: 'Add a description for the attached image(s)...',
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CreateMemory({ onCreated, onClose }: CreateMemoryProps) {
  const [type, setType] = useState<MemoryType>('note');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [embedding, setEmbedding] = useState('');
  const [tags, setTags] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateMemoryResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentType = MEMORY_TYPES.find((t) => t.value === type)!;
  const showFileZone = type === 'file' || type === 'image';
  const acceptAttr = type === 'image' ? 'image/*' : undefined;

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const arr = Array.from(newFiles);
      if (type === 'image') {
        const images = arr.filter((f) => f.type.startsWith('image/'));
        setFiles((prev) => [...prev, ...images]);
      } else {
        setFiles((prev) => [...prev, ...arr]);
      }
    },
    [type],
  );

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    if (!summary.trim()) {
      setError('Summary is required.');
      return;
    }

    if (jsonData.trim()) {
      try {
        JSON.parse(jsonData);
      } catch {
        setError('Custom JSON data is not valid JSON.');
        return;
      }
    }

    if (embedding.trim()) {
      try {
        const parsed = embedding.trim().startsWith('[')
          ? JSON.parse(embedding)
          : JSON.parse(`[${embedding}]`);
        if (!Array.isArray(parsed) || !parsed.every((v: unknown) => typeof v === 'number')) {
          throw new Error();
        }
      } catch {
        setError('Embedding must be a comma-separated list of numbers (e.g. 0.1, -0.3, 0.5).');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await createMemory({
        summary: summary.trim(),
        type,
        content: content.trim(),
        embedding: embedding.trim(),
        tags: tags.trim(),
        data: jsonData.trim(),
        files,
      });
      setSuccess(result);
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create memory');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSummary('');
    setContent('');
    setEmbedding('');
    setTags('');
    setJsonData('');
    setFiles([]);
    setError(null);
    setSuccess(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-16 pb-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Create Memory</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Success state */}
          {success && (
            <div className="rounded-lg border border-emerald-800 bg-emerald-900/30 p-4">
              <p className="text-sm font-medium text-emerald-400">Memory #{success.id} created</p>
              <div className="mt-2 space-y-1 text-xs text-emerald-300/80">
                <p>
                  CID: <span className="font-mono">{success.ipfsCID}</span>
                </p>
                <p>
                  TX: <span className="font-mono">{success.txHash.slice(0, 20)}...</span>
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleReset}
                  className="rounded-md bg-emerald-800/50 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-800"
                >
                  Create Another
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {!success && (
            <>
              {/* Type selector */}
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Memory Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {MEMORY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => {
                        setType(t.value);
                        if (t.value !== 'file' && t.value !== 'image') setFiles([]);
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        type === t.value
                          ? 'border-chain-600 bg-chain-900/30 text-chain-300'
                          : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-700/50 text-[10px] font-bold">
                        {t.icon}
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Summary <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Short description of this memory"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition focus:border-chain-600 focus:ring-1 focus:ring-chain-600"
                />
              </div>

              {/* Content */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={currentType.placeholder}
                  rows={type === 'code' ? 8 : 4}
                  className={`w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition focus:border-chain-600 focus:ring-1 focus:ring-chain-600 ${
                    type === 'code' ? 'font-mono text-xs' : ''
                  }`}
                />
              </div>

              {/* File drop zone */}
              {showFileZone && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                    Attachments
                  </label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${
                      dragOver
                        ? 'border-chain-500 bg-chain-900/20'
                        : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={acceptAttr}
                      className="hidden"
                      onChange={(e) => e.target.files && addFiles(e.target.files)}
                    />
                    <svg
                      className="mx-auto h-8 w-8 text-gray-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
                      />
                    </svg>
                    <p className="mt-2 text-sm text-gray-400">
                      Drop {type === 'image' ? 'images' : 'files'} here or click to browse
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Up to 50 MB per file</p>
                  </div>

                  {files.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {files.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            {f.type.startsWith('image/') && (
                              <img
                                src={URL.createObjectURL(f)}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded object-cover"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm text-gray-300">{f.name}</p>
                              <p className="text-xs text-gray-500">{formatBytes(f.size)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => removeFile(i)}
                            className="ml-2 shrink-0 rounded p-1 text-gray-500 transition hover:bg-gray-700 hover:text-red-400"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Tags */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Tags
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="architecture, preferences, bug-fix (comma separated)"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition focus:border-chain-600 focus:ring-1 focus:ring-chain-600"
                />
              </div>

              {/* Collapsible advanced section */}
              <details className="group rounded-lg border border-gray-800 bg-gray-800/20">
                <summary className="cursor-pointer list-none px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-400 transition hover:text-gray-300">
                  <span className="inline-block transition group-open:rotate-90">&#9654;</span>{' '}
                  Advanced Options
                </summary>
                <div className="space-y-4 px-4 pb-4">
                  {/* Embedding */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Embedding Vector
                    </label>
                    <input
                      type="text"
                      value={embedding}
                      onChange={(e) => setEmbedding(e.target.value)}
                      placeholder="0.12, -0.45, 0.78, 0.33 (comma separated numbers)"
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs text-gray-200 placeholder-gray-500 outline-none transition focus:border-chain-600 focus:ring-1 focus:ring-chain-600"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Optional. Stored on-chain as int16 and at full precision in IPFS.
                    </p>
                  </div>

                  {/* Custom JSON data */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Custom JSON Data
                    </label>
                    <textarea
                      value={jsonData}
                      onChange={(e) => setJsonData(e.target.value)}
                      placeholder='{ "key": "value" }'
                      rows={3}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs text-gray-200 placeholder-gray-500 outline-none transition focus:border-chain-600 focus:ring-1 focus:ring-chain-600"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Arbitrary metadata stored in IPFS alongside the content.
                    </p>
                  </div>
                </div>
              </details>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-900/30 p-3 text-sm text-red-400">{error}</div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-800 pt-4">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !summary.trim()}
                  className="flex items-center gap-2 rounded-lg bg-chain-600 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-chain-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Storing on-chain...
                    </>
                  ) : (
                    'Store Memory'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
