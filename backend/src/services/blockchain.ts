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

let provider: ethers.JsonRpcProvider;
let contract: ethers.Contract;
let signer: ethers.Wallet;

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
  if (!provider) {
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
    provider = new ethers.JsonRpcProvider(rpcUrl);
  }
  return provider;
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

export async function storeMemoryOnChain(
  summary: string,
  ipfsCID: string,
  sha256Hash: string,
  embedding: number[],
): Promise<{ id: number; txHash: string; timestamp: number }> {
  const c = getContract();
  const int16Embedding = embedding.map((v) => Math.round(Math.max(-32768, Math.min(32767, v))));

  const tx = await c.storeMemory(summary, ipfsCID, sha256Hash, int16Embedding);
  const receipt = await tx.wait();

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
}

export async function getMemoryOnChain(id: number): Promise<OnChainMemory> {
  const c = getContract();
  const [summary, timestamp, ipfsCID, sha256Hash, embedding, author] = await c.getMemory(id);
  return {
    summary,
    timestamp: Number(timestamp),
    ipfsCID,
    sha256Hash,
    embedding: embedding.map(Number),
    author,
  };
}

export async function getMemoryCount(): Promise<number> {
  const c = getContract();
  return Number(await c.getMemoryCount());
}

export async function getMemorySummaryOnChain(id: number): Promise<{ summary: string; timestamp: number }> {
  const c = getContract();
  const [summary, timestamp] = await c.getMemorySummary(id);
  return { summary, timestamp: Number(timestamp) };
}

export async function isPolygonOnline(): Promise<boolean> {
  try {
    const p = getProvider();
    await p.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}
