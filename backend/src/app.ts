import express, { Express } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import os from 'os';
import memoryRouter from './routes/memory';
import searchRouter from './routes/search';
import auditRouter from './routes/audit';
import ipfsProxyRouter from './routes/ipfs-proxy';
import validatorRouter from './routes/validator';
import { getHealthState } from './services/health-monitor';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }
  app.use(express.json({ limit: '10mb' }));

  app.use('/memory', memoryRouter);
  app.use('/search', searchRouter);
  app.use('/security', auditRouter);
  app.use('/ipfs', ipfsProxyRouter);
  app.use('/validator', validatorRouter);

  app.get('/health', (_req, res) => {
    const monitor = getHealthState();
    const degraded = !monitor.polygon || !monitor.ipfs;
    res.json({
      status: degraded ? 'degraded' : 'ok',
      service: 'ai-memory-backend',
      infrastructure: {
        polygon: monitor.polygon,
        ipfs: monitor.ipfs,
        polygonPeers: monitor.polygonPeers,
        blockNumber: monitor.lastBlockNumber,
        blockStaleSeconds: monitor.blockStaleSeconds,
      },
      uptime: monitor.uptimeSeconds,
      checksRun: monitor.checksRun,
    });
  });

  app.get('/connect', (_req, res) => {
    const addresses = getLanAddresses();
    const PORT = parseInt(process.env.PORT || '3001', 10);
    res.json({
      frontend: addresses.map((ip) => `http://${ip}:3000`),
      backend: addresses.map((ip) => `http://${ip}:${PORT}`),
      hostname: os.hostname(),
      addresses,
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}

export function getLanAddresses(): string[] {
  try {
    const interfaces = os.networkInterfaces();
    const addrs: string[] = [];
    for (const nets of Object.values(interfaces)) {
      if (!nets) continue;
      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          addrs.push(net.address);
        }
      }
    }
    return addrs;
  } catch {
    return [];
  }
}
