'use client';

import { useState, useRef } from 'react';
import NetworkStatus from '@/components/NetworkStatus';
import MemoryTimeline, { type MemoryTimelineHandle } from '@/components/MemoryTimeline';
import MemoryDetail from '@/components/MemoryDetail';
import CreateMemory from '@/components/CreateMemory';
import ConnectInfo from '@/components/ConnectInfo';
import BlockchainExplorer from '@/components/BlockchainExplorer';
import SecurityAuditLog from '@/components/SecurityAuditLog';

export default function Home() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const timelineRef = useRef<MemoryTimelineHandle>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-400">
            Browse and inspect AI memories stored on-chain with IPFS backing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NetworkStatus />
          <button
            onClick={() => setShowSecurity(true)}
            title="View security audit log"
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Security
          </button>
          <button
            onClick={() => setShowExplorer(true)}
            title="Search and explore the blockchain"
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Explorer
          </button>
          <button
            onClick={() => setShowConnect(true)}
            title="Share dashboard with other devices"
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-chain-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-chain-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Memory
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <MemoryTimeline ref={timelineRef} selectedId={selectedId} onSelect={setSelectedId} />
        <MemoryDetail memoryId={selectedId} />
      </div>

      {showCreate && (
        <CreateMemory
          onCreated={(result) => {
            timelineRef.current?.refresh();
            setSelectedId(result.id);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showConnect && <ConnectInfo onClose={() => setShowConnect(false)} />}

      {showSecurity && <SecurityAuditLog onClose={() => setShowSecurity(false)} />}

      {showExplorer && (
        <BlockchainExplorer
          onSelectMemory={(id) => setSelectedId(id)}
          onClose={() => setShowExplorer(false)}
        />
      )}
    </div>
  );
}
