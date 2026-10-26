# Graph Report - ai-memory-chain  (2026-10-26)

## Corpus Check
- 79 files · ~89,067 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .jsonl 1, .css 1)

## Summary
- 610 nodes · 958 edges · 33 communities (23 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- api.ts
- app.ts
- memory.ts
- package.json
- backend/package.json
- frontend/package.json
- security.ts
- polygon-edge
- scripts
- agent-sdk/package.json
- compilerOptions
- self-heal.sh
- MemoryAgent
- compilerOptions
- compilerOptions
- compilerOptions
- genesis.ts
- allowBuilds
- watchdog.sh
- discovery.sh
- startup.sh
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
8. `allowBuilds` - 11 edges
9. `watchdog.sh script` - 11 edges
10. `MemoryAgent` - 10 edges

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

## Communities (33 total, 10 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.06
Nodes (62): Home(), BlockchainExplorer(), BlockchainExplorerProps, formatTime(), MEMORY_TYPES, ResultCard(), TabId, truncate() (+54 more)

### Community 1 - "app.ts"
Cohesion: 0.06
Nodes (49): express@^4.19.0, createApp(), getLanAddresses(), app, PORT, server, shutdown(), router (+41 more)

### Community 2 - "memory.ts"
Cohesion: 0.08
Nodes (39): upload, deepSearchObject(), router, ABI, getContract(), getContractAddress(), getMemoryCount(), getMemoryOnChain() (+31 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (40): config, dependencies, ethers@^6.11.0, description, devDependencies, concurrently@^8.2.0, eslint@^8.57.0, hardhat@^2.22.0 (+32 more)

### Community 4 - "backend/package.json"
Cohesion: 0.07
Nodes (41): dependencies, better-sqlite3@^12.8.0, cors@^2.8.5, ethers@^6.11.0, morgan@^1.10.0, multer@^2.1.1, devDependencies, ts-node-dev@^2.0.0 (+33 more)

### Community 5 - "frontend/package.json"
Cohesion: 0.07
Nodes (30): dependencies, next@^14.2.0, react@^18.3.0, react-dom@^18.3.0, devDependencies, autoprefixer@^10.4.0, postcss@^8.4.0, tailwindcss@^3.4.0 (+22 more)

### Community 6 - "security.ts"
Cohesion: 0.09
Nodes (19): supertest@^7.2.2, computeSHA256(), ALL_PATTERNS, ENCODING_PATTERNS, formatThreatReport(), INJECTION_PATTERNS, MAX_FIELD_LENGTHS, PatternRule (+11 more)

### Community 7 - "polygon-edge"
Cohesion: 0.10
Nodes (22): interval, retries, test, timeout, container_name, environment, healthcheck, image (+14 more)

### Community 8 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, build, compile, deploy, dev, dev:backend, dev:frontend, format (+15 more)

### Community 9 - "agent-sdk/package.json"
Cohesion: 0.12
Nodes (19): devDependencies, ts-node@^10.9.0, @types/node@^20.11.0, typescript@^5.4.0, vitest@^4.1.0, ts-node, @types/node, typescript (+11 more)

### Community 10 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 11 - "self-heal.sh"
Cohesion: 0.29
Nodes (18): cleanup(), log(), now_epoch(), rotate_log(), run_tasks(), self-heal.sh script, should_run(), show_status() (+10 more)

### Community 12 - "MemoryAgent"
Cohesion: 0.18
Nodes (4): AgentSDKOptions, MemoryAgent, RecordMemoryInput, RecordMemoryResult

### Community 13 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir (+8 more)

### Community 14 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule (+7 more)

### Community 15 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule (+7 more)

### Community 17 - "genesis.ts"
Cohesion: 0.18
Nodes (5): DATA_DIR, GENESIS_PATH, main(), NODE_DIR, run()

### Community 18 - "allowBuilds"
Cohesion: 0.15
Nodes (12): allowBuilds, 1, 2, 5, 6, a, c, e (+4 more)

### Community 19 - "watchdog.sh"
Cohesion: 0.32
Nodes (12): cleanup(), clear_strike(), get_strike(), init_strikes(), is_project_process(), log(), prune_dead_strikes(), rotate_log() (+4 more)

### Community 20 - "discovery.sh"
Cohesion: 0.42
Nodes (9): advertise_loop(), discover_once(), get_bootnode_multiaddr(), get_broadcast_addr(), get_lan_ip(), log(), discovery.sh script, show_status() (+1 more)

### Community 21 - "startup.sh"
Cohesion: 0.39
Nodes (8): cleanup(), CONTRACT_ADDRESS, DEPLOYER_PRIVATE_KEY, log(), PATH, rotate_log(), startup.sh script, wait_for_url()

### Community 22 - "edge-entrypoint.sh"
Cohesion: 0.70
Nodes (4): founder_mode(), init_secrets(), joiner_mode(), edge-entrypoint.sh script

### Community 23 - "validator-join.sh"
Cohesion: 0.83
Nodes (3): get_lan_ip(), log(), validator-join.sh script

## Knowledge Gaps
- **3 isolated node(s):** `PATH`, `CONTRACT_ADDRESS`, `DEPLOYER_PRIVATE_KEY`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 239 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `hardhat` connect `package.json` to `genesis.ts`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **What connects `PATH`, `CONTRACT_ADDRESS`, `DEPLOYER_PRIVATE_KEY` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.056140350877192984 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.061343204653622425 - nodes in this community are weakly interconnected._
- **Why does `express` connect `app.ts` to `memory.ts`, `backend/package.json`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Should `memory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08081632653061224 - nodes in this community are weakly interconnected._