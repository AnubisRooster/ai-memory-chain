# AI Memory Chain

Full-stack system for storing AI memories on a **Polygon Edge** private blockchain with **IPFS**-backed content storage. Memories are written on-chain with SHA-256 integrity hashes, while full payloads (embeddings, arbitrary JSON, files) live on IPFS — giving you tamper-evident provenance *and* cheap, retrievable storage.

Built for AI agents and LLMs that need persistent, verifiable, content-addressed memory.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌───────────────────┐
│   Frontend   │────▶│   Backend    │────▶│   Polygon Edge    │
│  (Next.js)   │     │  (Express)   │     │  IBFT consensus   │
│  :3000       │     │  :3001       │     │  JSON-RPC :8545   │
└──────────────┘     └──────┬───────┘     └───────────────────┘
                            │
      ┌─────────────┐      │
      │  Agent SDK  │──────┘
      │  (TS / Py)  │      │
      └─────────────┘      ▼
                     ┌──────────────┐
                     │  IPFS (Kubo) │
                     │  API  :5001  │
                     │  GW   :8080  │
                     └──────────────┘
```

| Component | Role |
|-----------|------|
| **Polygon Edge** | Private PoA blockchain (IBFT/ECDSA). Stores memory metadata: summary, CID, SHA-256 hash, int16 embedding, author, timestamp. |
| **IPFS Kubo** | Content-addressed storage. Holds the full JSON payload (embeddings at float precision, arbitrary data, file attachments). |
| **Backend** | Express/TypeScript API. Orchestrates IPFS upload, SHA-256 hashing, and on-chain write in a single `POST /memory` call. Also proxies IPFS content. |
| **Agent SDK** | Zero-dependency TypeScript client. Call `agent.recordMemory(...)` from any Node.js process. |
| **Frontend** | Next.js + Tailwind dashboard. Memory timeline, detail view, embedding chart, create memories, network sharing, live status. |

## Prerequisites

- **Docker** + **Docker Compose** (v2)
- **Node.js** >= 18
- **pnpm** >= 8 (`npm install -g pnpm` if missing)

## Quick Start

```bash
# 1. Start the blockchain + IPFS
docker-compose up -d

# 2. Install all workspace dependencies
pnpm install

# 3. Compile the Solidity contract (generates TypeChain bindings)
pnpm compile

# 4. Deploy the contract using the premined validator key
export DEPLOYER_PRIVATE_KEY="0x$(cat data/polygon-edge/node1/consensus/validator.key)"
npx ts-node scripts/deploy-raw.ts

# 5. Start backend + frontend
pnpm dev

# 6. Run all tests
pnpm test
```

The frontend is at **http://localhost:3000** and the backend API at **http://localhost:3001**.

> **First run note:** The Polygon Edge container auto-generates a genesis file, validator keys, and starts sealing blocks. Give it ~10 seconds before deploying the contract.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/memory` | Store a new memory (with security scanning) |
| `GET` | `/memory/list` | List all stored memory IDs + summaries |
| `GET` | `/memory/:id` | Full memory: on-chain metadata + IPFS content |
| `GET` | `/memory/health` | Network status (`{ polygon: bool, ipfs: bool }`) |
| `GET` | `/search` | Search/filter memories (text, type, tags, vector, date range) |
| `GET` | `/security/audit` | Security scan audit log (paginated, filterable) |
| `GET` | `/security/audit/stats` | Aggregate security statistics |
| `GET` | `/health` | Backend service health |
| `GET` | `/connect` | LAN addresses for network sharing |
| `GET` | `/ipfs/:cid` | Proxied IPFS content retrieval |

### POST /memory

Accepts JSON or multipart form data (for file uploads). All inputs are scanned for security threats (prompt injection, XSS, SQL injection, command injection, path traversal) before storage. Malicious inputs are rejected with HTTP 422.

```json
{
  "summary": "Learned user prefers dark mode",
  "embedding": [0.1, -0.3, 0.5, 0.22, -0.81],
  "data": { "preference": "dark_mode", "confidence": 0.95 },
  "type": "note",
  "tags": ["preferences", "ui"]
}
```

**Response** (201):

```json
{
  "id": 0,
  "ipfsCID": "QmRUwDanaX1GkrzLfnFK7AGGBpi2EmpuEs397vZFX9YX3z",
  "sha256Hash": "0x7014ab343dc062f9b784ee6cdf7f0c00effcd619f6bcca230885ec519b0d495a",
  "timestamp": 1774198266,
  "txHash": "0xb561d333..."
}
```

