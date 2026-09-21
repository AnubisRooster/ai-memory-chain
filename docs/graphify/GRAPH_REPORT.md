# Graph Report - ai-memory-chain  (2026-09-21)

## Corpus Check
- 78 files · ~115,261 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .sol 1, .jsonl 1)

## Summary
- 574 nodes · 865 edges · 39 communities (29 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- api.ts
- memory.ts
- routes/validator.ts
- frontend/package.json
- package.json
- scripts
- agent-sdk/package.json
- compilerOptions
- self-heal.sh
- MemoryAgent
- backend/package.json
- compilerOptions
- compilerOptions
- compilerOptions
- graphify_pipeline.py
- security.ts
- devDependencies
- genesis.ts
- watchdog.sh
- devDependencies
- app.ts
- audit-log.ts
- discovery.sh
- startup.sh
- e2e.test.ts
- dependencies
- scripts
- edge-entrypoint.sh
- hash.ts
- validator-join.sh
- next.config.js
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
- `getConnectedPeers()` --calls--> `getProvider()`  [EXTRACTED]
  backend/src/services/validator.ts → backend/src/services/blockchain.ts
- `ibftCall()` --calls--> `getProvider()`  [EXTRACTED]
  backend/src/services/validator.ts → backend/src/services/blockchain.ts
- `runCheck()` --calls--> `isPolygonOnline()`  [EXTRACTED]
  backend/src/services/health-monitor.ts → backend/src/services/blockchain.ts
- `runCheck()` --calls--> `isIPFSOnline()`  [EXTRACTED]
  backend/src/services/health-monitor.ts → backend/src/services/ipfs.ts
- `MemoryTimeline` --indirect_call--> `load()`  [INFERRED]
  frontend/src/components/MemoryTimeline.tsx → frontend/src/components/MemoryDetail.tsx

## Import Cycles
- None detected.

## Communities (39 total, 10 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.05
Nodes (57): BlockchainExplorer(), BlockchainExplorerProps, formatTime(), MEMORY_TYPES, ResultCard(), TabId, truncate(), ConnectInfo() (+49 more)

### Community 1 - "memory.ts"
Cohesion: 0.08
Nodes (39): upload, deepSearchObject(), router, ABI, getContract(), getContractAddress(), getMemoryCount(), getMemoryOnChain() (+31 more)

### Community 2 - "routes/validator.ts"
Cohesion: 0.08
Nodes (35): createApp(), getLanAddresses(), app, PORT, server, shutdown(), getKnownPeerApis(), PEERS_PATH (+27 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.06
Nodes (31): dependencies, next, react, react-dom, devDependencies, autoprefixer, postcss, tailwindcss (+23 more)

### Community 4 - "package.json"
Cohesion: 0.07
Nodes (27): config, dependencies, ethers, description, engines, node, pnpm, ethers (+19 more)

### Community 5 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, build, compile, deploy, dev, dev:backend, dev:frontend, format (+15 more)

### Community 6 - "agent-sdk/package.json"
Cohesion: 0.10
Nodes (19): devDependencies, ts-node, @types/node, typescript, vitest, ts-node, @types/node, typescript (+11 more)

### Community 7 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 8 - "self-heal.sh"
Cohesion: 0.29
Nodes (18): cleanup(), log(), now_epoch(), rotate_log(), run_tasks(), self-heal.sh script, should_run(), show_status() (+10 more)

### Community 9 - "MemoryAgent"
Cohesion: 0.18
Nodes (6): AgentSDKOptions, MemoryAgent, RecordMemoryInput, RecordMemoryResult, ref_http, ref_https

### Community 10 - "backend/package.json"
Cohesion: 0.12
Nodes (16): ethers, @types/node, typescript, vitest, name, private, version, better-sqlite3 (+8 more)

### Community 11 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+8 more)

### Community 12 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule (+7 more)

### Community 13 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule (+7 more)

### Community 14 - "graphify_pipeline.py"
Cohesion: 0.13
Nodes (13): graphify_analyze, graphify_build, graphify_cluster, graphify_detect, graphify_export, graphify_extract, graphify_llm, graphify_report (+5 more)

### Community 15 - "security.ts"
Cohesion: 0.20
Nodes (12): ALL_PATTERNS, ENCODING_PATTERNS, formatThreatReport(), INJECTION_PATTERNS, MAX_FIELD_LENGTHS, PatternRule, PROMPT_INJECTION_PATTERNS, scanDataObject() (+4 more)

### Community 16 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, concurrently, eslint, hardhat, @nomicfoundation/hardhat-toolbox, prettier, prettier-plugin-solidity, ts-node (+6 more)

### Community 17 - "genesis.ts"
Cohesion: 0.18
Nodes (9): ref_child_process, ref_ethers, ref_fs, ref_path, DATA_DIR, GENESIS_PATH, main(), NODE_DIR (+1 more)

### Community 18 - "watchdog.sh"
Cohesion: 0.32
Nodes (12): cleanup(), clear_strike(), get_strike(), init_strikes(), is_project_process(), log(), prune_dead_strikes(), rotate_log() (+4 more)

### Community 19 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, supertest, ts-node-dev, @types/better-sqlite3, @types/cors, @types/express, @types/morgan, @types/multer (+4 more)

### Community 20 - "app.ts"
Cohesion: 0.23
Nodes (7): router, router, router, AuditQuery, cors, express, morgan

### Community 21 - "audit-log.ts"
Cohesion: 0.36
Nodes (9): AuditEntry, AuditStats, getAuditStats(), getDB(), logScan(), queryAuditLog(), rowToEntry(), SecurityScanResult (+1 more)

### Community 22 - "discovery.sh"
Cohesion: 0.42
Nodes (9): advertise_loop(), discover_once(), get_bootnode_multiaddr(), get_broadcast_addr(), get_lan_ip(), log(), discovery.sh script, show_status() (+1 more)

### Community 23 - "startup.sh"
Cohesion: 0.39
Nodes (8): cleanup(), CONTRACT_ADDRESS, DEPLOYER_PRIVATE_KEY, log(), PATH, rotate_log(), startup.sh script, wait_for_url()

### Community 24 - "e2e.test.ts"
Cohesion: 0.29
Nodes (6): app, ipfsStore, memoryStore, app, supertest, ref_vitest

### Community 25 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, better-sqlite3, cors, ethers, express, morgan, multer

### Community 26 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

### Community 27 - "edge-entrypoint.sh"
Cohesion: 0.70
Nodes (4): founder_mode(), init_secrets(), joiner_mode(), edge-entrypoint.sh script

### Community 29 - "validator-join.sh"
Cohesion: 0.83
Nodes (3): get_lan_ip(), log(), validator-join.sh script

## Knowledge Gaps
- **249 isolated node(s):** `name`, `version`, `private`, `main`, `types` (+244 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 297 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `hardhat` connect `package.json` to `genesis.ts`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `express` connect `app.ts` to `memory.ts`, `backend/package.json`, `routes/validator.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _249 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.051228070175438595 - nodes in this community are weakly interconnected._
- **Should `memory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08163265306122448 - nodes in this community are weakly interconnected._
- **Should `routes/validator.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08461538461538462 - nodes in this community are weakly interconnected._