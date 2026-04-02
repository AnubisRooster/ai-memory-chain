import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

const ABI = [
  'function storeMemory(string calldata _summary, string calldata _ipfsCID, bytes32 _sha256Hash, int16[] calldata _embedding) external returns (uint256)',
  'function getMemory(uint256 _id) external view returns (string summary, uint256 timestamp, string ipfsCID, bytes32 sha256Hash, int16[] embedding, address author)',
  'function getMemoryCount() external view returns (uint256)',
  'function getMemorySummary(uint256 _id) external view returns (string, uint256)',
  'event MemoryStored(uint256 indexed id, address indexed author, string ipfsCID, bytes32 sha256Hash, uint256 timestamp)',
];

const RPC_TIMEOUT_MS = 15_000;
const TX_CONFIRM_TIMEOUT_MS = 60_000;
const TX_MAX_RETRIES = 3;
const TX_BASE_DELAY_MS = 2_000;

// ── Multi-RPC failover ──────────────────────────────────────────────
// RPC_URL supports comma-separated endpoints for failover:
//   RPC_URL=http://node1:8545,http://node2:8545,http://node3:8545

let providers: ethers.JsonRpcProvider[] = [];
let activeProviderIndex = 0;
let contract: ethers.Contract | null = null;
let signer: ethers.Wallet | null = null;

function getRpcUrls(): string[] {
  const raw = process.env.RPC_URL || 'http://127.0.0.1:8545';
  return raw.split(',').map((u) => u.trim()).filter(Boolean);
}

function initProviders(): void {
  if (providers.length > 0) return;
  const urls = getRpcUrls();
  providers = urls.map((url) => {
    const fetchReq = new ethers.FetchRequest(url);
    fetchReq.timeout = RPC_TIMEOUT_MS;
    return new ethers.JsonRpcProvider(fetchReq);
  });
  activeProviderIndex = 0;
}

function getContractAddress(): string {
  const envAddr = process.env.CONTRACT_ADDRESS;
  if (envAddr) return envAddr;

  const deployPath = path.resolve(__dirname, '..', '..', '..', 'deployment.json');
  if (fs.existsSync(deployPath)) {
    const info = JSON.parse(fs.readFileSync(deployPath, 'utf-8'));
    return info.address;
  }

  throw new Error(
    'Contract address not found. Set CONTRACT_ADDRESS env var or deploy the contract first.',
  );
}

export function getProvider(): ethers.JsonRpcProvider {
  initProviders();
  return providers[activeProviderIndex];
}

/**
 * Rotate to the next RPC provider. Returns true if a different provider
 * is now active, false if we've exhausted all options (wraps around).
 */
function rotateProvider(): boolean {
  if (providers.length <= 1) return false;
  const prev = activeProviderIndex;
  activeProviderIndex = (activeProviderIndex + 1) % providers.length;
  contract = null;
  signer = null;
  console.warn(`[blockchain] RPC failover: ${getRpcUrls()[prev]} → ${getRpcUrls()[activeProviderIndex]}`);
  return activeProviderIndex !== 0;
}

/**
 * Execute a read operation with automatic failover across RPC endpoints.
 */
async function withFailover<T>(operation: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
  initProviders();
  const startIdx = activeProviderIndex;
  let lastError: Error | null = null;

  for (let i = 0; i < providers.length; i++) {
    try {
      return await operation(providers[(startIdx + i) % providers.length]);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < providers.length - 1) {
        rotateProvider();
      }
    }
  }
  throw lastError!;
}

export function getContract(): ethers.Contract {
  if (!contract) {
    const p = getProvider();
    const key = process.env.DEPLOYER_PRIVATE_KEY || '0x' + 'ac'.repeat(32);
    signer = new ethers.Wallet(key, p);
    contract = new ethers.Contract(getContractAddress(), ABI, signer);
  }
  return contract;
}

export interface OnChainMemory {
  summary: string;
  timestamp: number;
  ipfsCID: string;
  sha256Hash: string;
  embedding: number[];
  author: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Store a memory on-chain with retry + exponential backoff.
 * On transient failures (timeouts, RPC errors), retries up to TX_MAX_RETRIES
 * times with failover to alternate RPC endpoints.
 */
export async function storeMemoryOnChain(
  summary: string,
  ipfsCID: string,
  sha256Hash: string,
  embedding: number[],
): Promise<{ id: number; txHash: string; timestamp: number }> {
  const int16Embedding = embedding.map((v) => Math.round(Math.max(-32768, Math.min(32767, v))));
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= TX_MAX_RETRIES; attempt++) {
    try {
      const c = getContract();
      const tx = await c.storeMemory(summary, ipfsCID, sha256Hash, int16Embedding);

      const receipt = await Promise.race([
        tx.wait(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Transaction confirmation timed out after ${TX_CONFIRM_TIMEOUT_MS}ms`)), TX_CONFIRM_TIMEOUT_MS)
        ),
      ]);

      if (!receipt) throw new Error('Transaction receipt is null — possible reorg');

      const event = receipt.logs
        .map((log: ethers.Log) => {
          try {
            return c.interface.parseLog({ topics: [...log.topics], data: log.data });
          } catch {
            return null;
          }
        })
        .find((e: ethers.LogDescription | null) => e?.name === 'MemoryStored');

      if (!event) throw new Error('MemoryStored event not found in transaction receipt');

      return {
        id: Number(event.args[0]),
        txHash: receipt.hash,
        timestamp: Number(event.args[4]),
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on non-transient errors (revert, bad input, etc.)
      const msg = lastError.message.toLowerCase();
      if (msg.includes('revert') || msg.includes('invalid') || msg.includes('rejected')) {
        throw lastError;
      }

      if (attempt < TX_MAX_RETRIES) {
        const delay = TX_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[blockchain] Tx attempt ${attempt + 1}/${TX_MAX_RETRIES + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        rotateProvider();
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}

export async function getMemoryOnChain(id: number): Promise<OnChainMemory> {
  return withFailover(async (p) => {
    const key = process.env.DEPLOYER_PRIVATE_KEY || '0x' + 'ac'.repeat(32);
    const s = new ethers.Wallet(key, p);
    const c = new ethers.Contract(getContractAddress(), ABI, s);
    const [summary, timestamp, ipfsCID, sha256Hash, embedding, author] = await c.getMemory(id);
    return {
      summary,
      timestamp: Number(timestamp),
      ipfsCID,
      sha256Hash,
      embedding: embedding.map(Number),
      author,
    };
  });
}

export async function getMemoryCount(): Promise<number> {
  return withFailover(async (p) => {
    const key = process.env.DEPLOYER_PRIVATE_KEY || '0x' + 'ac'.repeat(32);
    const s = new ethers.Wallet(key, p);
    const c = new ethers.Contract(getContractAddress(), ABI, s);
    return Number(await c.getMemoryCount());
  });
}

export async function getMemorySummaryOnChain(id: number): Promise<{ summary: string; timestamp: number }> {
  return withFailover(async (p) => {
    const key = process.env.DEPLOYER_PRIVATE_KEY || '0x' + 'ac'.repeat(32);
    const s = new ethers.Wallet(key, p);
    const c = new ethers.Contract(getContractAddress(), ABI, s);
    const [summary, timestamp] = await c.getMemorySummary(id);
    return { summary, timestamp: Number(timestamp) };
  });
}

export async function isPolygonOnline(): Promise<boolean> {
  try {
    await withFailover(async (p) => p.getBlockNumber());
    return true;
  } catch {
    return false;
  }
}
