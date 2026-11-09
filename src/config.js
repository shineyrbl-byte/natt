// All settings come from environment variables so secrets never live in code.

import { join, dirname } from 'node:path';

// Where the seeded demo's member links are saved (public demo only).
export const demoLinksPath = (config) => join(config.dbPath === ':memory:' ? 'data' : dirname(config.dbPath), 'demo-links.json');

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`${name} must be an integer`);
  return n;
}

export function loadConfig(env = process.env) {
  const lightningBackend = env.LIGHTNING_BACKEND || 'simulated';
  if (!['simulated', 'lnbits'].includes(lightningBackend)) {
    throw new Error('LIGHTNING_BACKEND must be "simulated" or "lnbits"');
  }
  if (lightningBackend === 'lnbits' && (!env.LNBITS_URL || !env.LNBITS_INVOICE_KEY || !env.LNBITS_ADMIN_KEY)) {
    throw new Error('LNBITS_URL, LNBITS_INVOICE_KEY and LNBITS_ADMIN_KEY are required for the lnbits backend');
  }

  return Object.freeze({
    port: int('PORT', 3000),
    dbPath: env.DB_PATH || 'data/natt.db',
    lightningBackend,
    lnbits: {
      url: (env.LNBITS_URL || '').replace(/\/+$/, ''),
      invoiceKey: env.LNBITS_INVOICE_KEY || '',
      adminKey: env.LNBITS_ADMIN_KEY || '',
    },
    nostrRelays: (env.NOSTR_RELAYS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Display-only exchange rate. Amounts are always stored in sats.
    // XOF_PER_SAT is the fallback when the live price can't be fetched.
    xofPerSat: Number(env.XOF_PER_SAT || '0.55'),
    liveRate: (env.LIVE_RATE ?? (env.NODE_ENV === 'test' ? '0' : '1')) === '1',
    // Public demo: show "Try the demo" member buttons on the home page.
    // Only takes effect with the simulated wallet (no real money).
    publicDemo: env.PUBLIC_DEMO === '1',
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 120),
  });
}
