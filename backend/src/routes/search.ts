import { Router, Request, Response } from 'express';
import {
  getMemoryOnChain,
  getMemoryCount,
} from '../services/blockchain';
import { fetchJSON } from '../services/ipfs';
import type { SearchQuery, SearchResultItem, IPFSContent } from '../types';

const router: ReturnType<typeof Router> = Router();

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const minLen = Math.min(a.length, b.length);
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < minLen; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function textMatches(text: string | undefined, query: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => lower.includes(term));
}

function deepSearchObject(obj: unknown, query: string): boolean {
  if (!obj) return false;
  if (typeof obj === 'string') return obj.toLowerCase().includes(query.toLowerCase());
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj).includes(query);
  if (Array.isArray(obj)) return obj.some((item) => deepSearchObject(item, query));
  if (typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).some(
      ([key, val]) => key.toLowerCase().includes(query.toLowerCase()) || deepSearchObject(val, query),
    );
  }
  return false;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const query: SearchQuery = {
      q: req.query.q as string | undefined,
      type: req.query.type as SearchQuery['type'],
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      author: req.query.author as string | undefined,
      fromTimestamp: req.query.from ? parseInt(req.query.from as string, 10) : undefined,
      toTimestamp: req.query.to ? parseInt(req.query.to as string, 10) : undefined,
      topK: req.query.topK ? parseInt(req.query.topK as string, 10) : undefined,
    };

    if (req.query.embedding) {
      try {
        query.embedding = JSON.parse(req.query.embedding as string);
      } catch {
        res.status(400).json({ error: 'Invalid embedding format — expected JSON array of numbers' });
        return;
      }
    }

    const count = await getMemoryCount();
    if (count === 0) {
      res.json({ results: [], total: 0 });
      return;
    }

    const hasTextQuery = !!query.q;
    const hasEmbedding = query.embedding && query.embedding.length > 0;
    const hasFilters = query.type || query.tags || query.author || query.fromTimestamp || query.toTimestamp;
    const needsIpfs = hasTextQuery || !!query.type || !!query.tags;

    const allItems: SearchResultItem[] = [];

    for (let i = 0; i < count; i++) {
      const onChain = await getMemoryOnChain(i);

      if (query.author && onChain.author.toLowerCase() !== query.author.toLowerCase()) continue;
      if (query.fromTimestamp && onChain.timestamp < query.fromTimestamp) continue;
      if (query.toTimestamp && onChain.timestamp > query.toTimestamp) continue;

      let ipfsContent: IPFSContent | null = null;
      if (needsIpfs) {
        try {
          ipfsContent = await fetchJSON(onChain.ipfsCID);
        } catch {
          ipfsContent = null;
        }
      }

      if (query.type && ipfsContent?.type !== query.type) continue;

      if (query.tags && query.tags.length > 0) {
        const memTags = ipfsContent?.tags || [];
        const hasAllTags = query.tags.every((t) =>
          memTags.some((mt) => mt.toLowerCase() === t.toLowerCase()),
        );
        if (!hasAllTags) continue;
      }

      if (hasTextQuery && query.q) {
        const matchesSummary = textMatches(onChain.summary, query.q);
        const matchesContent =
          ipfsContent?.data && typeof ipfsContent.data === 'object' && 'content' in ipfsContent.data
            ? textMatches(String(ipfsContent.data.content), query.q)
            : false;
        const matchesTags = ipfsContent?.tags?.some((t) =>
          t.toLowerCase().includes(query.q!.toLowerCase()),
        );
        const matchesData = ipfsContent?.data ? deepSearchObject(ipfsContent.data, query.q) : false;

        if (!matchesSummary && !matchesContent && !matchesTags && !matchesData) continue;
      }

      let score: number | undefined;
      if (hasEmbedding) {
        score = cosineSimilarity(query.embedding!, onChain.embedding);
      }

      allItems.push({
        id: i,
        summary: onChain.summary,
        timestamp: onChain.timestamp,
        ipfsCID: onChain.ipfsCID,
        sha256Hash: onChain.sha256Hash,
        embedding: onChain.embedding,
        author: onChain.author,
        ipfsContent: ipfsContent ?? (needsIpfs ? null : null),
        score,
      });
    }

    if (hasEmbedding) {
      allItems.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else {
      allItems.sort((a, b) => b.timestamp - a.timestamp);
    }

    const topK = query.topK || 50;
    const results = allItems.slice(0, topK);

    if (!needsIpfs) {
      for (const item of results) {
        if (!item.ipfsContent) {
          try {
            item.ipfsContent = await fetchJSON(item.ipfsCID);
          } catch {
            item.ipfsContent = null;
          }
        }
      }
    }

    res.json({ results, total: allItems.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /search error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
