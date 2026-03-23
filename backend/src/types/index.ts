export type MemoryType = 'note' | 'conversation' | 'code' | 'file' | 'image';

export interface FileAttachment {
  filename: string;
  mimetype: string;
  size: number;
  cid: string;
}

export interface MemoryInput {
  summary: string;
  embedding: number[];
  data: Record<string, unknown>;
  type?: MemoryType;
  tags?: string[];
}

export interface MemoryRecord {
  id: number;
  summary: string;
  timestamp: number;
  ipfsCID: string;
  sha256Hash: string;
  embedding: number[];
  author: string;
}

export interface MemoryListItem {
  id: number;
  summary: string;
  timestamp: number;
}

export interface StoreMemoryResult {
  id: number;
  ipfsCID: string;
  sha256Hash: string;
  timestamp: number;
  txHash: string;
}

export interface IPFSContent {
  summary: string;
  embedding: number[];
  data: Record<string, unknown>;
  type?: MemoryType;
  tags?: string[];
  files?: FileAttachment[];
  storedAt: string;
}

export interface HealthStatus {
  polygon: boolean;
  ipfs: boolean;
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

export interface SearchResultItem {
  id: number;
  summary: string;
  timestamp: number;
  ipfsCID: string;
  sha256Hash: string;
  embedding: number[];
  author: string;
  ipfsContent: IPFSContent | null;
  score?: number;
}