### GET /memory/:id

Returns on-chain fields plus the full `ipfsContent` object (float-precision embeddings, original `data`, file attachments, type, tags).

### GET /search

Search and filter memories across the entire chain. All parameters are optional and combinable.

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Full-text search across summaries, content, tags, and custom data |
| `type` | string | Filter by memory type (`note`, `conversation`, `code`, `file`, `image`) |
| `tags` | string | Comma-separated tag filter (all must match) |
| `author` | string | Filter by author address (`0x...`) |
| `from` | number | Minimum timestamp (epoch seconds) |
| `to` | number | Maximum timestamp (epoch seconds) |
| `embedding` | JSON array | Embedding vector for cosine similarity ranking |
| `topK` | number | Max results (default 50) |

```bash
# Text search
curl "http://localhost:3001/search?q=dark+mode&type=note"

# Vector similarity search
curl "http://localhost:3001/search?embedding=[0.1,-0.3,0.5]&topK=10"

# Combined filters
curl "http://localhost:3001/search?tags=preferences,ui&from=1700000000"
```

**Response:**

```json
{
  "results": [
    {
      "id": 0,
      "summary": "User prefers dark mode",
      "timestamp": 1774198266,
      "score": 0.95,
      "ipfsContent": { ... }
    }
  ],
  "total": 1
}
```

## Input Security

All memory inputs are scanned before storage by a security service that detects:

| Threat Type | Examples |
|-------------|----------|
| **Prompt injection** | "Ignore all previous instructions", fake system prompts, chat template delimiters |
| **Jailbreak attempts** | DAN mode, "pretend you have no restrictions", safety bypass requests |
| **XSS** | Script tags, event handlers, javascript: protocol, iframes |
| **SQL injection** | `'; DROP TABLE`, UNION attacks |
| **Command injection** | Shell commands via `${}`, backticks, semicolons |
| **Path traversal** | `../../etc/passwd` in filenames |
| **Encoding attacks** | HTML entities, URL-encoded tags, Unicode escapes |

Inputs with critical or high-severity threats are rejected with HTTP 422 and a threat report. Low/medium threats (like excessive length) generate warnings but don't block storage.

### Security Audit Log

Every security scan (pass or fail) is persistently logged to a local SQLite database. This provides a full audit trail accessible from the dashboard and the API.

**Dashboard:** Click the **Security** button in the header to view scan history, threat breakdowns, and block rates.

**API:**

```bash
# Paginated audit log with filters
curl "http://localhost:3001/security/audit?safe=false&limit=20"

# Aggregate stats (totals, block rate, threat breakdown, recent trends)
curl "http://localhost:3001/security/audit/stats"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `safe` | boolean | Filter by scan result (`true` = allowed, `false` = blocked) |
| `threatType` | string | Filter by threat type (e.g., `xss`, `prompt_injection`) |
| `from` | string | Start date (ISO datetime) |
| `to` | string | End date (ISO datetime) |
| `limit` | number | Max entries (default 50, max 200) |
| `offset` | number | Pagination offset |

## OpenClaw Integration

AI Memory Chain integrates with [OpenClaw](https://docs.openclaw.ai) at three levels:

### 1. OpenClaw Skill

A `SKILL.md` in `~/.openclaw/workspace/skills/ai-memory-chain/` teaches the OpenClaw agent when and how to use the blockchain memory system. Trigger phrases include "store this on the chain", "recall memory", "search memories", "chain audit", and similar.

### 2. CLI Tool Scripts

Five scripts in the skill's `scripts/` directory provide CLI access for the OpenClaw agent:

| Script | Purpose |
|--------|---------|
| `memory-store.mjs` | Store a memory with summary, type, content, tags, embedding |
| `memory-recall.mjs` | Retrieve a specific memory by ID |
| `memory-search.mjs` | Search by text, type, tags, or vector similarity |
| `memory-list.mjs` | List all memories |
| `security-audit.mjs` | View security scan history and stats |

Example (from OpenClaw or terminal):

```bash
node ~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-store.mjs \
  --summary "Configured Tailscale exit node" --type note --tags "config,network"
```

### 3. Bidirectional Memory Bridge

A sync script keeps OpenClaw's native memory files and the blockchain in sync:

```bash
# Back up OpenClaw memory files to blockchain
node ~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-bridge.mjs sync-to-chain

