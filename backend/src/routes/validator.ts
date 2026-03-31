/**
 * Validator Management API Routes
 *
 * Endpoints for dynamic validator joining and exiting:
 *
 *   GET  /validator/list          — current validator set
 *   GET  /validator/candidates    — pending candidate votes
 *   GET  /validator/status        — IBFT consensus status
 *   GET  /validator/join-info     — connection details for joining nodes
 *   POST /validator/propose       — vote to add a new validator
 *   POST /validator/remove        — vote to remove a validator
 *   POST /validator/announce      — a new node announces itself for auto-approval
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

const router = Router();

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
// A new node announces itself to the founder node for auto-approval.
// Body: { "address": "0x...", "nodeId": "16Uiu...", "ip": "192.168.x.x", "port": 1478 }
//
// The founder node will automatically propose the new validator via IBFT vote.
router.post('/announce', async (req: Request, res: Response) => {
  try {
    const { address, nodeId, ip, port } = req.body;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid validator address' });
    }
    if (!nodeId) {
      return res.status(400).json({ error: 'Missing nodeId (libp2p peer ID)' });
    }

    // Check if already a validator
    const alreadyValidator = await isValidator(address);
    if (alreadyValidator) {
      return res.json({
        success: true,
        action: 'already_validator',
        address,
        message: 'Address is already in the validator set',
      });
    }

    // Auto-approve: vote to add the new validator
    const success = await proposeValidator(address);

    // Track the new peer in peers.json for reconnection
    if (ip && nodeId) {
      const peersPath = path.resolve(__dirname, '..', '..', '..', 'config', 'peers.json');
      try {
        const peersConfig = JSON.parse(fs.readFileSync(peersPath, 'utf-8'));
        const multiaddr = `/ip4/${ip}/tcp/${port || 1478}/p2p/${nodeId}`;

        if (!peersConfig.polygon_bootnodes) {
          peersConfig.polygon_bootnodes = [];
        }
        // Avoid duplicates
        if (!peersConfig.polygon_bootnodes.includes(multiaddr)) {
          peersConfig.polygon_bootnodes.push(multiaddr);
          fs.writeFileSync(peersPath, JSON.stringify(peersConfig, null, 2) + '\n');
          console.log(`[VALIDATOR] Added peer ${multiaddr} to peers.json`);
        }

        // Also track in the validators registry
        if (!peersConfig.validators) {
          peersConfig.validators = {};
        }
        peersConfig.validators[address.toLowerCase()] = {
          nodeId,
          ip,
          port: port || 1478,
          joinedAt: new Date().toISOString(),
          status: 'proposed',
        };
        fs.writeFileSync(peersPath, JSON.stringify(peersConfig, null, 2) + '\n');
      } catch (e) {
        console.warn('[VALIDATOR] Could not update peers.json:', e);
      }
    }

    if (success) {
      console.log(`[VALIDATOR] Auto-approved: proposed addition of ${address} (node: ${nodeId})`);
      res.json({
        success: true,
        action: 'proposed',
        address,
        message: 'Validator proposed for addition. Will be active after epoch boundary.',
      });
    } else {
      res.status(500).json({ error: 'Failed to auto-propose validator' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Announce failed', detail: err.message });
  }
});

export default router;
