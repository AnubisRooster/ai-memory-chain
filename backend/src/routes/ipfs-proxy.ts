import { Router, Request, Response } from 'express';
import http from 'http';

const IPFS_GATEWAY = process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080';

const router: ReturnType<typeof Router> = Router();

router.get('/:cid', (req: Request, res: Response) => {
  const { cid } = req.params;
  const url = `${IPFS_GATEWAY}/ipfs/${cid}`;

  http
    .get(url, (upstream) => {
      const contentType = upstream.headers['content-type'];
      if (contentType) res.setHeader('Content-Type', contentType);

      const contentLength = upstream.headers['content-length'];
      if (contentLength) res.setHeader('Content-Length', contentLength);

      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      res.status(upstream.statusCode || 200);
      upstream.pipe(res);
    })
    .on('error', (err) => {
      console.error(`IPFS proxy error for ${cid}:`, err.message);
      res.status(502).json({ error: 'Failed to fetch from IPFS gateway' });
    });
});

router.get('/:cid/:filename', (req: Request, res: Response) => {
  const { cid, filename } = req.params;
  const url = `${IPFS_GATEWAY}/ipfs/${cid}`;

  http
    .get(url, (upstream) => {
      const contentType = upstream.headers['content-type'];
      if (contentType) res.setHeader('Content-Type', contentType);

      const contentLength = upstream.headers['content-length'];
      if (contentLength) res.setHeader('Content-Length', contentLength);

      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      res.status(upstream.statusCode || 200);
      upstream.pipe(res);
    })
    .on('error', (err) => {
      console.error(`IPFS proxy error for ${cid}/${filename}:`, err.message);
      res.status(502).json({ error: 'Failed to fetch from IPFS gateway' });
    });
});

export default router;
