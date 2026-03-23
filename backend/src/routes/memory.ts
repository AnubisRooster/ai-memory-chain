import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadJSON, uploadBuffer, fetchJSON, isIPFSOnline } from '../services/ipfs';
import {
  storeMemoryOnChain,
  getMemoryOnChain,
  getMemoryCount,
  getMemorySummaryOnChain,
  isPolygonOnline,
} from '../services/blockchain';
import { computeSHA256 } from '../services/hash';
import { scanMemoryInput, formatThreatReport } from '../services/security';
import { logScan } from '../services/audit-log';
import type {
  MemoryInput,
  MemoryType,
  StoreMemoryResult,
  MemoryRecord,
  MemoryListItem,
  FileAttachment,
} from '../types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const router: ReturnType<typeof Router> = Router();

router.post('/', upload.array('files', 20), async (req: Request, res: Response) => {
  try {
    let summary: string;
    let embedding: number[];
    let data: Record<string, unknown>;
    let memoryType: MemoryType | undefined;
    let tags: string[] | undefined;

    const files = (req.files as Express.Multer.File[]) || [];
    const isMultipart = files.length > 0 || req.is('multipart/form-data');

    if (isMultipart) {
      summary = req.body.summary;
      memoryType = req.body.type as MemoryType | undefined;

      try {
        embedding = JSON.parse(req.body.embedding || '[]');
      } catch {
        embedding = [];
      }

      try {
        data = JSON.parse(req.body.data || '{}');
      } catch {
        data = {};
      }

      if (req.body.tags) {
        try {
          tags = JSON.parse(req.body.tags);
        } catch {
          tags = req.body.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
        }
      }

      if (req.body.content) {
        data.content = req.body.content;
      }
    } else {
      const input: MemoryInput = req.body;
      summary = input.summary;
      embedding = input.embedding;
      data = input.data;
      memoryType = input.type;
      tags = input.tags;
    }

    if (!summary) {
      res.status(400).json({ error: 'Missing required field: summary' });
      return;
    }
    if (!embedding || !Array.isArray(embedding)) {
      embedding = [];
    }
    if (!data || typeof data !== 'object') {
      data = {};
    }

    const securityResult = scanMemoryInput({
      summary,
      data,
      tags,
      type: memoryType,
      content: typeof data?.content === 'string' ? data.content : undefined,
      filenames: files.map((f) => f.originalname),
    });

    logScan(securityResult, {
      sourceIP: req.ip || req.socket.remoteAddress || 'unknown',
      inputSummary: summary || '',
      memoryType: memoryType,
      userAgent: req.get('user-agent'),
      contentType: req.get('content-type'),
    });

    if (!securityResult.safe) {
      res.status(422).json({
        error: 'Input rejected by security scanner',
        threats: securityResult.threats.filter((t) => t.severity === 'critical' || t.severity === 'high'),
        report: formatThreatReport(securityResult),
      });
      return;
    }

    const fileAttachments: FileAttachment[] = [];
    for (const file of files) {
      const cid = await uploadBuffer(file.buffer, file.originalname, file.mimetype);
      fileAttachments.push({
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        cid,
      });
    }

    const ipfsContent = {
      summary,
      embedding,
      data,
      ...(memoryType ? { type: memoryType } : {}),
      ...(tags && tags.length ? { tags } : {}),
      ...(fileAttachments.length ? { files: fileAttachments } : {}),
      storedAt: new Date().toISOString(),
    };

    const ipfsCID = await uploadJSON(ipfsContent);
    const jsonStr = JSON.stringify(ipfsContent);
    const sha256Hash = computeSHA256(jsonStr);

    const { id, txHash, timestamp } = await storeMemoryOnChain(
      summary,
      ipfsCID,
      sha256Hash,
      embedding,
    );

    const result: StoreMemoryResult = { id, ipfsCID, sha256Hash, timestamp, txHash };
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /memory error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/list', async (_req: Request, res: Response) => {
  try {
    const count = await getMemoryCount();
    const items: MemoryListItem[] = [];

    for (let i = 0; i < count; i++) {
      const { summary, timestamp } = await getMemorySummaryOnChain(i);
      items.push({ id: i, summary, timestamp });
    }

    res.json(items);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /memory/list error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/health', async (_req: Request, res: Response) => {
  const [polygon, ipfs] = await Promise.all([isPolygonOnline(), isIPFSOnline()]);
  res.json({ polygon, ipfs });
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 0) {
      res.status(400).json({ error: 'Invalid memory ID' });
      return;
    }

    const onChain = await getMemoryOnChain(id);
    let ipfsContent = null;

    try {
      ipfsContent = await fetchJSON(onChain.ipfsCID);
    } catch (err) {
      console.warn(`Could not fetch IPFS content for CID ${onChain.ipfsCID}:`, err);
    }

    const record: MemoryRecord & { ipfsContent: typeof ipfsContent } = {
      id,
      summary: onChain.summary,
      timestamp: onChain.timestamp,
      ipfsCID: onChain.ipfsCID,
      sha256Hash: onChain.sha256Hash,
      embedding: onChain.embedding,
      author: onChain.author,
      ipfsContent,
    };

    res.json(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`GET /memory/${req.params.id} error:`, message);
    res.status(500).json({ error: message });
  }
});

export default router;
