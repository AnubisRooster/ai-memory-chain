import http from 'http';
import https from 'https';

export interface RecordMemoryInput {
  summary: string;
  embedding: number[];
  data: Record<string, unknown>;
}

export interface RecordMemoryResult {
  id: number;
  cid: string;
  timestamp: number;
  sha256Hash: string;
  txHash: string;
}

export interface AgentSDKOptions {
  backendUrl?: string;
}

export class MemoryAgent {
  private backendUrl: string;

  constructor(opts?: AgentSDKOptions) {
    this.backendUrl = opts?.backendUrl || 'http://localhost:3001';
  }

  async recordMemory(input: RecordMemoryInput): Promise<RecordMemoryResult> {
    if (!input.summary) throw new Error('summary is required');
    if (!input.embedding || !Array.isArray(input.embedding)) {
      throw new Error('embedding must be a number array');
    }
    if (!input.data || typeof input.data !== 'object') {
      throw new Error('data must be an object');
    }

    const body = JSON.stringify({
      summary: input.summary,
      embedding: input.embedding,
      data: input.data,
    });

    const result = await this.post('/memory', body);

    return {
      id: result.id,
      cid: result.ipfsCID,
      timestamp: result.timestamp,
      sha256Hash: result.sha256Hash,
      txHash: result.txHash,
    };
  }

  async getMemory(id: number): Promise<Record<string, unknown>> {
    return this.get(`/memory/${id}`);
  }

  async listMemories(): Promise<Array<{ id: number; summary: string; timestamp: number }>> {
    return this.get('/memory/list');
  }

  async health(): Promise<{ polygon: boolean; ipfs: boolean }> {
    return this.get('/memory/health');
  }

  private post(path: string, body: string): Promise<Record<string, unknown>> {
    return this.request('POST', path, body);
  }

  private get(path: string): Promise<Record<string, unknown>> {
    return this.request('GET', path);
  }

  private request(method: string, urlPath: string, body?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.backendUrl);
      const transport = url.protocol === 'https:' ? https : http;

      const req = transport.request(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            try {
              const json = JSON.parse(raw);
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(json.error || `HTTP ${res.statusCode}`));
              } else {
                resolve(json);
              }
            } catch {
              reject(new Error(`Invalid JSON response: ${raw.slice(0, 200)}`));
            }
          });
        },
      );

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
}

export default MemoryAgent;

if (require.main === module) {
  (async () => {
    const agent = new MemoryAgent();
    console.log('Agent SDK ready. Backend:', agent['backendUrl']);

    try {
      const health = await agent.health();
      console.log('Health:', health);
    } catch (err) {
      console.error('Health check failed (backend may not be running):', err);
    }
  })();
}
