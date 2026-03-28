import { createApp, getLanAddresses } from './app';
import { closeDB } from './services/audit-log';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  const addrs = getLanAddresses();
  console.log(`Backend listening on http://${HOST}:${PORT}`);
  if (addrs.length) {
    console.log(`LAN access: ${addrs.map((a) => `http://${a}:${PORT}`).join(', ')}`);
  }
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down gracefully...`);

  server.close(() => {
    console.log('HTTP server closed.');
    try {
      closeDB();
      console.log('Database closed.');
    } catch { /* already closed */ }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