# Import blockchain memories as markdown (into memory/chain-imports/)
node ~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-bridge.mjs sync-from-chain

# Check sync status
node ~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-bridge.mjs status
```

The bridge runs automatically via an OpenClaw cron job every 30 minutes. It tracks file hashes in `bridge-state.json` to avoid duplicate writes. Files tagged `openclaw-sync` are skipped during import to prevent circular syncs.

---

## How AI Agents / LLMs Access Memories

There are three ways an AI agent or LLM can read and write memories on the chain, depending on the integration depth needed.

### Option 1: Agent SDK (Recommended)

The included TypeScript SDK provides the simplest integration. Any Node.js-based agent (LangChain, AutoGPT, custom agents) can use it directly.

**Install and use:**

```typescript
import { MemoryAgent } from './agent-sdk/src';

const agent = new MemoryAgent({ backendUrl: 'http://localhost:3001' });

// --- WRITE a memory ---
const result = await agent.recordMemory({
  summary: 'User discussed project architecture',
  embedding: [0.12, -0.45, 0.78, 0.33],    // from your embedding model
  data: {
    topic: 'architecture',
    entities: ['microservices', 'kubernetes'],
    raw_conversation: '...',
  },
});
// result.id        → on-chain memory ID (integer)
// result.cid       → IPFS content identifier
// result.timestamp → block timestamp (epoch seconds)
// result.sha256Hash→ integrity hash of the IPFS payload
// result.txHash    → Polygon Edge transaction hash

// --- READ a single memory ---
const memory = await agent.getMemory(0);
// memory.summary, memory.embedding, memory.author, memory.ipfsContent.data, ...

// --- LIST all memories ---
const all = await agent.listMemories();
// [{ id: 0, summary: '...', timestamp: 1774198266 }, ...]

// --- CHECK network health ---
const health = await agent.health();
// { polygon: true, ipfs: true }
```

**For Python agents**, call the REST API directly (see Option 2) or use the `requests` library:

```python
import requests, json

BACKEND = "http://localhost:3001"

# Write
resp = requests.post(f"{BACKEND}/memory", json={
    "summary": "User prefers concise answers",
    "embedding": [0.1, -0.3, 0.5],
    "data": {"style": "concise", "confidence": 0.92}
})
result = resp.json()  # {"id": 0, "ipfsCID": "Qm...", ...}

# Read
memory = requests.get(f"{BACKEND}/memory/{result['id']}").json()

# List
memories = requests.get(f"{BACKEND}/memory/list").json()
```

### Option 2: REST API (Language-Agnostic)

Any LLM or agent framework that can make HTTP requests can use the backend API directly. This works from any language, shell scripts, or LLM tool-use / function-calling integrations.

**Store a memory:**

```bash
curl -X POST http://localhost:3001/memory \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Key insight about caching strategies",
    "embedding": [0.5, -0.2, 0.8, -0.1, 0.3],
    "data": {"insight": "Redis is preferred for session caching", "source": "conversation_42"}
  }'
```

**Retrieve a memory:**

```bash
curl http://localhost:3001/memory/0
```

**List all memories:**

```bash
curl http://localhost:3001/memory/list
```

**LLM function-calling integration** — Expose these as tools in your LLM's tool schema:

```json
{
  "name": "store_memory",
  "description": "Store a persistent memory on the blockchain with IPFS content addressing",
  "parameters": {
    "type": "object",
    "properties": {
      "summary": { "type": "string", "description": "1-2 sentence description of the memory" },
      "embedding": { "type": "array", "items": { "type": "number" }, "description": "Embedding vector from your model" },
      "data": { "type": "object", "description": "Arbitrary JSON payload with full details" },
      "type": { "type": "string", "enum": ["note", "conversation", "code", "file", "image"] },
      "tags": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["summary", "embedding", "data"]
  }
}
```

```json
{
  "name": "recall_memory",
  "description": "Retrieve a specific memory by its on-chain ID",
  "parameters": {
    "type": "object",
    "properties": {
      "id": { "type": "integer", "description": "The on-chain memory ID" }
    },
    "required": ["id"]
  }
}
```

```json
{
  "name": "list_memories",
  "description": "List all stored memory summaries with IDs and timestamps",
  "parameters": { "type": "object", "properties": {} }
}
```

### Option 3: Direct On-Chain Access (Advanced)

For agents that need to bypass the backend and talk directly to the blockchain (e.g., for on-chain verification, cross-chain bridges, or fully decentralized operation):

**Read from the smart contract via JSON-RPC:**

```typescript
import { ethers } from 'ethers';

const ABI = [
  'function getMemory(uint256 _id) view returns (string summary, uint256 timestamp, string ipfsCID, bytes32 sha256Hash, int16[] embedding, address author)',
  'function getMemoryCount() view returns (uint256)',
  'function getMemorySummary(uint256 _id) view returns (string, uint256)',
];

const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const contract = new ethers.Contract('<CONTRACT_ADDRESS>', ABI, provider);

// Read — no signing required, these are view functions
const count = await contract.getMemoryCount();
const [summary, timestamp, ipfsCID, sha256Hash, embedding, author] = await contract.getMemory(0);

// Verify integrity — fetch IPFS content and check hash
const response = await fetch(`http://localhost:8080/ipfs/${ipfsCID}`);
const content = await response.text();
const computedHash = '0x' + (await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(content))).toString();
// computedHash should match sha256Hash from the contract
```

**Write to the smart contract directly:**

```typescript
const wallet = new ethers.Wallet('<PRIVATE_KEY>', provider);
const contractWithSigner = contract.connect(wallet);

