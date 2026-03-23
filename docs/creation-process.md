# Creation Process

This document covers how AI Memory Chain was built — the design decisions, the issues encountered during scaffolding, and how they were resolved. It also includes the testing strategy, a comprehensive guide for AI/LLM agent integration, auto-start service configuration, and a full walkthrough for expanding to a multi-validator network.

---

## Table of Contents

- [Design Decisions](#design-decisions)
- [Build Sequence](#build-sequence)
- [Issues and Fixes](#issues-and-fixes)
- [Testing Strategy](#testing-strategy)
- [AI Agent & LLM Integration Guide](#ai-agent--llm-integration-guide)
- [OpenClaw Integration](#openclaw-integration)
- [Adding Validators on Other Machines](#adding-validators-on-other-machines)
- [File Manifest](#file-manifest)

---

## Design Decisions

### Why Polygon Edge + IPFS?

| Concern | Solution |
|---------|----------|
| **Tamper-evident provenance** | On-chain storage gives every memory an immutable record with author, timestamp, and integrity hash. |
| **Cheap storage for large payloads** | IPFS holds the full JSON (embeddings, arbitrary data). Only the CID and SHA-256 hash go on-chain. |
| **Private network** | Polygon Edge gives a permissioned chain — no mainnet gas costs, full control over validator set. |
| **Content verification** | The SHA-256 hash stored on-chain can verify that IPFS content hasn't been tampered with. |

### On-Chain vs. Off-Chain Split

Embeddings present a storage challenge. A 1536-dimension float32 vector is ~6 KB — too expensive for on-chain storage at scale. The design splits storage:

- **On-chain (`int16[]`)**: Quantized embedding for lightweight on-chain queries or coarse similarity. Quantization rounds floats to the nearest integer in [-32768, 32767].
- **IPFS (float64 JSON)**: Full-precision embedding for production vector search, ML pipelines, etc.

### IBFT Consensus with ECDSA Validator Type

Polygon Edge supports two IBFT validator types: `bls` and `ecdsa`. We use `ecdsa` because:

- Simpler key management (standard secp256k1 keys)
- No BLS aggregation overhead for small validator sets
- The same key signs both consensus messages and Ethereum transactions

For production deployments with >10 validators, BLS is more efficient (aggregated signatures reduce block header size).

### Direct Kubo HTTP API Instead of `kubo-rpc-client`

The official `kubo-rpc-client` npm package (v4+) is ESM-only. Since the backend uses CommonJS (`ts-node` with `module: "commonjs"`), importing it would require either restructuring the entire module system or using dynamic `import()` workarounds. Instead, the IPFS service uses Node.js `http` module to call Kubo's REST API directly:

- `POST /api/v0/add?pin=true` — multipart upload
- `GET /ipfs/:cid` via the gateway — content retrieval
- `POST /api/v0/id` — health check

This has zero dependencies, works with any module system, and matches exactly what the npm client does internally.

### Legacy Transaction Format

Polygon Edge's IBFT consensus does not support EIP-1559 fee market transactions. All transactions must use legacy format (`type: 0`) with an explicit `gasPrice`. The deploy script and Hardhat config both enforce this:

```typescript
const contract = await factory.deploy({ gasLimit: 5_000_000, gasPrice: 1_000_000_000, type: 0 });
```

### App Factory Pattern for Testing

The backend was refactored to separate the Express app construction (`app.ts`) from the server bootstrap (`index.ts`). This allows test suites to import the app and use it with `supertest` without starting a real HTTP server or binding to a port.

---

## Build Sequence

The project was scaffolded in this order:

### Phase 1: Monorepo Foundation

1. Created the root directory structure with `pnpm-workspace.yaml` defining three workspaces: `backend`, `frontend`, `agent-sdk`.
2. Root `package.json` with Hardhat, TypeChain, TypeScript, ESLint, Prettier as dev dependencies.
3. Root `tsconfig.json` for scripts and Hardhat files.
4. `.prettierrc` with Solidity plugin overrides (120 print width, 4-space tabs for `.sol`).
5. `.eslintrc.js` with `@typescript-eslint` parser and recommended rules.

### Phase 2: Docker Infrastructure

1. `docker-compose.yml` with two services: `polygon-edge` (v1.3.0) and `ipfs` (Kubo v0.27.0).
2. `scripts/edge-entrypoint.sh` — a shell script mounted into the Polygon Edge container that:
   - Generates validator secrets with `--insecure` flag on first run
   - Extracts the ECDSA address and Node ID
   - Creates a genesis file with the validator registered
   - Starts the server with `--seal` enabled

### Phase 3: Smart Contract

1. `contracts/AIMemoryStorage.sol` — Solidity 0.8.24, single contract with `Memory` struct, `storeMemory()` write function, and three read functions.
2. `hardhat.config.ts` — compiler settings, two network definitions (`localhost` and `polygonEdge`), TypeChain targeting ethers-v6.
3. Two deploy scripts:
   - `scripts/deploy.ts` — Hardhat-native deploy (for standard EVM networks)
   - `scripts/deploy-raw.ts` — Direct ethers.js deploy with legacy tx overrides (for Polygon Edge)

### Phase 4: Backend Service

1. Express app factory in `backend/src/app.ts` with CORS, morgan logging (disabled in test), 10 MB JSON body limit.
2. Server bootstrap in `backend/src/index.ts` with LAN address detection.
3. Three service modules under `backend/src/services/`:
   - `blockchain.ts` — ethers.js v6 contract interactions using human-readable ABI
   - `ipfs.ts` — native HTTP calls to Kubo API
   - `hash.ts` — Node.js `crypto.createHash('sha256')` wrapper
4. Route modules:
   - `backend/src/routes/memory.ts` — POST, GET list, GET by ID, health. Supports JSON and multipart/form-data with file uploads via `multer`.
   - `backend/src/routes/ipfs-proxy.ts` — Proxies IPFS gateway requests so the frontend and external clients can fetch IPFS content without direct IPFS access.
5. Shared TypeScript interfaces in `backend/src/types/index.ts` including `MemoryType`, `FileAttachment`, `IPFSContent`.

### Phase 5: Agent SDK

1. Zero-dependency TypeScript SDK using only Node.js `http`/`https` modules.
2. `MemoryAgent` class with constructor accepting `backendUrl`.
3. Methods: `recordMemory()`, `getMemory()`, `listMemories()`, `health()`.
4. Returns typed results (`RecordMemoryResult`) with `id`, `cid`, `timestamp`, `sha256Hash`, `txHash`.

### Phase 6: Frontend

1. Next.js 14 with App Router, Tailwind CSS, dark theme.
2. API proxy via `next.config.js` rewrites (`/api/*` -> backend, supports `BACKEND_URL` env var).
3. Six components:
   - `NetworkStatus` — polls `/memory/health` every 8s, renders status badges
   - `MemoryTimeline` — lists memories, auto-refreshes every 15s, exposes `refresh()` via `forwardRef`
   - `MemoryDetail` — shows on-chain metadata, IPFS content, file attachments, type/tag badges
   - `EmbeddingChart` — bar chart of up to 128 dimensions (positive=blue, negative=amber)
   - `CreateMemory` — modal for creating new memories with type selector, tags, drag-and-drop file upload
   - `ConnectInfo` — modal showing LAN URLs for sharing the dashboard with other machines

### Phase 7: Testing

1. Installed `vitest` and `supertest` in backend; `vitest` in agent-sdk.
2. Backend unit tests: `hash.test.ts` covering SHA-256 with known vectors, Buffer input, empty string, determinism.
3. Backend integration tests: `routes.test.ts` with mocked IPFS and blockchain services. Tests all routes including POST with JSON, POST with multipart, GET by ID, GET list, health, connect, and input validation errors.
4. Agent SDK tests: `agent.test.ts` spins up a mock HTTP server, tests `MemoryAgent` construction, `recordMemory` success + validation errors, `listMemories`, `getMemory`, `health`.
5. Smart contract tests: `AIMemoryStorage.test.ts` using Hardhat's built-in network. Tests store, read, count, summary, events, multi-author, int16 boundary values, revert on non-existent IDs.

### Phase 8: Network Sharing

1. Backend `GET /connect` endpoint returns LAN IPs and service URLs.
2. Frontend binds to `0.0.0.0` for LAN accessibility.
3. `ConnectInfo` component with copy-to-clipboard and connection checklist.

### Phase 9: Production Builds & Auto-Start Service

1. Built backend for production (`tsc` → `backend/dist/`) and frontend (`next build` → `frontend/.next/`).
2. Fixed TypeScript build errors: added explicit return type annotations to `createApp()` (`: Express`) and router declarations (`: ReturnType<typeof Router>`) to resolve `TS2742` portable type errors with pnpm hoisting.
3. Excluded `dist/` from vitest in backend (`--exclude 'dist/**'`) to prevent compiled JS test files from conflicting with source TS tests.
4. Created `scripts/startup.sh` — a boot sequence script that waits for Docker daemon readiness, starts containers with `docker compose up -d`, waits for Polygon Edge and IPFS health checks, kills stale port occupants, sets environment variables from `deployment.json` and `validator.key`, then launches backend and frontend as background processes with PID tracking.
5. Created `scripts/shutdown.sh` — clean shutdown using saved PID files with port-based fallback.
6. Created a macOS LaunchAgent plist (`~/Library/LaunchAgents/com.mikefink.ai-memory-chain.plist`) with `RunAtLoad: true`, stdout/stderr logging to `logs/`, and PATH configured for Homebrew.
7. Encountered macOS `com.apple.provenance` kernel flag issue — files created from sandboxed apps (IDE terminals) are flagged and blocked by launchd with "Operation not permitted." Created `scripts/install-service.sh` as a one-time installer that must be run from Terminal.app (unsandboxed) to recreate all scripts and the plist without provenance flags, then loads the service.

### Phase 10: Blockchain Explorer & Input Security

1. **Security scanner service** (`backend/src/services/security.ts`):
   - Pattern-based threat detection with 4 categories: prompt injection/jailbreak (10 patterns), XSS (6 patterns), injection attacks (3 patterns), encoding attacks (3 patterns).
   - Each pattern has a type, severity level (low/medium/high/critical), and description.
   - `scanMemoryInput()` examines summary, content, tags, data (recursive deep scan of nested objects/arrays), and filenames.
   - Inputs with critical or high-severity threats are rejected; low/medium generate warnings but pass.
   - Returns structured `SecurityScanResult` with threat details and a human-readable report.
   - Integrated into `POST /memory` route — malicious inputs get HTTP 422 with threat details.

2. **Search/filter endpoint** (`backend/src/routes/search.ts`):
   - `GET /search` with combinable query parameters: `q` (full-text), `type`, `tags`, `author`, `from`/`to` (timestamp range), `embedding` (vector similarity), `topK`.
   - Full-text search uses term-matching across summaries, content, tags, and deep object search through custom JSON data.
   - Vector search implements cosine similarity with ranking.
   - Filters compose: text + type + tags + author + date range all work together.
   - Results include full IPFS content and optional similarity scores.

3. **Blockchain Explorer component** (`frontend/src/components/BlockchainExplorer.tsx`):
   - Three-tab interface: Text Search, Filters, Vector Search.
   - Text Search tab: search bar + type dropdown + tag/author filters.
   - Filters tab: structured form with type, author, tags, max results, date range pickers.
   - Vector Search tab: embedding textarea with Top-K control.
   - Results display with expandable cards showing type badges, tags, similarity scores, CID, hash, author, data preview.
   - Click-through to full memory detail view.
   - Integrated into dashboard header as an "Explorer" button.

4. **Comprehensive test expansion** (46 new tests, 84 total):
   - `security.test.ts` (22 tests): clean inputs, prompt injection (8 variants), XSS (4 variants), SQL injection, command injection, path traversal, tags, length limits, report formatting.
   - `routes.test.ts` expanded (+5 tests): security rejection, search endpoint (text, type, tags, embedding, invalid embedding, timestamp range).
   - `e2e.test.ts` (13 new tests): full memory lifecycle (store→retrieve→list), security gate (reject then allow), search across stored data (text matching summary/content, type filter, tag filter, vector similarity, combined filters, empty results).

### Phase 11: Security Audit Logging & OpenClaw Integration

1. **Security audit log service** (`backend/src/services/audit-log.ts`):
   - SQLite-backed persistent log using `better-sqlite3` (WAL mode, zero-config).
   - Every `POST /memory` scan result (pass or fail) is recorded with: timestamp, source IP, input summary (truncated 200 chars), memory type, safe boolean, threat count, full threat array (JSON), action (allowed/blocked), request metadata (user-agent, content-type).
   - Query API with filters: safe status, threat type, date range, pagination (limit/offset, max 200).
   - Stats aggregation: total scans, allowed/blocked counts, block rate, threat type breakdown, recent block rates (1h, 24h, 7d windows).
   - Added `better-sqlite3` to backend dependencies with native build approval in root `package.json`.

2. **Audit routes** (`backend/src/routes/audit.ts`):
   - `GET /security/audit` — paginated, filterable audit log.
   - `GET /security/audit/stats` — aggregate statistics.
   - Registered in `app.ts` under the `/security` prefix.

3. **Dashboard security panel** (`frontend/src/components/SecurityAuditLog.tsx`):
   - Modal accessible via "Security" button in dashboard header (shield icon).
   - Summary stat cards: total scans, blocked count, allowed count, block rate.
   - Clickable threat breakdown pills that double as filters.
   - All/Blocked/Allowed toggle filter.
   - Scrollable log table with expandable rows showing threat details per entry.
   - Severity-colored threat cards (critical=red, high=orange, medium=yellow, low=blue).
   - Pagination for large audit histories.

4. **OpenClaw Skill** (`~/.openclaw/workspace/skills/ai-memory-chain/SKILL.md`):
   - Follows the same pattern as existing skills (chain-forensics, blockchain-24h-forensic-analyst).
   - Trigger phrases: "store this on the chain", "recall memory", "search memories", "blockchain memory", "chain audit", "security log", "memory bridge sync".
   - Documents all CLI scripts with usage examples.
   - Includes security scanner awareness (what triggers blocks, how to write safe inputs).
   - Tag convention guide for consistent searchability.

5. **CLI tool scripts** (`~/.openclaw/workspace/skills/ai-memory-chain/scripts/`):
   - `memory-store.mjs` — stores memories via `POST /memory` with `--summary`, `--type`, `--content`, `--tags`, `--embedding`, `--data` flags.
   - `memory-recall.mjs` — retrieves by ID, pretty-prints full record including IPFS content and files.
   - `memory-search.mjs` — searches with `--query`, `--type`, `--tags`, `--topK`, `--embedding`; human-readable + JSON stderr output.
   - `memory-list.mjs` — lists all memories with optional `--limit`.
   - `security-audit.mjs` — `--stats` for aggregate view, `--blocked-only` for failures, `--limit`/`--threatType` filters.
   - All scripts use `MEMORY_CHAIN_API` env var (default `http://localhost:3001`), have clear error messages for offline backend.

6. **TOOLS.md update** — Registered six new tools in the OpenClaw workspace tools registry: `chain_memory_store`, `chain_memory_recall`, `chain_memory_search`, `chain_memory_list`, `chain_security_audit`, `chain_memory_bridge` with full parameter schemas and examples.

7. **Bidirectional memory bridge** (`scripts/memory-bridge.mjs`):
   - `sync-to-chain` — scans OpenClaw memory files (`MEMORY.md`, `memory/**/*.md`), computes SHA-256 of each, compares against `bridge-state.json`, stores changed files as blockchain memories with `openclaw-sync` tag and source file metadata.
   - `sync-from-chain` — uses **incremental sync by default**: tracks a high-water mark (the highest chain memory ID processed) and only fetches memories above it. The first run or `--full` flag triggers a complete scan. Skips memories tagged `openclaw-sync` to prevent circular sync. Converts new memories to markdown in `~/.openclaw/workspace/memory/chain-imports/` for automatic indexing by OpenClaw's memory search.
   - `status` — displays last sync timestamps, high-water mark, pending import count, memory counts on both sides, backend health.
   - State tracking via `bridge-state.json` with file hashes, known chain memory IDs, and `highWaterMark`.

8. **OpenClaw cron job** — Added `memory-chain-bridge-sync` to `~/.openclaw/cron/jobs.json` (30-minute interval, `*/30 * * * *`). Uses incremental sync (no `--full` flag) so each run only checks for new memories since the last high-water mark. Disabled the old `daily-memory-backup` job that was failing with execution timeouts — the bridge is a more reliable, stateful replacement.

9. **Test expansion** (15 new tests, 99 total):
   - `audit-log.test.ts` (12 tests): clean scan logging, blocked scan with threats, summary truncation, unfiltered query, filter by safe=true/false, filter by threat type, pagination, accurate stats, empty stats, limit cap.
   - `routes.test.ts` expanded (+3 tests): audit log endpoint, audit log with filters, audit stats endpoint.
   - All existing tests updated with audit-log mock to prevent SQLite side effects.

---

## Issues and Fixes

These are the problems encountered during the initial build and how they were resolved. Documenting them here so future contributors don't hit the same walls.

### 1. Polygon Edge Genesis: Empty Validator Set

**Problem:** The genesis file was created with `--ibft-validators-prefix-path` set to the wrong path. The resulting `extraData` field contained no validator addresses, so IBFT consensus had zero validators and could not seal blocks.

**Root cause:** `--ibft-validators-prefix-path` expects a *prefix* (e.g., `/data/node`), and the tool appends `1/consensus/validator.key`, `2/consensus/validator.key`, etc. The initial script passed the full node path including the number.

**Fix:** Switched to `--ibft-validator <ADDRESS>` with `--ibft-validator-type ecdsa`, which explicitly registers the validator address in the genesis. This is more reliable for single-node setups and easier to extend to multi-node (just add more `--ibft-validator` flags).

### 2. Polygon Edge: `--insecure` Flag Required

**Problem:** `polygon-edge secrets init` refused to create keys, printing: *"use a secrets backend, or supply an --insecure flag to store the private keys locally"*.

**Fix:** Added `--insecure` to the `secrets init` command in the entrypoint script. For local development this is fine. Production deployments should use HashiCorp Vault or another secrets backend.

### 3. Transaction Signing: "invalid signature"

**Problem:** Deploying the contract failed with `ProviderError: invalid signature` even though the account had the correct balance.

**Root cause:** Two overlapping issues:
1. Hardhat's `localhost` network defaults to chain ID 31337 for signing, but Polygon Edge uses chain ID 100.
2. Even with the correct chain ID, Polygon Edge rejected EIP-1559 transactions (type 2). IBFT does not support the EIP-1559 fee market.

**Fix:** Created `scripts/deploy-raw.ts` using ethers.js directly with explicit overrides: `{ gasLimit: 5_000_000, gasPrice: 1_000_000_000, type: 0 }`. Also added `gasPrice: 0` to the `polygonEdge` network in `hardhat.config.ts`.

### 4. `kubo-rpc-client` is ESM-Only

**Problem:** The backend uses `ts-node` with CommonJS module resolution. Importing `kubo-rpc-client` v4 failed with: *"No exports main defined in kubo-rpc-client/package.json"*.

**Fix:** Replaced the dependency entirely with direct HTTP calls to the Kubo REST API using Node.js `http` module. This eliminated the dependency and the module format conflict.

### 5. pnpm Native Build Approval

**Problem:** `keccak` and `secp256k1` packages require native compilation (node-gyp). pnpm v10 requires explicit approval for build scripts, but `pnpm approve-builds` is interactive and doesn't work in non-TTY environments.

**Fix:** Added `"pnpm": { "onlyBuiltDependencies": ["keccak", "secp256k1"] }` to the root `package.json`. This declaratively allows the builds without interactive prompts.

### 6. Chai v6 Incompatibility with Hardhat Chai Matchers

**Problem:** `@nomicfoundation/hardhat-toolbox` pulled in chai v6, but `@nomicfoundation/hardhat-chai-matchers` requires chai v4. This caused `.to.emit()` and `.to.be.revertedWith()` to throw "Invalid Chai property" errors.

**Fix:** Rewrote the smart contract tests to avoid hardhat-chai-matchers. Used `Number()` wrappers for BigInt comparisons, manual event parsing for emission checks, and `try/catch` blocks for revert assertions.

### 7. TypeScript Build Errors: Non-Portable Inferred Types (TS2742)

**Problem:** Running `tsc` in the backend failed with `TS2742: The inferred type of 'createApp' cannot be named without a reference to '.pnpm/@types+express-serve-static-core@...'`. Same error for `router` in the route modules.

**Root cause:** pnpm hoists `@types/express-serve-static-core` in a way that makes its path non-portable. When TypeScript infers the return type of functions that return Express objects, the inferred type references the non-portable path.

**Fix:** Added explicit type annotations: `createApp(): Express`, and `const router: ReturnType<typeof Router> = Router()` in both route files.

### 8. Vitest Picking Up Compiled JS Tests from dist/

**Problem:** After building the backend with `tsc`, vitest found test files in both `src/__tests__/` (TypeScript) and `dist/__tests__/` (compiled JavaScript). The JS versions failed because vitest v4 is ESM-only and can't be `require()`'d from CommonJS.

**Fix:** Added `--exclude 'dist/**'` to the backend test script so vitest only runs the source TypeScript tests.

### 9. macOS `com.apple.provenance` Blocking LaunchAgent Scripts

**Problem:** Scripts created from Cursor's integrated terminal (or any sandboxed app) are tagged with the `com.apple.provenance` kernel extended attribute. When launchd tries to execute these scripts, macOS blocks them with "Operation not permitted" (exit code 126). The attribute cannot be removed with `xattr -cr` because it's set at the kernel level, not the filesystem level.

**Fix:** Created `scripts/install-service.sh` that must be run once from Terminal.app (which is not sandboxed). This script recreates `startup.sh`, `shutdown.sh`, and the LaunchAgent plist from scratch — since Terminal creates files without provenance flags, launchd can execute them.

---

## Testing Strategy

### Structure

Tests are organized alongside their source code (backend and SDK) or in a top-level `test/` directory (contract):

```
backend/src/__tests__/
  hash.test.ts           # Unit: SHA-256 service
  security.test.ts       # Unit: security scanner (22 tests)
  audit-log.test.ts      # Unit: SQLite audit log service (12 tests)
  routes.test.ts         # Integration: all Express routes + search + security + audit (25 tests)
  e2e.test.ts            # E2E: full lifecycle, search, security gate (13 tests)

agent-sdk/src/__tests__/
  agent.test.ts          # Integration: MemoryAgent against a mock HTTP server

test/
  AIMemoryStorage.test.ts  # Smart contract on Hardhat's built-in EVM
```

### Backend Unit Tests

- **Hash tests** (`hash.test.ts`, 6 tests): SHA-256 with known vectors, Buffer input, empty string, determinism.
- **Security tests** (`security.test.ts`, 22 tests): Tests every threat category — prompt injection (ignore instructions, forget everything, role reassignment, chat template delimiters, DAN mode, safety bypass, fake system prompts, nested data injection), XSS (script tags, event handlers, javascript: protocol, iframes), SQL injection, command injection, path traversal, tag scanning, excessive length, and report formatting.
- **Audit log tests** (`audit-log.test.ts`, 12 tests): Uses in-memory SQLite (`:memory:`). Clean scan logging with full field verification, blocked scan with threat persistence, summary truncation at 200 chars, unfiltered query with ordering, filter by safe=true/false, filter by threat type via JSON LIKE, pagination with limit/offset, accurate stats computation (totals, block rate, threat breakdown, recent block rates), empty stats baseline, limit cap enforcement at 200.

### Backend Integration Tests

- **Framework:** vitest + supertest
- **Strategy:** The Express app is imported from `app.ts` (without calling `listen()`). IPFS and blockchain services are mocked with `vi.mock()` so tests run without Docker. This tests the HTTP layer, input validation, error handling, security rejection, and response shapes.
- **Coverage:** POST /memory (JSON + multipart), security rejection (prompt injection, XSS, data field injection, clean passthrough), GET /memory/list, GET /memory/:id, GET /memory/health, GET /health, GET /connect, GET /search (text, type, tags, embedding, invalid embedding, timestamp range), GET /security/audit (unfiltered, with filters, with threatType), GET /security/audit/stats.

### Backend E2E Tests

- **Framework:** vitest + supertest with stateful mock stores
- **Strategy:** Uses mock implementations that maintain in-memory state (arrays and maps) to simulate the full chain + IPFS. Tests multi-step flows where the result of one operation feeds into the next.
- **Coverage:** Store-then-retrieve lifecycle with IPFS content verification, multi-memory listing, security gate (reject malicious then allow clean), and search across seeded data (text match on summaries, text match on data content, type filtering, tag filtering, vector similarity search with scoring, combined filters, empty result handling).

### Agent SDK Tests

- **Framework:** vitest
- **Strategy:** A real HTTP server (Node.js `http.createServer`) runs on an ephemeral port during tests, simulating the backend. The MemoryAgent connects to it. This tests the full HTTP round-trip including serialization, error handling, and response mapping.
- **Coverage:** Constructor defaults, recordMemory (success + 3 validation errors), listMemories, getMemory, health.

### Smart Contract Tests

- **Framework:** Hardhat + chai (Mocha test runner)
- **Strategy:** Each test deploys a fresh contract instance to Hardhat's built-in EVM. Tests the Solidity logic in isolation — no backend or IPFS involved.
- **Coverage:** storeMemory (count, events, sequential IDs, author, empty embedding, int16 bounds), getMemory (all fields, revert), getMemorySummary (values, revert), getMemoryCount (incremental tracking).

### Running Tests

```bash
pnpm test              # All 99 tests
pnpm --filter backend test    # Backend only (78)
pnpm --filter agent-sdk test  # SDK only (9)
npx hardhat test              # Contract only (12)
```

---

## AI Agent & LLM Integration Guide

This section explains how AI agents, LLMs, and autonomous systems can use AI Memory Chain as a persistent memory layer. The system was designed specifically for this use case.

### Why Blockchain Memories for AI?

| Need | How AI Memory Chain Solves It |
|------|-------------------------------|
| **Persistence** | Memories survive restarts, crashes, and redeployments. They're on-chain forever. |
| **Tamper evidence** | SHA-256 integrity hashes let any agent verify that a memory hasn't been altered. |
| **Attribution** | Every memory records `msg.sender` — you know which key (agent) wrote it. |
| **Content addressing** | IPFS CIDs are deterministic. The same content always produces the same address. |
| **Shared memory** | Multiple agents can read/write to the same chain, enabling collaborative memory. |
| **Auditability** | The full history is on-chain: who wrote what, when, with cryptographic proof. |

### Integration Approaches

#### Approach 1: TypeScript Agent SDK (Simplest)

Best for: LangChain.js, AutoGPT.js, custom Node.js agents.

```typescript
import { MemoryAgent } from './agent-sdk/src';

const agent = new MemoryAgent({ backendUrl: 'http://localhost:3001' });

// Store a memory after a conversation
await agent.recordMemory({
  summary: 'User prefers TypeScript over Python for backend work',
  embedding: await embedModel.encode('User prefers TypeScript over Python for backend work'),
  data: {
    type: 'preference',
    confidence: 0.92,
    source: 'conversation_2024_03_22',
    entities: ['TypeScript', 'Python', 'backend'],
  },
});

// Recall all memories
const memories = await agent.listMemories();

// Get full details of a specific memory
const detail = await agent.getMemory(memories[0].id);
// detail.ipfsContent.data.entities → ['TypeScript', 'Python', 'backend']
```

#### Approach 2: REST API (Any Language)

Best for: Python agents, LangChain Python, shell scripts, any HTTP-capable system.

**Python example:**

```python
import requests
import json

BACKEND = "http://localhost:3001"

def store_memory(summary: str, embedding: list[float], data: dict, 
                 memory_type: str = "note", tags: list[str] = None) -> dict:
    payload = {
        "summary": summary,
        "embedding": embedding,
        "data": data,
        "type": memory_type,
    }
    if tags:
        payload["tags"] = tags
    resp = requests.post(f"{BACKEND}/memory", json=payload)
    resp.raise_for_status()
    return resp.json()

def get_memory(memory_id: int) -> dict:
    resp = requests.get(f"{BACKEND}/memory/{memory_id}")
    resp.raise_for_status()
    return resp.json()

def list_memories() -> list[dict]:
    resp = requests.get(f"{BACKEND}/memory/list")
    resp.raise_for_status()
    return resp.json()

def check_health() -> dict:
    resp = requests.get(f"{BACKEND}/memory/health")
    resp.raise_for_status()
    return resp.json()

# Usage
result = store_memory(
    summary="Learned that production DB uses PostgreSQL 16",
    embedding=[0.1, -0.3, 0.5, 0.2],
    data={"database": "postgresql", "version": 16, "environment": "production"},
    memory_type="note",
    tags=["infrastructure", "database"],
)
print(f"Stored memory #{result['id']} with CID {result['ipfsCID']}")
```

#### Approach 3: LLM Function Calling / Tool Use

Best for: ChatGPT, Claude, Gemini, or any LLM with function-calling support.

Define these tools in your LLM's tool schema:

```json
[
  {
    "name": "store_memory",
    "description": "Permanently store a memory on the blockchain. Use this to remember important facts, preferences, decisions, or insights from conversations.",
    "parameters": {
      "type": "object",
      "properties": {
        "summary": {
          "type": "string",
          "description": "1-2 sentence description of what to remember"
        },
        "embedding": {
          "type": "array",
          "items": { "type": "number" },
          "description": "Embedding vector for semantic search (from your embedding model, or empty array if unavailable)"
        },
        "data": {
          "type": "object",
          "description": "Structured data payload with full details, entities, confidence scores, sources, etc."
        },
        "type": {
          "type": "string",
          "enum": ["note", "conversation", "code", "file", "image"],
          "description": "Memory category"
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Searchable tags for categorization"
        }
      },
      "required": ["summary", "embedding", "data"]
    }
  },
  {
    "name": "recall_memory",
    "description": "Retrieve a specific memory by its on-chain ID. Returns full details including the original data payload.",
    "parameters": {
      "type": "object",
      "properties": {
        "id": { "type": "integer", "description": "On-chain memory ID" }
      },
      "required": ["id"]
    }
  },
  {
    "name": "list_memories",
    "description": "List all stored memories with their IDs, summaries, and timestamps. Use this to browse available memories before recalling specific ones.",
    "parameters": { "type": "object", "properties": {} }
  }
]
```

Then implement the tool handler:

```python
import requests

def handle_tool_call(tool_name: str, args: dict) -> str:
    BACKEND = "http://localhost:3001"
    
    if tool_name == "store_memory":
        resp = requests.post(f"{BACKEND}/memory", json=args)
        return json.dumps(resp.json())
    
    elif tool_name == "recall_memory":
        resp = requests.get(f"{BACKEND}/memory/{args['id']}")
        return json.dumps(resp.json())
    
    elif tool_name == "list_memories":
        resp = requests.get(f"{BACKEND}/memory/list")
        return json.dumps(resp.json())
```

#### Approach 4: Direct On-Chain Access (Advanced)

Best for: Fully decentralized agents, cross-chain bridges, on-chain verification scripts.

Reading from the contract requires no signing — only a JSON-RPC connection:

```typescript
import { ethers } from 'ethers';

const ABI = [
  'function getMemory(uint256 _id) view returns (string summary, uint256 timestamp, string ipfsCID, bytes32 sha256Hash, int16[] embedding, address author)',
  'function getMemoryCount() view returns (uint256)',
  'function getMemorySummary(uint256 _id) view returns (string, uint256)',
];

const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const contractAddress = require('./deployment.json').address;
const contract = new ethers.Contract(contractAddress, ABI, provider);

// Read all memories
const count = await contract.getMemoryCount();
for (let i = 0; i < count; i++) {
  const [summary, timestamp, ipfsCID, sha256Hash, embedding, author] =
    await contract.getMemory(i);
  
  // Fetch full content from IPFS
  const ipfsContent = await fetch(`http://localhost:8080/ipfs/${ipfsCID}`).then(r => r.json());
  
  // Verify integrity
  const computed = '0x' + require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(ipfsContent))
    .digest('hex');
  const verified = computed === sha256Hash;
}
```

Writing requires a wallet with the validator's private key:

```typescript
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
const contractWithSigner = contract.connect(wallet);

const tx = await contractWithSigner.storeMemory(
  'Direct on-chain memory from autonomous agent',
  'QmYourIPFSCid',
  '0xYourSHA256Hash',
  [100, -200, 300],  // int16 quantized embedding
  { gasPrice: 1_000_000_000, type: 0 }
);
const receipt = await tx.wait();
```

### Common Agent Patterns

#### Semantic Search Over Memories

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function searchMemories(query: string, topK = 5) {
  const queryEmbedding = await embedModel.encode(query);
  const list = await agent.listMemories();
  
  const scored = await Promise.all(
    list.map(async (m) => {
      const detail = await agent.getMemory(m.id);
      const embedding = detail.ipfsContent?.embedding || detail.embedding;
      return {
        ...detail,
        score: cosineSimilarity(queryEmbedding, embedding),
      };
    })
  );
  
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
```

#### Context Window Injection

```typescript
async function buildMemoryContext(maxMemories = 5): Promise<string> {
  const memories = await agent.listMemories();
  const recent = memories.sort((a, b) => b.timestamp - a.timestamp).slice(0, maxMemories);
  
  const details = await Promise.all(recent.map(m => agent.getMemory(m.id)));
  
  return details.map(m => {
    const time = new Date(m.timestamp * 1000).toISOString();
    const data = m.ipfsContent?.data ? JSON.stringify(m.ipfsContent.data) : '{}';
    return `[${time}] ${m.summary}\nDetails: ${data}`;
  }).join('\n---\n');
}

// Use in your LLM system prompt
const memoryContext = await buildMemoryContext();
const systemPrompt = `You are an AI assistant with persistent memory.

Your memories from past conversations:
${memoryContext}

Use these memories to personalize your responses. Store new important information using the store_memory tool.`;
```

#### Integrity Verification

```typescript
import { createHash } from 'crypto';

async function verifyMemory(id: number): Promise<boolean> {
  const memory = await agent.getMemory(id);
  if (!memory.ipfsContent) return false;
  
  const content = JSON.stringify(memory.ipfsContent);
  const computed = '0x' + createHash('sha256').update(content).digest('hex');
  return computed === memory.sha256Hash;
}
```

#### Multi-Agent Shared Memory

Multiple agents can use the same chain. Each memory records its `author` address, so you can filter by agent:

```typescript
async function getMyMemories(myAddress: string) {
  const list = await agent.listMemories();
  const details = await Promise.all(list.map(m => agent.getMemory(m.id)));
  return details.filter(m => m.author.toLowerCase() === myAddress.toLowerCase());
}

async function getTeamMemories() {
  const list = await agent.listMemories();
  return Promise.all(list.map(m => agent.getMemory(m.id)));
}
```

---

## OpenClaw Integration

This section documents how AI Memory Chain integrates with [OpenClaw](https://docs.openclaw.ai), the AI agent platform. The integration operates at three layers.

### Architecture

```
OpenClaw Agent (:18789)
├── SKILL.md (ai-memory-chain)
│   └── Teaches agent when/how to use blockchain memory
├── CLI Scripts (scripts/*.mjs)
│   ├── memory-store.mjs      → POST /memory
│   ├── memory-recall.mjs     → GET /memory/:id
│   ├── memory-search.mjs     → GET /search
│   ├── memory-list.mjs       → GET /memory/list
│   └── security-audit.mjs    → GET /security/audit
├── Memory Bridge (memory-bridge.mjs)
│   ├── sync-to-chain    → OpenClaw memory files → blockchain
│   └── sync-from-chain  → blockchain → memory/chain-imports/
└── Cron Job (every 30 min)
    └── Runs bridge sync automatically
```

### Layer A: Skill (SKILL.md)

Located at `~/.openclaw/workspace/skills/ai-memory-chain/SKILL.md`. Follows the same `---` front matter pattern as existing skills (chain-forensics, blockchain-24h-forensic-analyst). The skill:

- Defines trigger phrases that activate it (e.g., "store this on the chain", "recall memory", "search memories", "chain audit").
- Documents all five CLI scripts with full usage and flag descriptions.
- Explains the security scanner (what triggers blocks, how to write safe inputs).
- Provides tag conventions (`openclaw-sync`, `daily-note`, `decision`, `config`, `lesson`, `preference`, `conversation`) for consistent searchability.
- Lists all REST API endpoints for direct `curl`/`web_fetch` access.
- Includes best practices: store proactively, search before storing, use descriptive summaries, check health first.

### Layer B: CLI Tool Scripts

Five scripts in `~/.openclaw/workspace/skills/ai-memory-chain/scripts/`, all using the same `node scripts/*.mjs` pattern as the existing chain-forensics skill:

- **`memory-store.mjs`** — Accepts `--summary`, `--type`, `--content`, `--tags`, `--embedding`, `--data`. Posts JSON to `POST /memory`. Outputs structured JSON result (id, txHash, ipfsCID, sha256Hash).
- **`memory-recall.mjs`** — Accepts positional `<id>` argument. Pretty-prints the full memory record with human-readable formatting plus raw JSON.
- **`memory-search.mjs`** — Accepts `--query`, `--type`, `--tags`, `--topK`, `--embedding`, `--author`, `--from`, `--to`. Human-readable results on stdout, full JSON on stderr for programmatic use.
- **`memory-list.mjs`** — Accepts `--limit`. Lists all memories as `#ID  TIMESTAMP  SUMMARY`.
- **`security-audit.mjs`** — `--stats` for aggregate view, `--blocked-only` for failures only, `--limit`, `--threatType`, `--from`, `--to` for filtering.

All scripts:
- Default to `http://localhost:3001` but respect `MEMORY_CHAIN_API` env var.
- Print clear error messages when the backend is offline.
- Are executable (`chmod +x`) and start with `#!/usr/bin/env node`.

Registered in `~/.openclaw/workspace/TOOLS.md` as callable tools with full parameter schemas.

### Layer C: Bidirectional Memory Bridge

The bridge keeps OpenClaw's native markdown memory files and the blockchain in sync.

**Sync to chain** (`sync-to-chain`):
1. Scans `MEMORY.md` and all `.md` files in `memory/` (recursively, skipping `memory/chain-imports/`).
2. Computes SHA-256 of each file's content.
3. Compares against `bridge-state.json` — only changed/new files are synced.
4. Stores each changed file as a blockchain memory with summary `[openclaw-sync] <relPath>`, type `note`, and tags `['openclaw-sync', '<filename>']`.
5. Updates `bridge-state.json` with new hashes.

**Sync from chain** (`sync-from-chain`):
Uses **incremental sync by default** — only processes memories above the high-water mark.
1. Gets the current memory count from the backend.
2. Reads `highWaterMark` from `bridge-state.json` (the highest ID processed in the last sync).
3. If incremental (default): only fetches memories from `highWaterMark + 1` to `count - 1`. If `--full`: scans from ID 0.
4. Skips memories tagged `openclaw-sync` (prevents circular sync from to-chain → from-chain).
5. Converts each new memory to a markdown file in `~/.openclaw/workspace/memory/chain-imports/`.
6. Updates `highWaterMark` to the last processed ID.
7. First run always does a full scan (highWaterMark starts at -1).

**State tracking** — `bridge-state.json` stores:
- `lastSyncToChain` / `lastSyncFromChain` timestamps
- `fileHashes` (relPath → SHA-256) for change detection
- `chainMemoryIds` (array of known IDs) for import deduplication
- `highWaterMark` (integer) — the highest chain memory ID that has been processed; incremental sync starts from `highWaterMark + 1`

**Cron job** — `memory-chain-bridge-sync` in `~/.openclaw/cron/jobs.json`, runs `*/30 * * * *` (every 30 minutes). Uses incremental sync (no `--full` flag) so each 30-minute run only checks for memories created since the last sync — not the entire chain. The old `daily-memory-backup` job was disabled as the bridge is a more reliable, stateful replacement for workspace backup.

---

## Adding Validators on Other Machines

The default setup runs a single validator. IBFT consensus works with one node but offers no fault tolerance. For a proper network, you want **4 validators** (tolerates 1 Byzantine fault) or **7 validators** (tolerates 2).

IBFT liveness rule: the network needs **> 2/3 of validators** online to produce blocks.

### Prerequisites

- Each machine has Docker installed
- Machines can reach each other over the network on TCP ports **10001** (libp2p), **10000** (gRPC), and **8545** (JSON-RPC)
- One machine is designated as the **coordinator** (runs the genesis generation)

### Step 1: Generate Secrets on Each Machine

On every machine that will be a validator, run:

```bash
docker run --rm -v $(pwd)/node-data:/data \
  0xpolygon/polygon-edge:1.3.0 \
  secrets init --insecure --data-dir /data/node1
```

Record the output for each machine:

```
Public key (address) = 0xAAAA...
Node ID              = 16Uiu2HAm...
```

You need three pieces of info from each node:

| Field | Example | Where it comes from |
|-------|---------|---------------------|
| **Address** | `0xAAAA...` | `secrets init` output, or `secrets output` |
| **Node ID** | `16Uiu2HAm...` | Same output |
| **IP address** | `192.168.1.10` | The machine's LAN IP |

### Step 2: Collect All Node Info

Gather a table like this (example with 4 nodes):

| Node | Machine IP | Validator Address | Node ID |
|------|-----------|-------------------|---------|
| node1 | 192.168.1.10 | `0xAAAA...` | `16Uiu2HAm...AAA` |
| node2 | 192.168.1.11 | `0xBBBB...` | `16Uiu2HAm...BBB` |
| node3 | 192.168.1.12 | `0xCCCC...` | `16Uiu2HAm...CCC` |
| node4 | 192.168.1.13 | `0xDDDD...` | `16Uiu2HAm...DDD` |

### Step 3: Generate Genesis (On the Coordinator)

On the coordinator machine, run the genesis command with **all** validators and bootnodes listed:

```bash
docker run --rm -v $(pwd)/genesis-out:/output \
  0xpolygon/polygon-edge:1.3.0 \
  genesis \
    --consensus ibft \
    --ibft-validator-type ecdsa \
    --ibft-validator 0xAAAA... \
    --ibft-validator 0xBBBB... \
    --ibft-validator 0xCCCC... \
    --ibft-validator 0xDDDD... \
    --bootnode "/ip4/192.168.1.10/tcp/10001/p2p/16Uiu2HAm...AAA" \
    --bootnode "/ip4/192.168.1.11/tcp/10001/p2p/16Uiu2HAm...BBB" \
    --bootnode "/ip4/192.168.1.12/tcp/10001/p2p/16Uiu2HAm...CCC" \
    --bootnode "/ip4/192.168.1.13/tcp/10001/p2p/16Uiu2HAm...DDD" \
    --premine "0xAAAA...:1000000000000000000000" \
    --premine "0xBBBB...:1000000000000000000000" \
    --premine "0xCCCC...:1000000000000000000000" \
    --premine "0xDDDD...:1000000000000000000000" \
    --block-gas-limit 10000000 \
    --chain-id 100 \
    --dir /output/genesis.json
```

Key points:

- Every validator address gets an `--ibft-validator` flag
- Every node gets a `--bootnode` flag with its **public IP** and **Node ID**
- `--premine` gives each validator an initial balance for gas fees
- All nodes **must** use the same `--chain-id`

### Step 4: Distribute the Genesis File

Copy the generated `genesis.json` to every machine. Every node must start with the **identical** genesis file.

```bash
# From the coordinator
scp genesis-out/genesis.json user@192.168.1.11:~/node-data/genesis.json
scp genesis-out/genesis.json user@192.168.1.12:~/node-data/genesis.json
scp genesis-out/genesis.json user@192.168.1.13:~/node-data/genesis.json
```

### Step 5: Start Each Node

On each machine, run the Polygon Edge server. The only differences per node are `--data-dir` (which contains that node's private key) and `--nat` (that node's public IP).

```bash
docker run -d --name polygon-edge \
  --restart unless-stopped \
  -p 8545:8545 \
  -p 10000:10000 \
  -p 10001:10001 \
  -v $(pwd)/node-data:/data \
  0xpolygon/polygon-edge:1.3.0 \
  server \
    --data-dir /data/node1 \
    --chain /data/genesis.json \
    --grpc-address 0.0.0.0:10000 \
    --libp2p 0.0.0.0:10001 \
    --jsonrpc 0.0.0.0:8545 \
    --nat 192.168.1.XX \
    --seal \
    --log-level INFO
```

Replace `192.168.1.XX` with that machine's actual IP.

Important flags:

| Flag | Purpose |
|------|---------|
| `--libp2p 0.0.0.0:10001` | Bind the P2P port so other nodes can connect |
| `--nat <PUBLIC_IP>` | Advertise the correct IP to peers (critical for cross-machine discovery) |
| `--seal` | Enable this node to participate in block production |

### Step 6: Verify the Network

From any node, check that peers are connected and blocks are advancing:

```bash
# Block number should increase every ~2 seconds
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check peer count (should be N-1 for N validators)
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}'
```

### Docker Compose for Multi-Node (Same LAN)

If you want to run all four nodes on different machines but use Docker Compose on each, here's a template for a non-coordinator node:

```yaml
services:
  polygon-edge:
    image: 0xpolygon/polygon-edge:1.3.0
    container_name: polygon-edge
    restart: unless-stopped
    ports:
      - "8545:8545"
      - "10000:10000"
      - "10001:10001"
    volumes:
      - ./node-data:/data
    command: >
      server
      --data-dir /data/node1
      --chain /data/genesis.json
      --grpc-address 0.0.0.0:10000
      --libp2p 0.0.0.0:10001
      --jsonrpc 0.0.0.0:8545
      --nat 192.168.1.XX
      --seal
      --log-level INFO
```

Each machine needs:
- `node-data/node1/consensus/validator.key` — that machine's private key (generated in Step 1)
- `node-data/genesis.json` — the shared genesis file (from Step 4)

### Updating the Backend to Point at the Network

Once the multi-validator network is running, update the backend's `RPC_URL` to point at any node (or use a load balancer across all JSON-RPC endpoints):

```bash
export RPC_URL="http://192.168.1.10:8545"
```

For high availability, consider running the backend on each validator machine and load-balancing at the application layer.

### Troubleshooting Multi-Node

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Block number stuck at 0 | Fewer than 2/3+1 validators online | Start more nodes |
| `net_peerCount` returns 0 | Firewall blocking TCP 10001 | Open the port on all machines |
| "invalid signature" on tx | Wrong chain ID or tx type | Use `chainId: 100`, `type: 0`, explicit `gasPrice` |
| Node logs "unable to connect to bootnode" | Wrong IP or Node ID in genesis | Regenerate genesis with correct multiaddrs |
| Peers connect but no blocks | Validator key not matching genesis | Ensure each node's address is in the `--ibft-validator` list |

---

## File Manifest

All files in the project, organized by purpose:

### Infrastructure

| File | Purpose |
|------|---------|
| `package.json` | Monorepo root — scripts, dependencies, pnpm config |
| `pnpm-workspace.yaml` | Workspace definitions (backend, frontend, agent-sdk) |
| `tsconfig.json` | Root TypeScript config for scripts and Hardhat |
| `.prettierrc` | Code formatting with Solidity plugin |
| `.eslintrc.js` | Linting rules (TypeScript-aware) |
| `.gitignore` | Standard ignores (node_modules, dist, .env, data/) |
| `.npmrc` | pnpm build approval config |
| `docker-compose.yml` | Polygon Edge + IPFS Kubo services |
| `scripts/edge-entrypoint.sh` | Polygon Edge container init (key gen + genesis + server start) |
| `scripts/genesis.ts` | Standalone genesis generator (for use outside Docker) |
| `scripts/install-service.sh` | One-time macOS LaunchAgent installer (run from Terminal.app) |
| `scripts/startup.sh` | Boot sequence: wait for Docker → containers → backend → frontend |
| `scripts/shutdown.sh` | Clean shutdown of Node.js backend + frontend services |

### Smart Contract

| File | Purpose |
|------|---------|
| `contracts/AIMemoryStorage.sol` | Solidity contract — Memory struct, store/read functions, events |
| `hardhat.config.ts` | Solidity 0.8.24, optimizer, TypeChain, network definitions |
| `scripts/deploy.ts` | Hardhat-native deploy script |
| `scripts/deploy-raw.ts` | ethers.js deploy with legacy tx overrides (for Polygon Edge) |
| `test/AIMemoryStorage.test.ts` | Smart contract test suite (12 tests) |
| `deployment.json` | Deployed contract address (written by deploy script) |

### Backend

| File | Purpose |
|------|---------|
| `backend/package.json` | Backend dependencies (express, ethers, cors, morgan, multer, vitest) |
| `backend/tsconfig.json` | Backend TypeScript config |
| `backend/src/types/index.ts` | Shared interfaces (MemoryInput, MemoryRecord, MemoryType, FileAttachment, etc.) |
| `backend/src/services/hash.ts` | SHA-256 computation |
| `backend/src/services/ipfs.ts` | Kubo HTTP API client (upload JSON, upload buffer, fetch, health) |
| `backend/src/services/blockchain.ts` | ethers.js contract interactions |
| `backend/src/services/security.ts` | Input security scanner (prompt injection, XSS, SQL/command injection, path traversal) |
| `backend/src/services/audit-log.ts` | SQLite-backed security audit log (better-sqlite3, WAL mode) |
| `backend/src/routes/memory.ts` | Express route handlers (POST with security scanning + audit logging, GET, list, health) |
| `backend/src/routes/search.ts` | Search/filter endpoint (text, type, tags, author, date range, vector similarity) |
| `backend/src/routes/audit.ts` | Security audit log endpoints (GET /security/audit, GET /security/audit/stats) |
| `backend/src/routes/ipfs-proxy.ts` | Proxied IPFS gateway access for frontend/external clients |
| `backend/src/app.ts` | Express app factory (importable by tests) |
| `backend/src/index.ts` | Server bootstrap (listen + LAN address detection) |
| `backend/src/__tests__/hash.test.ts` | Hash service unit tests (6 tests) |
| `backend/src/__tests__/security.test.ts` | Security scanner unit tests (22 tests) |
| `backend/src/__tests__/audit-log.test.ts` | Audit log service unit tests (12 tests) |
| `backend/src/__tests__/routes.test.ts` | Route integration tests including search, security, audit (25 tests) |
| `backend/src/__tests__/e2e.test.ts` | End-to-end tests with stateful mocks (13 tests) |

### Agent SDK

| File | Purpose |
|------|---------|
| `agent-sdk/package.json` | SDK package config |
| `agent-sdk/tsconfig.json` | SDK TypeScript config |
| `agent-sdk/src/index.ts` | MemoryAgent class with recordMemory, getMemory, listMemories, health |
| `agent-sdk/src/__tests__/agent.test.ts` | SDK tests with mock HTTP server (9 tests) |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/package.json` | Next.js + React + Tailwind dependencies |
| `frontend/tsconfig.json` | Next.js TypeScript config with path aliases |
| `frontend/next.config.js` | API proxy rewrites to backend (supports BACKEND_URL env var) |
| `frontend/tailwind.config.ts` | Custom `chain` color palette, content paths |
| `frontend/postcss.config.js` | PostCSS with Tailwind + autoprefixer |
| `frontend/src/app/globals.css` | Tailwind base + dark theme + component utilities |
| `frontend/src/app/layout.tsx` | Root layout with header and metadata |
| `frontend/src/app/page.tsx` | Dashboard page — timeline + detail + create + share + network status |
| `frontend/src/lib/api.ts` | Typed fetch wrapper for backend API |
| `frontend/src/components/NetworkStatus.tsx` | Live Polygon/IPFS status badges |
| `frontend/src/components/MemoryTimeline.tsx` | Memory list with auto-refresh and forwardRef |
| `frontend/src/components/MemoryDetail.tsx` | Full memory view (on-chain + IPFS + files + type/tags) |
| `frontend/src/components/EmbeddingChart.tsx` | Bar chart visualization of embeddings |
| `frontend/src/components/CreateMemory.tsx` | Modal for creating memories (all types, drag-and-drop files) |
| `frontend/src/components/BlockchainExplorer.tsx` | Search/filter explorer modal (text, type, tags, vector, date range) |
| `frontend/src/components/SecurityAuditLog.tsx` | Security audit log panel (stats, filters, expandable threat details) |
| `frontend/src/components/ConnectInfo.tsx` | Network sharing modal with LAN URLs |

### OpenClaw Integration (external to project directory)

| File | Purpose |
|------|---------|
| `~/.openclaw/workspace/skills/ai-memory-chain/SKILL.md` | OpenClaw skill — trigger phrases, usage guide, best practices |
| `~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-store.mjs` | CLI: store memory via backend API |
| `~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-recall.mjs` | CLI: recall memory by ID |
| `~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-search.mjs` | CLI: search memories |
| `~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-list.mjs` | CLI: list all memories |
| `~/.openclaw/workspace/skills/ai-memory-chain/scripts/security-audit.mjs` | CLI: security audit log and stats |
| `~/.openclaw/workspace/skills/ai-memory-chain/scripts/memory-bridge.mjs` | Bidirectional memory bridge (sync-to-chain, sync-from-chain [--full], status) |
| `~/.openclaw/workspace/skills/ai-memory-chain/bridge-state.json` | Bridge state — file hashes, sync timestamps, known chain IDs, highWaterMark |
| `~/.openclaw/workspace/TOOLS.md` | Updated with 6 new chain memory tool definitions |
| `~/.openclaw/cron/jobs.json` | Added memory-chain-bridge-sync cron (30min interval) |

### Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview, quick start, API ref, agent access guide, OpenClaw integration, architecture |
| `docs/creation-process.md` | This file — build log, design decisions, testing, agent guide, OpenClaw integration, multi-validator |
