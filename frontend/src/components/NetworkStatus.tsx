'use client';

import { useEffect, useState } from 'react';
import { getHealth, type HealthStatus } from '@/lib/api';

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-red-500'
      }`}
    />
  );
}

export default function NetworkStatus() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const h = await getHealth();
        if (mounted) {
          setHealth(h);
          setError(false);
        }
      } catch {
        if (mounted) setError(true);
      }
    }

    poll();
    const interval = setInterval(poll, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (error || !health) {
    return (
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span className="badge-offline">
          <StatusDot online={false} /> Backend offline
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className={health.polygon ? 'badge-online' : 'badge-offline'}>
        <StatusDot online={health.polygon} />
        Polygon {health.polygon ? 'Online' : 'Offline'}
      </span>
      <span className={health.ipfs ? 'badge-online' : 'badge-offline'}>
        <StatusDot online={health.ipfs} />
        IPFS {health.ipfs ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}
