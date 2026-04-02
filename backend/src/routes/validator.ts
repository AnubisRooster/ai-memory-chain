/**
 * Validator Management API Routes
 *
 * Endpoints for dynamic validator joining and exiting:
 *
 *   GET  /validator/list          — current validator set
 *   GET  /validator/candidates    — pending candidate votes
 *   GET  /validator/status        — IBFT consensus status + liveness
 *   GET  /validator/join-info     — connection details for joining nodes (any validator can serve)
 *   GET  /validator/peers         — known network peers for multi-node discovery
 *   POST /validator/propose       — vote to add a new validator
 *   POST /validator/remove        — vote to remove a validator
 *   POST /validator/announce      — a new node announces itself (any validator can approve)
 *   POST /validator/propagate     — forward a proposal to peer validators
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  getValidators,
  proposeValidator,
  proposeRemoveValidator,
  getCandidates,
  getIBFTStatus,
  isValidator,
  getPeerCount,
  getLocalNodeInfo,
} from '../services/validator';

const router: ReturnType<typeof Router> = Router();

const PEERS_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'peers.json');

function readPeersConfig(): Record<string, any> {
  try {
    if (fs.existsSync(PEERS_PATH)) {
      return JSON.parse(fs.readFileSync(PEERS_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function writePeersConfig(config: Record<string, any>): void {
  try {
    fs.writeFileSync(PEERS_PATH, JSON.stringify(config, null, 2) + '\n');
  } catch (e) {
    console.warn('[VALIDATOR] Could not write peers.json:', e);
  }
}

/**
 * Get known peer API endpoints from peers.json for propagating proposals.
 * Returns URLs like ["http://192.168.1.10:3001", "http://192.168.1.11:3001"]
 */
function getKnownPeerApis(): string[] {
  const config = readPeersConfig();
  const apis: string[] = [];

  if (config.founder?.api) apis.push(config.founder.api);

  const validators = config.validators || {};
  for (const [, info] of Object.entries(validators) as [string, any][]) {
    if (info.ip && info.status !== 'removed') {
      const apiPort = info.apiPort || 3001;
      apis.push(`http://${info.ip}:${apiPort}`);
    }
  }

  if (config.peer_apis && Array.isArray(config.peer_apis)) {
    apis.push(...config.peer_apis);
  }

  // Deduplicate and exclude self
  const localInfo = getLocalNodeInfo();
  const selfUrls = new Set([
    `http://127.0.0.1:3001`, `http://localhost:3001`,
    localInfo.rpcUrl.replace(':8545', ':3001'),
  ]);
  return [...new Set(apis)].filter((url) => !selfUrls.has(url));
}