const tx = await contractWithSigner.storeMemory(
  'Direct on-chain memory',
  'QmYourCID',
  '0x<sha256hash>',
  [100, -200, 300],        // int16 quantized embedding
  { gasPrice: 1_000_000_000, type: 0 }  // legacy tx required for Polygon Edge IBFT
);
await tx.wait();
```

**Contract address** is stored in `deployment.json` after running the deploy script.

### Retrieval Patterns for AI Agents

Here are common patterns for how an AI agent would use the memory system:

**1. Semantic search (via embeddings):**

```typescript
const memories = await agent.listMemories();
// For each memory, fetch full content and compare embeddings
// using cosine similarity with the query embedding
const detailed = await Promise.all(memories.map(m => agent.getMemory(m.id)));
const queryEmbedding = await yourEmbeddingModel.encode("What does the user prefer?");
const ranked = detailed
  .map(m => ({ ...m, score: cosineSimilarity(queryEmbedding, m.ipfsContent.embedding) }))
  .sort((a, b) => b.score - a.score);
```

**2. Timeline-based recall:**

```typescript
const memories = await agent.listMemories();
const recent = memories.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
```

**3. Integrity verification:**

```typescript
import { createHash } from 'crypto';

const memory = await agent.getMemory(0);
const ipfsContent = JSON.stringify(memory.ipfsContent);
const computed = '0x' + createHash('sha256').update(ipfsContent).digest('hex');
const verified = computed === memory.sha256Hash;
// If verified is false, the IPFS content has been tampered with
```

**4. Context window injection:**

```typescript
// Fetch recent memories and inject as system context for an LLM
const recent = await agent.listMemories();
const context = await Promise.all(
  recent.slice(-5).map(m => agent.getMemory(m.id))
);
const systemPrompt = `You have these memories from past conversations:\n` +
  context.map(m =>
    `[${new Date(m.timestamp * 1000).toISOString()}] ${m.summary}\n` +
    `Data: ${JSON.stringify(m.ipfsContent?.data)}`
  ).join('\n\n');
```

---

## Smart Contract

`contracts/AIMemoryStorage.sol` — Solidity 0.8.24, optimized (200 runs).

**On-chain storage per memory:**

| Field | Type | Notes |
|-------|------|-------|
| `summary` | `string` | Short description |
| `timestamp` | `uint256` | `block.timestamp` at write |
| `ipfsCID` | `string` | IPFS content identifier |
| `sha256Hash` | `bytes32` | SHA-256 of the IPFS payload |
| `embedding` | `int16[]` | Quantized embedding vector |
| `author` | `address` | `msg.sender` |

Emits `MemoryStored(id, author, ipfsCID, sha256Hash, timestamp)` on each write.

> **Design note:** Embeddings are stored on-chain as `int16[]` (quantized from floats) to keep gas costs manageable. The full float-precision embedding is preserved in the IPFS payload for downstream use. To convert: multiply your float embeddings by 32767 and round to the nearest integer.

## Testing

The project has 99 tests across three test suites:

```bash
# Run all tests
pnpm test

