import http from 'http';
import type { IPFSContent } from '../types';

const IPFS_API = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB safety cap

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

function postMultipart(
  path: string,
  content: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const boundary = '----IPFSBoundary' + Date.now();
    const safeName = filename.replace(/"/g, '\\"');
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const url = new URL(`/api/v0${path}`, IPFS_API);
    const req = http.request(
      url,
      {
        method: 'POST',
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length.toString(),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        res.on('data', (c: Buffer) => {
          totalBytes += c.length;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            req.destroy(new Error('IPFS response exceeded size limit'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`IPFS API error ${res.statusCode}: ${raw}`));
            return;
          }
          resolve(raw);
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error(`IPFS request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function ipfsPost(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/v0${path}`, IPFS_API);
    const req = http.request(url, { method: 'POST', timeout: REQUEST_TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`IPFS API error ${res.statusCode}: ${raw}`));
          return;
        }
        resolve(raw);
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`IPFS request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpGet(urlStr: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = http.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      res.on('data', (c: Buffer) => {
        totalBytes += c.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('Response exceeded size limit'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`HTTP GET timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.on('error', reject);
  });
}

export async function uploadJSON(content: IPFSContent): Promise<string> {
  const json = JSON.stringify(content);
  return withRetry(async () => {
    const raw = await postMultipart('/add?pin=true', Buffer.from(json), 'data.json', 'application/json');
    const result = JSON.parse(raw);
    return result.Hash;
  });
}

export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  return withRetry(async () => {
    const raw = await postMultipart('/add?pin=true', buffer, filename, mimetype);
    const result = JSON.parse(raw);
    return result.Hash;
  });
}

export async function fetchJSON(cid: string): Promise<IPFSContent> {
  return withRetry(async () => {
    const buf = await httpGet(`${IPFS_GATEWAY}/ipfs/${cid}`);
    return JSON.parse(buf.toString('utf-8')) as IPFSContent;
  });
}

export async function isIPFSOnline(): Promise<boolean> {
  try {
    await ipfsPost('/id');
    return true;
  } catch {
    return false;
  }
}