// ── GET /validator/list ─────────────────────────────────────────────
// Returns the current IBFT validator set.
router.get('/list', async (_req: Request, res: Response) => {
  try {
    const validators = await getValidators();
    const peerCount = await getPeerCount();
    res.json({
      validators,
      count: validators.length,
      peerCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch validators', detail: err.message });
  }
});

// ── GET /validator/candidates ───────────────────────────────────────
// Returns pending IBFT candidate votes.
router.get('/candidates', async (_req: Request, res: Response) => {
  try {
    const candidates = await getCandidates();
    res.json({ candidates });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch candidates', detail: err.message });
  }
});

// ── GET /validator/status ───────────────────────────────────────────
// Returns the IBFT consensus status (round, height, validators).
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getIBFTStatus();
    const validators = await getValidators();
    const peerCount = await getPeerCount();
    res.json({
      ibft: status,
      validators,
      validatorCount: validators.length,
      peerCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch status', detail: err.message });
  }
});

// ── GET /validator/join-info ────────────────────────────────────────
// Returns everything a new node needs to join this network:
//   - genesis.json contents
//   - bootnode multiaddr
//   - RPC/gRPC endpoints
//   - current validator set
router.get('/join-info', async (_req: Request, res: Response) => {
  try {
    const nodeInfo = getLocalNodeInfo();
    const validators = await getValidators();

    // Read genesis.json
    const genesisPath = path.resolve(__dirname, '..', '..', '..', 'data', 'polygon-edge', 'genesis.json');
    let genesis: any = null;
    if (fs.existsSync(genesisPath)) {
      genesis = JSON.parse(fs.readFileSync(genesisPath, 'utf-8'));
    }

    // Read bootnode info from peers.json
    const peersPath = path.resolve(__dirname, '..', '..', '..', 'config', 'peers.json');
    let bootnode = '';
    if (fs.existsSync(peersPath)) {
      const peersConfig = JSON.parse(fs.readFileSync(peersPath, 'utf-8'));
      bootnode = peersConfig.local?.polygon_bootnode || '';
    }

    // Determine the LAN IP to advertise (replace 127.0.0.1 in bootnode with actual IP)
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let lanIp = '';
    for (const nets of Object.values(interfaces) as any[]) {
      if (!nets) continue;
      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          lanIp = net.address;
          break;
        }
      }
      if (lanIp) break;
    }

    // Rewrite bootnode to use LAN IP instead of 127.0.0.1
    if (bootnode && lanIp) {
      bootnode = bootnode.replace(/\/ip4\/127\.0\.0\.1/, `/ip4/${lanIp}`);
    }

    res.json({
      genesis,
      bootnode,
      lanIp,
      rpcUrl: lanIp ? `http://${lanIp}:8545` : nodeInfo.rpcUrl,
      grpcUrl: lanIp ? `${lanIp}:10000` : nodeInfo.grpcUrl,
      chainId: nodeInfo.chainId,
      validators,
      validatorCount: validators.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get join info', detail: err.message });
  }
});

// ── POST /validator/propose ─────────────────────────────────────────
// Vote to add a new validator to the set.
// Body: { "address": "0x..." }
router.post('/propose', async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address format. Expected 0x-prefixed hex.' });
    }

    // Check if already a validator
    const alreadyValidator = await isValidator(address);
    if (alreadyValidator) {
      return res.status(409).json({ error: 'Address is already a validator', address });
    }

    const success = await proposeValidator(address);
    if (success) {
      console.log(`[VALIDATOR] Proposed addition of ${address}`);
      res.json({ success: true, action: 'propose_add', address });
    } else {
      res.status(500).json({ error: 'Failed to propose validator' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Propose failed', detail: err.message });
  }
});

// ── POST /validator/remove ──────────────────────────────────────────
// Vote to remove a validator from the set.
// Body: { "address": "0x..." }
router.post('/remove', async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address format. Expected 0x-prefixed hex.' });
    }

    const currentlyValidator = await isValidator(address);
    if (!currentlyValidator) {
      return res.status(404).json({ error: 'Address is not in the validator set', address });
    }

    // Safety: prevent removing the last validator
    const validators = await getValidators();
    if (validators.length <= 1) {
      return res.status(400).json({
        error: 'Cannot remove the last validator — chain would halt',
      });
    }

    const success = await proposeRemoveValidator(address);
    if (success) {
      console.log(`[VALIDATOR] Proposed removal of ${address}`);
      res.json({ success: true, action: 'propose_remove', address });
    } else {
      res.status(500).json({ error: 'Failed to propose removal' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Remove failed', detail: err.message });
  }
});

// ── POST /validator/announce ────────────────────────────────────────
// A new node announces itself to ANY validator node for approval.
// Body: { "address": "0x...", "nodeId": "16Uiu...", "ip": "192.168.x.x", "port": 1478, "apiPort": 3001 }
//
// This node votes to add it AND propagates the proposal to all known peers
// so they can cast their own IBFT votes (required for multi-validator majority).
router.post('/announce', async (req: Request, res: Response) => {
  try {
    const { address, nodeId, ip, port, apiPort } = req.body;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid validator address' });
    }
    if (!nodeId) {
      return res.status(400).json({ error: 'Missing nodeId (libp2p peer ID)' });
    }

    const alreadyValidator = await isValidator(address);
    if (alreadyValidator) {
      return res.json({
        success: true,
        action: 'already_validator',
        address,
        message: 'Address is already in the validator set',
      });
    }

    const success = await proposeValidator(address);

    if (ip && nodeId) {
      const peersConfig = readPeersConfig();
      const multiaddr = `/ip4/${ip}/tcp/${port || 1478}/p2p/${nodeId}`;

      if (!peersConfig.polygon_bootnodes) peersConfig.polygon_bootnodes = [];
      if (!peersConfig.polygon_bootnodes.includes(multiaddr)) {
        peersConfig.polygon_bootnodes.push(multiaddr);
        console.log(`[VALIDATOR] Added peer ${multiaddr} to peers.json`);
      }

      if (!peersConfig.validators) peersConfig.validators = {};
      peersConfig.validators[address.toLowerCase()] = {
        nodeId,
        ip,
        port: port || 1478,
        apiPort: apiPort || 3001,
        joinedAt: new Date().toISOString(),
        status: 'proposed',
      };
      writePeersConfig(peersConfig);
    }

    // Propagate to all known peer validators so they cast their own IBFT votes.
    // Fire-and-forget — we don't block the response on peer propagation.
    const propagateBody = { address, nodeId, ip, port: port || 1478, apiPort: apiPort || 3001 };
    const peerApis = getKnownPeerApis();
    if (peerApis.length > 0) {
      console.log(`[VALIDATOR] Propagating proposal for ${address} to ${peerApis.length} peers`);
      for (const peerApi of peerApis) {
        fetch(`${peerApi}/validator/propagate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(propagateBody),
          signal: AbortSignal.timeout(5_000),
        }).catch(() => {});
      }
    }

    if (success) {
      console.log(`[VALIDATOR] Auto-approved: proposed addition of ${address} (node: ${nodeId})`);
      res.json({
        success: true,
        action: 'proposed',
        address,
        peersPropagated: peerApis.length,
        message: 'Validator proposed for addition. Will be active after epoch boundary.',
      });
    } else {
      res.status(500).json({ error: 'Failed to auto-propose validator' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Announce failed', detail: err.message });
  }
});

// ── POST /validator/propagate ──────────────────────────────────────
// Receives a proposal from a peer validator and casts a local IBFT vote.
// This enables multi-validator majority without needing the founder.
// Body: { "address": "0x...", "nodeId": "...", "ip": "...", "port": 1478, "apiPort": 3001 }
router.post('/propagate', async (req: Request, res: Response) => {
  try {
    const { address, nodeId, ip, port, apiPort } = req.body;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const alreadyValidator = await isValidator(address);
    if (alreadyValidator) {
      return res.json({ success: true, action: 'already_validator', address });
    }

    const success = await proposeValidator(address);

    // Track the peer locally too
    if (ip && nodeId) {
      const peersConfig = readPeersConfig();
      const multiaddr = `/ip4/${ip}/tcp/${port || 1478}/p2p/${nodeId}`;
      if (!peersConfig.polygon_bootnodes) peersConfig.polygon_bootnodes = [];
      if (!peersConfig.polygon_bootnodes.includes(multiaddr)) {
        peersConfig.polygon_bootnodes.push(multiaddr);
      }
      if (!peersConfig.validators) peersConfig.validators = {};
      if (!peersConfig.validators[address.toLowerCase()]) {
        peersConfig.validators[address.toLowerCase()] = {
          nodeId, ip, port: port || 1478, apiPort: apiPort || 3001,
          joinedAt: new Date().toISOString(), status: 'proposed',
        };
      }
      writePeersConfig(peersConfig);
    }

    console.log(`[VALIDATOR] Propagated vote: ${success ? 'proposed' : 'failed'} for ${address}`);
    res.json({ success, action: success ? 'voted' : 'vote_failed', address });
  } catch (err: any) {
    res.status(500).json({ error: 'Propagate failed', detail: err.message });
  }
});

// ── GET /validator/peers ────────────────────────────────────────────
// Returns known peer API endpoints for multi-node discovery.
// A joining node can ask any validator for the full list of peers
// and then announce to all of them.
router.get('/peers', async (_req: Request, res: Response) => {
  try {
    const validators = await getValidators();
    const peerApis = getKnownPeerApis();
    const peersConfig = readPeersConfig();
    const registeredValidators = peersConfig.validators || {};

    res.json({
      validators,
      peerApis,
      registeredValidators: Object.entries(registeredValidators).map(([addr, info]: [string, any]) => ({
        address: addr,
        ip: info.ip,
        apiPort: info.apiPort || 3001,
        status: info.status,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get peers', detail: err.message });
  }
});

export default router;
