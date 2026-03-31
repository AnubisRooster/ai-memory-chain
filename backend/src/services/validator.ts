/**
 * Validator Management Service
 *
 * Manages the IBFT validator set via Polygon Edge's JSON-RPC interface.
 * Supports:
 *   - Listing current validators
 *   - Proposing new validators (vote to add)
 *   - Proposing validator removal (vote to remove)
 *   - Querying candidate status
 *   - Fetching node identity for join workflows
 *
 * Polygon Edge IBFT exposes these methods:
 *   ibft_getValidatorsByBlockNumber  — current validator set
 *   ibft_proposeCandidate            — vote to add/remove a validator
 *   ibft_getCandidates               — pending candidate votes
 *   ibft_getStatus                   — IBFT status (round, height, etc.)
 */

import { ethers } from 'ethers';
import { getProvider } from './blockchain';

const GRPC_TIMEOUT_MS = 10_000;

// ── Types ───────────────────────────────────────────────────────────

export interface ValidatorInfo {
  address: string;
  isProposer: boolean;
}

export interface CandidateInfo {
  address: string;
  vote: boolean; // true = vote to add, false = vote to remove
  auth: boolean;
}

export interface IBFTStatus {
  key: string;
  round: number;
  validators: string[];
  height: number;
}

export interface NodeIdentity {
  address: string;
  nodeId: string;
  blsPubkey?: string;
}

// ── Internal helpers ────────────────────────────────────────────────

async function ibftCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const provider = getProvider();
  const result = await Promise.race([
    provider.send(method, params),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${method} timed out after ${GRPC_TIMEOUT_MS}ms`)),
        GRPC_TIMEOUT_MS,
      ),
    ),
  ]);
  return result as T;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Get the current IBFT validator set.
 * Returns an array of validator addresses for the latest block.
 */
export async function getValidators(): Promise<string[]> {
  // ibft_getValidatorsByBlockNumber expects "latest" or a hex block number
  const validators = await ibftCall<string[]>('ibft_getValidatorsByBlockNumber', ['latest']);
  return validators.map((v: string) => v.toLowerCase());
}

/**
 * Propose adding a new validator address to the set.
 * The current node's IBFT key must be in the validator set for this to work.
 * In IBFT, a majority of existing validators must vote to add.
 * With a single validator, one vote is sufficient.
 */
export async function proposeValidator(address: string): Promise<boolean> {
  try {
    await ibftCall<boolean>('ibft_proposeCandidate', [address, true]);
    return true;
  } catch (err) {
    console.error(`Failed to propose validator ${address}:`, err);
    return false;
  }
}

/**
 * Propose removing a validator address from the set.
 * Same voting rules as addition — majority required.
 */
export async function proposeRemoveValidator(address: string): Promise<boolean> {
  try {
    await ibftCall<boolean>('ibft_proposeCandidate', [address, false]);
    return true;
  } catch (err) {
    console.error(`Failed to propose removal of ${address}:`, err);
    return false;
  }
}

/**
 * Get pending candidate votes (addresses being voted on).
 */
export async function getCandidates(): Promise<CandidateInfo[]> {
  try {
    const raw = await ibftCall<Record<string, boolean>>('ibft_getCandidates', []);
    return Object.entries(raw || {}).map(([address, vote]) => ({
      address: address.toLowerCase(),
      vote,
      auth: vote,
    }));
  } catch {
    return [];
  }
}

/**
 * Get IBFT consensus status.
 */
export async function getIBFTStatus(): Promise<IBFTStatus | null> {
  try {
    const status = await ibftCall<IBFTStatus>('ibft_getStatus', []);
    return status;
  } catch {
    return null;
  }
}

/**
 * Check whether a given address is already in the validator set.
 */
export async function isValidator(address: string): Promise<boolean> {
  const validators = await getValidators();
  return validators.includes(address.toLowerCase());
}

/**
 * Get the peer count from the Polygon Edge network layer.
 */
export async function getPeerCount(): Promise<number> {
  const provider = getProvider();
  try {
    const result = await provider.send('net_peerCount', []);
    return parseInt(result, 16);
  } catch {
    return 0;
  }
}

/**
 * Get connected peers from the network.
 */
export async function getConnectedPeers(): Promise<string[]> {
  try {
    const provider = getProvider();
    const result = await provider.send('net_peers', []);
    // Polygon Edge returns an object with peers array
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.peers)) return result.peers;
    return [];
  } catch {
    return [];
  }
}

/**
 * Get this node's identity info for sharing with joining nodes.
 * Reads from the local file system (validator key output).
 */
export function getLocalNodeInfo(): {
  rpcUrl: string;
  grpcUrl: string;
  chainId: number;
} {
  const host = process.env.PUBLIC_IP || '0.0.0.0';
  return {
    rpcUrl: `http://${host}:8545`,
    grpcUrl: `${host}:10000`,
    chainId: 100,
  };
}
