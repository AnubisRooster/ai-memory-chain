import http from 'http';
import type { IPFSContent } from '../types';

const IPFS_API = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080';

function postMultipart(
  path: string,
  content: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const boundary = '----IPFSBoundary' + Date.now();
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const url = new URL(`/api/v0${path}`, IPFS_API);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length.toString(),
        },
      },
      (res) => {
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
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function ipfsPost(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/v0${path}`, IPFS_API);
    const req = http.request(url, { method: 'POST' }, (res) => {
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
    req.on('error', reject);
    req.end();
  });
}

function httpGet(urlStr: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    }).on('error', reject);
  });
}

export async function uploadJSON(content: IPFSContent): Promise<string> {
  const json = JSON.stringify(content);
  const raw = await postMultipart('/add?pin=true', Buffer.from(json), 'data.json', 'application/json');
  const result = JSON.parse(raw);
  return result.Hash;
}

export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  const raw = await postMultipart('/add?pin=true', buffer, filename, mimetype);
  const result = JSON.parse(raw);
  return result.Hash;
}

export async function fetchJSON(cid: string): Promise<IPFSContent> {
  const buf = await httpGet(`${IPFS_GATEWAY}/ipfs/${cid}`);
  return JSON.parse(buf.toString('utf-8')) as IPFSContent;
}

export async function isIPFSOnline(): Promise<boolean> {
  try {
    await ipfsPost('/id');
    return true;
  } catch {
    return false;
  }
}
