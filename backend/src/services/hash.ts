import { createHash } from 'crypto';

export function computeSHA256(data: string | Buffer): string {
  const hash = createHash('sha256');
  hash.update(typeof data === 'string' ? data : data);
  return '0x' + hash.digest('hex');
}
