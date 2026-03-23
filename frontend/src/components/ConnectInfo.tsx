'use client';

import { useEffect, useState } from 'react';
import { getConnectInfo, type ConnectInfo as ConnectInfoType } from '@/lib/api';

interface ConnectInfoProps {
  onClose: () => void;
}

export default function ConnectInfo({ onClose }: ConnectInfoProps) {
  const [info, setInfo] = useState<ConnectInfoType | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getConnectInfo()
      .then(setInfo)
      .catch(() => setError(true));
  }, []);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-24 pb-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Connect from Other Devices</h2>
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
          {error && (
            <div className="rounded-lg bg-red-900/30 p-3 text-sm text-red-400">
              Could not detect network addresses. Make sure the backend is running.
            </div>
          )}

          {!info && !error && (
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Detecting network addresses...
            </div>
          )}

          {info && (
            <>
              <p className="text-sm text-gray-400">
                Any device on the same network can open the dashboard. Share one of these URLs:
              </p>

              <div className="space-y-2">
                {info.frontend.map((url) => (
                  <div
                    key={url}
                    className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3"
                  >
                    <span className="font-mono text-sm text-chain-400">{url}</span>
                    <button
                      onClick={() => copyToClipboard(url)}
                      className="ml-3 shrink-0 rounded-md bg-gray-700 px-2.5 py-1 text-xs text-gray-300 transition hover:bg-gray-600"
                    >
                      {copied === url ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-800/20 p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Connection Details
                </h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Hostname</dt>
                    <dd className="font-mono text-gray-300">{info.hostname}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">LAN IPs</dt>
                    <dd className="font-mono text-gray-300">{info.addresses.join(', ')}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Frontend Port</dt>
                    <dd className="font-mono text-gray-300">3000</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Backend Port</dt>
                    <dd className="font-mono text-gray-300">3001</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg bg-gray-800/30 p-4 text-xs text-gray-500">
                <p className="font-medium text-gray-400">Requirements:</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>Both devices must be on the same Wi-Fi or LAN</li>
                  <li>No firewall blocking ports 3000 / 3001</li>
                  <li>The backend and IPFS must be running on this machine</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
