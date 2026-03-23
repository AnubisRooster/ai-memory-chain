import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { MemoryAgent } from '../index';

let server: http.Server;
let port: number;

function createMockBackend(): http.Server {
  return http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'POST' && req.url === '/memory') {
        if (!body?.summary) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing required fields: summary, embedding, data' }));
          return;
        }
        res.writeHead(201);
        res.end(
          JSON.stringify({
            id: 42,
            ipfsCID: 'QmMockCID',
            sha256Hash: '0x' + 'ff'.repeat(32),
            timestamp: 1700000000,
            txHash: '0xmocktx',
          }),
        );
        return;
      }

      if (req.method === 'GET' && req.url === '/memory/list') {
        res.writeHead(200);
        res.end(
          JSON.stringify([
            { id: 0, summary: 'First', timestamp: 1700000000 },
            { id: 1, summary: 'Second', timestamp: 1700000001 },
          ]),
        );
        return;
      }

      if (req.method === 'GET' && req.url === '/memory/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ polygon: true, ipfs: true }));
        return;
      }

      if (req.method === 'GET' && req.url?.match(/^\/memory\/\d+$/)) {
        const id = parseInt(req.url.split('/').pop()!, 10);
        res.writeHead(200);
        res.end(
          JSON.stringify({
            id,
            summary: `Memory ${id}`,
            timestamp: 1700000000,
            ipfsCID: 'QmTestCID',
            sha256Hash: '0x' + 'aa'.repeat(32),
            embedding: [1, -1],
            author: '0x' + '00'.repeat(20),
            ipfsContent: null,
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  });
}

beforeAll(async () => {
  server = createMockBackend();
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('MemoryAgent', () => {
  it('constructs with default backendUrl', () => {
    const agent = new MemoryAgent();
    expect(agent).toBeDefined();
  });

  it('constructs with custom backendUrl', () => {
    const agent = new MemoryAgent({ backendUrl: 'http://example.com:9999' });
    expect(agent).toBeDefined();
  });
});

describe('MemoryAgent.recordMemory', () => {
  it('stores a memory and returns id, cid, timestamp, hash, txHash', async () => {
    const agent = new MemoryAgent({ backendUrl: `http://localhost:${port}` });
    const result = await agent.recordMemory({
      summary: 'Test memory',
      embedding: [0.1, -0.2],
      data: { key: 'value' },
    });

    expect(result.id).toBe(42);
    expect(result.cid).toBe('QmMockCID');
    expect(result.timestamp).toBe(1700000000);
    expect(result.sha256Hash).toMatch(/^0x/);
    expect(result.txHash).toBe('0xmocktx');
  });

  it('throws if summary is empty', async () => {
    const agent = new MemoryAgent({ backendUrl: `http://localhost:${port}` });
    await expect(
      agent.recordMemory({ summary: '', embedding: [1], data: {} }),
    ).rejects.toThrow('summary is required');
  });

  it('throws if embedding is not an array', async () => {
    const agent = new MemoryAgent({ backendUrl: `http://localhost:${port}` });
    await expect(
      agent.recordMemory({ summary: 'test', embedding: null as any, data: {} }),
    ).rejects.toThrow('embedding must be a number array');
  });

  it('throws if data is not an object', async () => {
    const agent = new MemoryAgent({ backendUrl: `http://localhost:${port}` });
    await expect(
      agent.recordMemory({ summary: 'test', embedding: [1], data: null as any }),
    ).rejects.toThrow('data must be an object');
  });
});

describe('MemoryAgent.listMemories', () => {
  it('returns an array of memories', async () => {
    const agent = new MemoryAgent({ backendUrl: `http://localhost:${port}` });
    const list = await agent.listMemories();
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveProperty('id', 0);
    expect(list[0]).toHaveProperty('summary', 'First');
  });
});

describe('MemoryAgent.getMemory', () => {
  it('returns a memory by ID', async () => {
    const agent = new MemoryAgent({ backendUrl: `http://localhost:${port}` });
    const mem = await agent.getMemory(5);
    expect(mem).toHaveProperty('id', 5);
    expect(mem).toHaveProperty('summary', 'Memory 5');
  });
});

describe('MemoryAgent.health', () => {
  it('returns polygon and ipfs status', async () => {
    const agent = new MemoryAgent({ backendUrl: `http://localhost:${port}` });
    const h = await agent.health();
    expect(h).toEqual({ polygon: true, ipfs: true });
  });
});
