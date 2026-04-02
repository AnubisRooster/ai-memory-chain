import { isPolygonOnline, getProvider } from './blockchain';
import { isIPFSOnline } from './ipfs';
import { getValidators, getPeerCount } from './validator';

interface ValidatorLiveness {
  address: string;
  lastSeen: number;
  reachable: boolean;
  consecutiveFailures: number;
}

interface HealthState {
  polygon: boolean;
  ipfs: boolean;
  lastBlockNumber: number | null;
  lastBlockAdvancedAt: number;
  polygonPeers: number;
  uptimeSeconds: number;
  checksRun: number;
  validatorCount: number;
  validatorLiveness: Record<string, ValidatorLiveness>;
  chainStalled: boolean;
}

const state: HealthState = {
  polygon: false,
  ipfs: false,
  lastBlockNumber: null,
  lastBlockAdvancedAt: Date.now(),
  polygonPeers: 0,
  uptimeSeconds: 0,
  checksRun: 0,
  validatorCount: 0,
  validatorLiveness: {},
  chainStalled: false,
};

const startTime = Date.now();
let intervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_MS = 300_000; // 5 min with no new blocks = stalled

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

      // Stall detection
      const staleDuration = Date.now() - state.lastBlockAdvancedAt;
      state.chainStalled = staleDuration > STALE_THRESHOLD_MS;
    } catch {
      // RPC call failed; polygon might have just gone offline
    }

    // Track validator set size
    try {
      const validators = await getValidators();
      state.validatorCount = validators.length;
    } catch {}
  }

  if (!state.polygon || !state.ipfs) {
    const downServices = [];
    if (!state.polygon) downServices.push('Polygon');
    if (!state.ipfs) downServices.push('IPFS');
    console.warn(`[health-monitor] Infrastructure degraded: ${downServices.join(', ')} offline`);
  }

  if (state.chainStalled) {
    console.warn(`[health-monitor] Chain appears stalled (no new blocks for ${Math.floor((Date.now() - state.lastBlockAdvancedAt) / 1000)}s)`);
  }
}

export function startHealthMonitor(): void {
  if (intervalId) return;
  console.log('[health-monitor] Starting background health monitor (30s interval)');

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
