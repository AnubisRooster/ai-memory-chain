# Graph Report - ai-memory-chain  (2026-09-07)

## Corpus Check
- 78 files · ~114,885 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 551 nodes · 810 edges · 32 communities (21 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- api.ts
- app.ts
- memory.ts
- package.json
- backend/package.json
- frontend/package.json
- security.ts
- scripts
- agent-sdk/package.json
- compilerOptions
- self-heal.sh
- compilerOptions
- compilerOptions
- compilerOptions
- MemoryAgent
- watchdog.sh
- discovery.sh
- startup.sh
- genesis.ts
- edge-entrypoint.sh
- validator-join.sh
- next.config.js
- graphify_pipeline.py
- install-service.sh
- shutdown.sh
- validator-exit.sh
- next-env.d.ts
- edge-entrypoint-node2.sh
- edge-entrypoint-nonnat.sh

## God Nodes (most connected - your core abstractions)
1. `scripts` - 23 edges
2. `compilerOptions` - 16 edges
3. `log()` - 14 edges
4. `compilerOptions` - 14 edges
5. `compilerOptions` - 13 edges
6. `compilerOptions` - 13 edges
7. `run_tasks()` - 12 edges
8. `watchdog.sh script` - 11 edges
9. `MemoryAgent` - 10 edges
10. `getProvider()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `shutdown()` --calls--> `closeDB()`  [EXTRACTED]
  backend/src/index.ts → backend/src/services/audit-log.ts
- `getConnectedPeers()` --calls--> `getProvider()`  [EXTRACTED]
  backend/src/services/validator.ts → backend/src/services/blockchain.ts
- `ibftCall()` --calls--> `getProvider()`  [EXTRACTED]
  backend/src/services/validator.ts → backend/src/services/blockchain.ts
- `runCheck()` --calls--> `isPolygonOnline()`  [EXTRACTED]
  backend/src/services/health-monitor.ts → backend/src/services/blockchain.ts
- `runCheck()` --calls--> `isIPFSOnline()`  [EXTRACTED]
  backend/src/services/health-monitor.ts → backend/src/services/ipfs.ts

## Import Cycles
- None detected.

## Communities (32 total, 8 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.05
Nodes (57): BlockchainExplorer(), BlockchainExplorerProps, formatTime(), MEMORY_TYPES, ResultCard(), TabId, truncate(), ConnectInfo() (+49 more)

### Community 1 - "app.ts"
Cohesion: 0.06
Nodes (43): createApp(), getLanAddresses(), app, PORT, server, shutdown(), router, router (+35 more)

### Community 2 - "memory.ts"
Cohesion: 0.07
Nodes (39): upload, router, ABI, getContract(), getContractAddress(), getMemoryCount(), getMemoryOnChain(), getMemorySummaryOnChain() (+31 more)

### Community 3 - "package.json"
Cohesion: 0.04
Nodes (40): config, dependencies, ethers, description, devDependencies, concurrently, eslint, hardhat (+32 more)

### Community 4 - "backend/package.json"
Cohesion: 0.05
Nodes (42): dependencies, better-sqlite3, cors, ethers, express, morgan, multer, devDependencies (+34 more)

### Community 5 - "frontend/package.json"
Cohesion: 0.06
Nodes (30): dependencies, next, react, react-dom, devDependencies, autoprefixer, postcss, tailwindcss (+22 more)

### Community 6 - "security.ts"
Cohesion: 0.13
Nodes (23): AuditEntry, AuditQuery, AuditStats, closeDB(), getAuditStats(), getDB(), logScan(), queryAuditLog() (+15 more)

### Community 7 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, build, compile, deploy, dev, dev:backend, dev:frontend, format (+15 more)

### Community 8 - "agent-sdk/package.json"
Cohesion: 0.10
Nodes (19): devDependencies, ts-node, @types/node, typescript, vitest, ts-node, @types/node, typescript (+11 more)

### Community 9 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 10 - "self-heal.sh"
Cohesion: 0.29
Nodes (18): cleanup(), log(), now_epoch(), rotate_log(), run_tasks(), self-heal.sh script, should_run(), show_status() (+10 more)

### Community 11 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+8 more)

### Community 12 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule (+7 more)

### Community 13 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule (+7 more)

### Community 14 - "MemoryAgent"
Cohesion: 0.20
Nodes (4): AgentSDKOptions, MemoryAgent, RecordMemoryInput, RecordMemoryResult

### Community 15 - "watchdog.sh"
Cohesion: 0.32
Nodes (12): cleanup(), clear_strike(), get_strike(), init_strikes(), is_project_process(), log(), prune_dead_strikes(), rotate_log() (+4 more)

### Community 16 - "discovery.sh"
Cohesion: 0.42
Nodes (9): advertise_loop(), discover_once(), get_bootnode_multiaddr(), get_broadcast_addr(), get_lan_ip(), log(), discovery.sh script, show_status() (+1 more)

### Community 17 - "startup.sh"
Cohesion: 0.39
Nodes (8): cleanup(), CONTRACT_ADDRESS, DEPLOYER_PRIVATE_KEY, log(), PATH, rotate_log(), startup.sh script, wait_for_url()

### Community 18 - "genesis.ts"
Cohesion: 0.40
Nodes (5): DATA_DIR, GENESIS_PATH, main(), NODE_DIR, run()

### Community 19 - "edge-entrypoint.sh"
Cohesion: 0.70
Nodes (4): founder_mode(), init_secrets(), joiner_mode(), edge-entrypoint.sh script

### Community 20 - "validator-join.sh"
Cohesion: 0.83
Nodes (3): get_lan_ip(), log(), validator-join.sh script

## Knowledge Gaps
- **249 isolated node(s):** `name`, `version`, `private`, `main`, `types` (+244 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 283 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `app.ts` to `memory.ts`, `backend/package.json`, `security.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `react` connect `api.ts` to `frontend/package.json`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _249 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05017543859649123 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06359189378057302 - nodes in this community are weakly interconnected._
- **Should `memory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07474600870827286 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._