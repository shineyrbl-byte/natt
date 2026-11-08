// Minimal BOLT11 encoder used by the simulated wallet, plus a decoder
// wrapper used to check payout invoices (docs/THREAT_MODEL.md, T5).
import { createHash, randomBytes } from 'node:crypto';
import { bech32 } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { decode as decodeRaw } from 'light-bolt11-decoder';

const sha256 = (buf) => createHash('sha256').update(buf).digest();

function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const max = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & max);
  return out;
}

function intToWords(n, minLen = 1) {
  const words = [];
  while (n > 0) {
    words.unshift(n & 31);
    n = Math.floor(n / 32);
  }
  while (words.length < minLen) words.unshift(0);
  return words;
}

function tag(type, words) {
  return [type, ...intToWords(words.length, 2), ...words];
}

// Encode a signed regtest invoice. Returns { bolt11, paymentHash, preimage }.
export function encodeInvoice({ amountSats, description, secretKey, expirySeconds = 3600, network = 'bcrt' }) {
  const preimage = randomBytes(32);
  const paymentHash = sha256(preimage);
  const hrp = `ln${network}${amountSats * 10}n`;
  const timestamp = Math.floor(Date.now() / 1000);

  const data = [
    ...intToWords(timestamp, 7),
    ...tag(1, convertBits(paymentHash, 8, 5, true)),
    ...tag(16, convertBits(randomBytes(32), 8, 5, true)),
    ...tag(13, convertBits(Buffer.from(description, 'utf8'), 8, 5, true)),
    ...tag(6, intToWords(expirySeconds)),
  ];

  const toSign = Buffer.concat([Buffer.from(hrp, 'utf8'), Buffer.from(convertBits(data, 5, 8, true))]);
  const sig = secp256k1.sign(sha256(toSign), secretKey, { prehash: false, format: 'recovered' });
  // noble puts the recovery byte first; BOLT11 wants it last.
  const sigBolt = Buffer.concat([Buffer.from(sig.subarray(1)), Buffer.from([sig[0]])]);
  const words = [...data, ...convertBits(sigBolt, 8, 5, true)];

  return {
    bolt11: bech32.encode(hrp, words, false),
    paymentHash: paymentHash.toString('hex'),
    preimage: preimage.toString('hex'),
  };
}

// Decode any BOLT11 invoice into the few fields Natt needs.
export function decodeInvoice(bolt11) {
  const parsed = decodeRaw(String(bolt11).trim().toLowerCase().replace(/^lightning:/, ''));
  const get = (name) => parsed.sections.find((s) => s.name === name)?.value;
  const msat = get('amount');
  const timestamp = get('timestamp');
  const expiry = get('expiry') ?? 3600;
  return {
    amountSats: msat ? Math.floor(Number(msat) / 1000) : null,
    paymentHash: get('payment_hash'),
    description: get('description') ?? '',
    expiresAt: (timestamp + expiry) * 1000,
  };
}
