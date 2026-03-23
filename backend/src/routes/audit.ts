import { Router, Request, Response } from 'express';
import { queryAuditLog, getAuditStats } from '../services/audit-log';
import type { AuditQuery } from '../services/audit-log';

const router: ReturnType<typeof Router> = Router();

router.get('/audit', (req: Request, res: Response) => {
  try {
    const query: AuditQuery = {};

    if (req.query.safe !== undefined) {
      query.safe = req.query.safe === 'true';
    }
    if (req.query.threatType) {
      query.threatType = req.query.threatType as string;
    }
    if (req.query.from) {
      query.from = req.query.from as string;
    }
    if (req.query.to) {
      query.to = req.query.to as string;
    }
    if (req.query.limit) {
      query.limit = parseInt(req.query.limit as string, 10);
    }
    if (req.query.offset) {
      query.offset = parseInt(req.query.offset as string, 10);
    }

    const result = queryAuditLog(query);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /security/audit error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/audit/stats', (_req: Request, res: Response) => {
  try {
    const stats = getAuditStats();
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /security/audit/stats error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
