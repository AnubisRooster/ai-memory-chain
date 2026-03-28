import { Router, Request, Response } from 'express';
import http from 'http';

const IPFS_GATEWAY = process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080';
const PROXY_TIMEOUT_MS = 30_000;
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/;

function isValidCID(cid: string): boolean {
  return CID_PATTERN.test(cid);
}

function proxyIPFS(res: Response, gatewayUrl: string, extraHeaders?: Record<string, string>) {
  const req = http.get(gatewayUrl, { timeout: PROXY_TIMEOUT_MS }, (upstream) => {
    const contentType = upstream.headers['content-type'];
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = upstream.headers['content-length'];
    if (contentLength) res.setHeader('Content-Length', contentLength);

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) {
        res.setHeader(k, v);
      }
    }

    res.status(upstream.statusCode || 200);
    upstream.pipe(res);
    upstream.on('error', () => {
      if (!res.headersSent) res.status(502).json({ error: 'Upstream read error' });
    });
  });
  req.on('timeout', () => {
    req.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'IPFS gateway timeout' });
  });
  req.on('error', (err) => {
    console.error(`IPFS proxy error:`, err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch from IPFS gateway' });
  });
}

const router: ReturnType<typeof Router> = Router();

router.get('/:cid', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!isValidCID(cid)) {
    res.status(400).json({ error: 'Invalid CID format' });
    return;
  }
  proxyIPFS(res, `${IPFS_GATEWAY}/ipfs/${cid}`);
});

router.get('/:cid/:filename', (req: Request, res: Response) => {
  const { cid, filename } = req.params;
  if (!isValidCID(cid)) {
    res.status(400).json({ error: 'Invalid CID format' });
    return;
  }
  const safeName = filename.replace(/["\\]/g, '_');
  proxyIPFS(res, `${IPFS_GATEWAY}/ipfs/${cid}`, {
    'Content-Disposition': `inline; filename="${safeName}"`,
  });
});

export default router;
