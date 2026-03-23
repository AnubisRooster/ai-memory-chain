const API_BASE = '/api';

export type MemoryType = 'note' | 'conversation' | 'code' | 'file' | 'image';

export interface MemoryListItem {
  id: number;
  summary: string;
  timestamp: number;
}

export interface FileAttachment {
  filename: string;
  mimetype: string;
  size: number;
  cid: string;
}

export interface MemoryDetail {
  id: number;
  summary: string;
  timestamp: number;
  ipfsCID: string;
  sha256Hash: string;
  embedding: number[];
  author: string;
  ipfsContent: {
    summary: string;
    embedding: number[];
    data: Record<string, unknown>;
    type?: MemoryType;
    tags?: string[];
    files?: FileAttachment[];
    storedAt: string;
  } | null;
}

export interface HealthStatus {
  polygon: boolean;
  ipfs: boolean;
}

export interface CreateMemoryInput {
  summary: string;
  type: MemoryType;
  content: string;
  embedding: string;
  tags: string;
  data: string;
  files: File[];
}

export interface CreateMemoryResult {
  id: number;
  ipfsCID: string;
  sha256Hash: string;
  timestamp: number;
  txHash: string;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function listMemories(): Promise<MemoryListItem[]> {
  return fetchJSON('/memory/list');
}

export function getMemory(id: number): Promise<MemoryDetail> {
  return fetchJSON(`/memory/${id}`);
}

export function getHealth(): Promise<HealthStatus> {
  return fetchJSON('/memory/health');
}

export interface ConnectInfo {
  frontend: string[];
  backend: string[];
  hostname: string;
  addresses: string[];
}

export function getConnectInfo(): Promise<ConnectInfo> {
  return fetchJSON('/connect');
}

export interface SearchQuery {
  q?: string;
  type?: MemoryType;
  tags?: string[];
  author?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  embedding?: number[];
  topK?: number;
}

export interface SearchResult {
  results: (MemoryDetail & { score?: number })[];
  total: number;
}

export async function searchMemories(query: SearchQuery): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.type) params.set('type', query.type);
  if (query.tags && query.tags.length) params.set('tags', query.tags.join(','));
  if (query.author) params.set('author', query.author);
  if (query.fromTimestamp) params.set('from', String(query.fromTimestamp));
  if (query.toTimestamp) params.set('to', String(query.toTimestamp));
  if (query.embedding && query.embedding.length) params.set('embedding', JSON.stringify(query.embedding));
  if (query.topK) params.set('topK', String(query.topK));
  return fetchJSON(`/search?${params.toString()}`);
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  sourceIP: string;
  inputSummary: string;
  memoryType: string | null;
  safe: boolean;
  threatCount: number;
  threats: { field: string; type: string; severity: string; description: string; matchedPattern?: string }[];
  action: 'allowed' | 'blocked';
  requestMeta: Record<string, string>;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
}

export interface AuditStats {
  totalScans: number;
  totalBlocked: number;
  totalAllowed: number;
  blockRate: number;
  threatBreakdown: Record<string, number>;
  recentBlockRate: { period: string; blocked: number; total: number; rate: number }[];
}

export interface AuditQuery {
  safe?: boolean;
  threatType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function getSecurityAudit(query: AuditQuery = {}): Promise<AuditLogResponse> {
  const params = new URLSearchParams();
  if (query.safe !== undefined) params.set('safe', String(query.safe));
  if (query.threatType) params.set('threatType', query.threatType);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));
  const qs = params.toString();
  return fetchJSON(`/security/audit${qs ? `?${qs}` : ''}`);
}

export function getSecurityStats(): Promise<AuditStats> {
  return fetchJSON('/security/audit/stats');
}

export async function createMemory(input: CreateMemoryInput): Promise<CreateMemoryResult> {
  const form = new FormData();
  form.append('summary', input.summary);
  form.append('type', input.type);

  if (input.content) {
    form.append('content', input.content);
  }

  const embeddingStr = input.embedding.trim();
  if (embeddingStr) {
    const parsed = embeddingStr.startsWith('[') ? embeddingStr : `[${embeddingStr}]`;
    form.append('embedding', parsed);
  } else {
    form.append('embedding', '[]');
  }

  if (input.tags.trim()) {
    const tagsArr = input.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    form.append('tags', JSON.stringify(tagsArr));
  }

  if (input.data.trim()) {
    form.append('data', input.data);
  } else {
    form.append('data', '{}');
  }

  for (const file of input.files) {
    form.append('files', file);
  }

  const res = await fetch(`${API_BASE}/memory`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}