# Run individually
pnpm --filter backend test       # 78 tests — security, audit log, routes, search, hash, E2E
pnpm --filter agent-sdk test     # 9 tests  — MemoryAgent against mock server
npx hardhat test                 # 12 tests — smart contract on Hardhat network
```

| Suite | Framework | Tests | What's Covered |
|-------|-----------|-------|----------------|
| Backend unit | vitest | 6 | SHA-256 hashing (known vectors, Buffer, empty, determinism) |
| Backend security | vitest | 22 | Prompt injection (8 patterns), XSS (4), SQL injection, command injection, path traversal, tags, length limits, report formatting |
| Backend audit log | vitest | 12 | SQLite CRUD, clean/blocked scan logging, truncation, query filters (safe, threatType), pagination, stats computation, empty stats |
| Backend routes | vitest + supertest | 25 | POST/GET routes, search endpoint, security rejection, multipart uploads, input validation, audit log endpoints, audit stats |
| Backend E2E | vitest + supertest | 13 | Full lifecycle (store→retrieve), multi-memory list, security gate, search across stored data (text, type, tags, vector, combined) |
| Agent SDK | vitest | 9 | MemoryAgent construction, recordMemory, listMemories, getMemory, health, input validation |
| Smart Contract | Hardhat + chai | 12 | storeMemory, getMemory, getMemorySummary, getMemoryCount, events, author tracking, int16 bounds, reverts |

## Project Structure

```
ai-memory-chain/
├── contracts/                 # Solidity smart contract
│   └── AIMemoryStorage.sol
├── test/                      # Smart contract tests (Hardhat + chai)
│   └── AIMemoryStorage.test.ts
├── scripts/
│   ├── deploy-raw.ts          # Deploy via ethers.js (legacy tx for Polygon Edge)
│   ├── deploy.ts              # Deploy via Hardhat (standard EVM networks)
│   ├── genesis.ts             # Standalone genesis generator
│   ├── edge-entrypoint.sh     # Docker entrypoint for Polygon Edge
│   ├── install-service.sh     # One-time macOS LaunchAgent installer
│   ├── startup.sh             # Boot startup: Docker → containers → backend → frontend
│   └── shutdown.sh            # Clean shutdown of Node.js services
├── backend/                   # Express API server
│   └── src/
│       ├── app.ts             # Express app factory (testable)
│       ├── index.ts           # Server bootstrap (calls app.listen)
│       ├── routes/
│       │   ├── memory.ts      # Memory CRUD routes (with security scanning + audit logging)
│       │   ├── search.ts      # Search/filter endpoint
│       │   ├── audit.ts       # Security audit log endpoints
│       │   └── ipfs-proxy.ts  # Proxied IPFS gateway
│       ├── services/
│       │   ├── blockchain.ts  # ethers.js contract interactions
│       │   ├── ipfs.ts        # Kubo HTTP API client
│       │   ├── hash.ts        # SHA-256 helper
│       │   ├── security.ts    # Input security scanner (prompt injection, XSS, etc.)
│       │   └── audit-log.ts   # SQLite-backed security audit log
│       ├── types/index.ts     # Shared TypeScript interfaces
│       └── __tests__/         # Backend tests (vitest + supertest)
│           ├── hash.test.ts
│           ├── security.test.ts
│           ├── audit-log.test.ts
│           ├── routes.test.ts
│           └── e2e.test.ts
├── agent-sdk/                 # Lightweight Node.js client SDK
│   └── src/
│       ├── index.ts           # MemoryAgent class
│       └── __tests__/         # SDK tests (vitest)
│           └── agent.test.ts
├── frontend/                  # Next.js 14 + Tailwind dashboard
│   └── src/
│       ├── app/               # Pages + layout
│       ├── components/
│       │   ├── NetworkStatus.tsx     # Live Polygon/IPFS status
│       │   ├── MemoryTimeline.tsx    # Memory list with auto-refresh
│       │   ├── MemoryDetail.tsx      # Full memory view + file attachments
│       │   ├── EmbeddingChart.tsx       # Bar chart of embedding dimensions
│       │   ├── CreateMemory.tsx        # Modal for creating new memories
│       │   ├── BlockchainExplorer.tsx  # Search/filter explorer modal
│       │   ├── SecurityAuditLog.tsx   # Security audit log panel
│       │   └── ConnectInfo.tsx         # Network sharing / LAN access modal
│       └── lib/api.ts         # Typed fetch wrapper
├── docs/                      # Project documentation
│   └── creation-process.md    # Build log, design decisions, multi-validator guide
├── docker-compose.yml         # Polygon Edge + IPFS Kubo
├── hardhat.config.ts          # Solidity compiler + TypeChain config
├── deployment.json            # Contract address (written by deploy script)
└── package.json               # Monorepo root (pnpm workspaces)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_URL` | `http://127.0.0.1:8545` | Polygon Edge JSON-RPC endpoint |
| `IPFS_API_URL` | `http://127.0.0.1:5001` | IPFS Kubo API |
| `IPFS_GATEWAY_URL` | `http://127.0.0.1:8080` | IPFS gateway (for reads) |
| `CONTRACT_ADDRESS` | *(from deployment.json)* | Deployed contract address |
| `DEPLOYER_PRIVATE_KEY` | — | Private key for signing on-chain transactions |
| `PORT` | `3001` | Backend server port |
| `BACKEND_URL` | `http://localhost:3001` | Backend URL for frontend API proxy |
| `AUDIT_DB_PATH` | `backend/data/audit.sqlite` | Path for the security audit SQLite database |

