import { isPolygonOnline, getProvider } from './blockchain';
import { isIPFSOnline } from './ipfs';

interface HealthState {
  polygon: boolean;
  ipfs: boolean;
  lastBlockNumber: number | null;
  lastBlockAdvancedAt: number;
  polygonPeers: number;
  uptimeSeconds: number;
  checksRun: number;
}

const state: HealthState = {
  polygon: false,
  ipfs: false,
  lastBlockNumber: null,
  lastBlockAdvancedAt: Date.now(),
  polygonPeers: 0,
  uptimeSeconds: 0,
  checksRun: 0,
};

const startTime = Date.now();
let intervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 30_000;

async function runCheck(): Promise<void> {
  state.checksRun++;
  state.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  try {
    state.polygon = await isPolygonOnline();
  } catch {
    state.polygon = false;
  }

  try {
    state.ipfs = await isIPFSOnline();
  } catch {
    state.ipfs = false;
  }

  if (state.polygon) {
    try {
      const provider = getProvider();
      const blockNumber = await provider.getBlockNumber();

      if (state.lastBlockNumber !== null && blockNumber > state.lastBlockNumber) {
        state.lastBlockAdvancedAt = Date.now();
      }
      state.lastBlockNumber = blockNumber;

      const peerCountHex = await provider.send('net_peerCount', []);
      state.polygonPeers = parseInt(peerCountHex, 16) || 0;
    } catch {
      // RPC call failed; polygon might have just gone offline
    }
  }

  if (!state.polygon || !state.ipfs) {
    const downServices = [];
    if (!state.polygon) downServices.push('Polygon');
    if (!state.ipfs) downServices.push('IPFS');
    console.warn(`[health-monitor] Infrastructure degraded: ${downServices.join(', ')} offline`);
  }
}

export function startHealthMonitor(): void {
  if (intervalId) return;
  console.log('[health-monitor] Starting background health monitor (30s interval)');

  // Initial check after a short delay to let services stabilize
  setTimeout(() => {
    runCheck().catch(() => {});
  }, 5_000);

  intervalId = setInterval(() => {
    runCheck().catch(() => {});
  }, CHECK_INTERVAL_MS);
}

export function stopHealthMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function getHealthState(): HealthState & { blockStaleSeconds: number } {
  const blockStaleSeconds = state.lastBlockNumber !== null
    ? Math.floor((Date.now() - state.lastBlockAdvancedAt) / 1000)
    : 0;
  return { ...state, blockStaleSeconds };
}
