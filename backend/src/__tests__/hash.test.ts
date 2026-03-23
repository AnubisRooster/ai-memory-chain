import { describe, it, expect } from 'vitest';
import { computeSHA256 } from '../services/hash';

describe('computeSHA256', () => {
  it('returns a 0x-prefixed 64-char hex string', () => {
    const result = computeSHA256('hello');
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('produces the known SHA-256 of "hello"', () => {
    const result = computeSHA256('hello');
    expect(result).toBe('0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('produces different hashes for different inputs', () => {
    const a = computeSHA256('alpha');
    const b = computeSHA256('beta');
    expect(a).not.toBe(b);
  });

  it('handles empty string', () => {
    const result = computeSHA256('');
    expect(result).toBe('0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('handles Buffer input', () => {
    const result = computeSHA256(Buffer.from('hello'));
    expect(result).toBe('0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('is deterministic', () => {
    const json = JSON.stringify({ summary: 'test', embedding: [1, 2, 3], data: {} });
    const a = computeSHA256(json);
    const b = computeSHA256(json);
    expect(a).toBe(b);
  });
});
