# Graph Report - ai-memory-chain  (2026-10-05)

## Corpus Check
- 79 files · ~119,306 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .jsonl 1, .css 1)

## Summary
- 574 nodes · 879 edges · 37 communities (27 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- api.ts
- memory.ts
- package.json
- routes/validator.ts
- frontend/package.json
- scripts
- agent-sdk/package.json
- compilerOptions
- self-heal.sh
- MemoryAgent
- backend/package.json
- compilerOptions
- compilerOptions
- compilerOptions
- health-monitor.ts
- audit-log.ts
- security.ts
- watchdog.sh
- devDependencies
- e2e.test.ts
- discovery.sh
- app.ts
- startup.sh
- dependencies
- scripts
- edge-entrypoint.sh
- validator-join.sh
- next.config.js
- install-service.sh
- shutdown.sh
- validator-exit.sh
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
10. `MemoryDetail()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `runCheck()` --calls--> `getProvider()`  [EXTRACTED]
  backend/src/services/health-monitor.ts → backend/src/services/blockchain.ts
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

## Communities (37 total, 10 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.06
Nodes (62): Home(), BlockchainExplorer(), BlockchainExplorerProps, formatTime(), MEMORY_TYPES, ResultCard(), TabId, truncate() (+54 more)

### Community 1 - "memory.ts"
Cohesion: 0.07
Nodes (40): upload, deepSearchObject(), router, ABI, getContract(), getContractAddress(), getMemoryCount(), getMemoryOnChain() (+32 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (40): config, dependencies, ethers, description, devDependencies, concurrently, eslint, hardhat (+32 more)

### Community 3 - "routes/validator.ts"
Cohesion: 0.08
Nodes (24): getKnownPeerApis(), PEERS_PATH, readPeersConfig(), router, getProvider(), CandidateInfo, getCandidates(), getConnectedPeers() (+16 more)

### Community 4 - "frontend/package.json"
Cohesion: 0.06
Nodes (30): dependencies, next, react, react-dom, devDependencies, autoprefixer, postcss, tailwindcss (+22 more)

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
Nodes (4): AgentSDKOptions, MemoryAgent, RecordMemoryInput, RecordMemoryResult

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

### Community 14 - "health-monitor.ts"
Cohesion: 0.19
Nodes (13): getLanAddresses(), app, PORT, server, shutdown(), closeDB(), HealthState, runCheck() (+5 more)

### Community 16 - "audit-log.ts"
Cohesion: 0.29
Nodes (11): router, AuditEntry, AuditQuery, AuditStats, getAuditStats(), getDB(), logScan(), queryAuditLog() (+3 more)

### Community 17 - "security.ts"
Cohesion: 0.20
Nodes (12): ALL_PATTERNS, ENCODING_PATTERNS, formatThreatReport(), INJECTION_PATTERNS, MAX_FIELD_LENGTHS, PatternRule, PROMPT_INJECTION_PATTERNS, scanDataObject() (+4 more)

### Community 18 - "watchdog.sh"
Cohesion: 0.32
Nodes (12): cleanup(), clear_strike(), get_strike(), init_strikes(), is_project_process(), log(), prune_dead_strikes(), rotate_log() (+4 more)

### Community 19 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, supertest, ts-node-dev, @types/better-sqlite3, @types/cors, @types/express, @types/morgan, @types/multer (+4 more)

### Community 20 - "e2e.test.ts"
Cohesion: 0.24
Nodes (7): createApp(), getHealthState(), app, ipfsStore, memoryStore, app, supertest

### Community 21 - "discovery.sh"
Cohesion: 0.42
Nodes (9): advertise_loop(), discover_once(), get_bootnode_multiaddr(), get_broadcast_addr(), get_lan_ip(), log(), discovery.sh script, show_status() (+1 more)

### Community 22 - "app.ts"
Cohesion: 0.28
Nodes (5): router, router, cors, express, morgan

### Community 23 - "startup.sh"
Cohesion: 0.39
Nodes (8): cleanup(), CONTRACT_ADDRESS, DEPLOYER_PRIVATE_KEY, log(), PATH, rotate_log(), startup.sh script, wait_for_url()

### Community 24 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, better-sqlite3, cors, ethers, express, morgan, multer

### Community 25 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

### Community 26 - "edge-entrypoint.sh"
Cohesion: 0.70
Nodes (4): founder_mode(), init_secrets(), joiner_mode(), edge-entrypoint.sh script

### Community 27 - "validator-join.sh"
Cohesion: 0.83
Nodes (3): get_lan_ip(), log(), validator-join.sh script

## Knowledge Gaps
- **249 isolated node(s):** `name`, `version`, `private`, `main`, `types` (+244 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 292 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `hardhat` connect `package.json` to `routes/validator.ts`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _249 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.056140350877192984 - nodes in this community are weakly interconnected._
- **Why does `express` connect `app.ts` to `audit-log.ts`, `memory.ts`, `backend/package.json`, `routes/validator.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `memory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.046464646464646465 - nodes in this community are weakly interconnected._