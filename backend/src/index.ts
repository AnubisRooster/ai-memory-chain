import { createApp, getLanAddresses } from './app';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

app.listen(PORT, HOST, () => {
  const addrs = getLanAddresses();
  console.log(`Backend listening on http://${HOST}:${PORT}`);
  if (addrs.length) {
    console.log(`LAN access: ${addrs.map((a) => `http://${a}:${PORT}`).join(', ')}`);
  }
});