## Multi-Node Validator Network

The default setup runs a single Polygon Edge validator. To add validators on other machines and form a proper IBFT consensus cluster, see the detailed walkthrough in [docs/creation-process.md](docs/creation-process.md#adding-validators-on-other-machines).

Summary of what's involved:

1. Generate secrets on each new machine
2. Exchange addresses, Node IDs, and bootnode multiaddrs
3. Regenerate the genesis with all validators listed
4. Distribute the shared genesis file
5. Start each node with the correct `--bootnode` and `--libp2p` flags

IBFT requires > 2/3 of validators online to seal blocks (e.g., 3 of 4 nodes must be reachable).

## Network Sharing

Other computers on the same LAN can access the dashboard and API. Click the **Share** button in the frontend header to see your LAN URLs, or query the backend directly:

```bash
curl http://localhost:3001/connect
# {"frontend":["http://192.168.1.10:3000"],"backend":["http://192.168.1.10:3001"],"hostname":"...","addresses":["192.168.1.10"]}
```

## Auto-Start on Boot (macOS)

The service can start automatically every time you log in. Both Docker containers already have `restart: unless-stopped`, so they come back when Docker starts. The Node.js processes (backend + frontend) are managed by a macOS LaunchAgent.

**One-time setup** — run this from **Terminal.app** (not an IDE terminal):

```bash
bash ~/Documents/ai-memory-chain/scripts/install-service.sh
```

Also enable **Docker Desktop → Settings → General → "Start Docker Desktop when you sign in"**.

After that, every login:
1. Docker Desktop starts automatically
2. The LaunchAgent waits for Docker, starts the containers, then launches backend + frontend
3. Dashboard is available at `http://localhost:3000` within ~30 seconds

**Manual controls:**

| Action | Command |
|--------|---------|
| Start now | `launchctl start com.mikefink.ai-memory-chain` |
| Stop | `bash ~/Documents/ai-memory-chain/scripts/shutdown.sh` |
| View logs | `tail -f ~/Documents/ai-memory-chain/logs/startup.log` |
| Uninstall | `launchctl unload ~/Library/LaunchAgents/com.mikefink.ai-memory-chain.plist` |

The production builds (`backend/dist/` and `frontend/.next/`) start faster and use less memory than dev mode. Rebuild after code changes with `cd backend && npx tsc` and `cd frontend && npx next build`.

## Where Does Everything Live?

All persistent data is in the project directory — nothing is hidden elsewhere on the system.

| What | Location | Notes |
|------|----------|-------|
| **Blockchain data** | `data/polygon-edge/node1/` | LevelDB databases for blocks and state trie |
| **Validator private key** | `data/polygon-edge/node1/consensus/validator.key` | Signs transactions and consensus messages |
| **Genesis file** | `data/polygon-edge/genesis.json` | Chain ID 100, IBFT config, initial balances |
| **IPFS data** | `data/ipfs/` | Content-addressed blocks, node config |
| **Contract address** | `deployment.json` | Written by deploy script, read by backend |
| **Startup logs** | `logs/` | Created by the LaunchAgent startup script |

Delete `data/` to wipe the chain and IPFS. Delete `deployment.json` and redeploy to get a fresh contract. Everything else is code.

## Additional Documentation

- **[docs/creation-process.md](docs/creation-process.md)** — Full build log, design decisions, issues encountered, testing strategy, agent integration patterns, auto-start setup, and multi-validator setup guide.
