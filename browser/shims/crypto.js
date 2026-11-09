// Browser stand-in for the parts of node:crypto that Natt uses.
// Randomness comes from the Web Crypto API; hashes from @noble/hashes.
import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';

const bytes = (data) => (typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data));

export function randomBytes(n) {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n)));
}

export const randomUUID = () => globalThis.crypto.randomUUID();

// Uniform integer in [0, max), without modulo bias.
export function randomInt(max) {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same length');
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hasher(fn) {
  const parts = [];
  return {
    update(data) {
      parts.push(bytes(data));
      return this;
    },
    digest(enc) {
      const out = Buffer.from(fn(Buffer.concat(parts)));
      return enc ? out.toString(enc) : out;
    },
  };
}

export function createHash(alg) {
  if (alg !== 'sha256') throw new Error(`Unsupported hash: ${alg}`);
  return hasher((data) => sha256(data));
}

export function createHmac(alg, key) {
  if (alg !== 'sha256') throw new Error(`Unsupported hmac: ${alg}`);
  return hasher((data) => hmac(sha256, bytes(key), data));
}
