// Browser-only demo for static hosting (GitHub Pages).
//
// Runs Natt's real tontine, wallet and Nostr ledger code inside the page,
// with SQLite compiled to WebAssembly. The web app talks to it through
// window.nattLocalApi instead of HTTP. The demo wallet is used, so no real
// bitcoin moves. Each visitor gets their own demo group, saved in this
// browser only.
import initSqlJs from 'sql.js'; // browser build (sql-wasm-browser.js)
import { setSqlJs } from './shims/sqlite.js';
import { openDb } from '../src/db.js';
import { createSimulatedWallet } from '../src/lightning/simulated.js';
import { createLedger, verifyLedger } from '../src/nostr.js';
import { createTontine } from '../src/tontine.js';
import { builtInAnswer } from '../src/answers.js';
import { validate } from '../src/validate.js';
import { AppError, badRequest, notFound } from '../src/errors.js';
import { createRate } from '../src/rate.js';
import { GROUP_ID, createSchema, joinSchema, payoutSchema, askSchema, devPaySchema, devInvoiceSchema } from '../src/schemas.js';
import { seedDemo } from '../scripts/seed.js';

const KEYS = { db: 'natt-demo-db', secret: 'natt-demo-secret', demo: 'natt-demo-links' };
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode or full: the demo still works until the page closes */
    }
  },
};

const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function newSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function boot() {
  const SQL = await initSqlJs({ locateFile: () => new URL('sql-wasm.wasm', document.baseURI).href });

  let saved = store.get(KEYS.db);
  let secret = store.get(KEYS.secret);
  if (!secret) saved = null; // a database without its signing secret can't be verified
  let db;
  try {
    setSqlJs(SQL, saved ? fromB64(saved) : null);
    db = openDb(':memory:');
  } catch {
    setSqlJs(SQL, null); // corrupted save: start over
    saved = null;
    db = openDb(':memory:');
  }
  if (!saved) secret = newSecret();
  store.set(KEYS.secret, secret);

  const wallet = createSimulatedWallet({ db });
  const ledger = createLedger({ db, masterSecret: secret, relays: [] });
  const tontine = createTontine({ db, wallet, ledger });
  const rate = createRate({ fallback: 0.55, live: true });
  // Live FCFA rate from mempool.space. Wait briefly so the first screen
  // shows it; offline, carry on with the 0.55 fallback.
  await Promise.race([rate.start(), new Promise((r) => setTimeout(r, 2500))]);

  const save = () => {
    store.set(KEYS.db, toB64(db.export()));
    db.exec('PRAGMA foreign_keys = ON;'); // export() resets pragmas
  };

  if (!saved) {
    const demo = await seedDemo({ tontine, wallet, baseUrl: location.href.split('#')[0].replace(/\/$/, '') });
    store.set(KEYS.demo, JSON.stringify(demo));
    save();
  }

  return { db, wallet, ledger, tontine, rate, save };
}

const ready = boot();

// Same routes and rules as src/routes.js, without HTTP.
async function handle(method, fullPath, body, headers) {
  const { wallet, ledger, tontine, rate, save } = await ready;
  const path = fullPath.split('?')[0];
  const parts = path.split('/').filter(Boolean);
  const auth = (gid) => tontine.authenticate(gid, headers['x-member-id'], headers['x-member-token']);
  const route = `${method} /${parts.map((p, i) => (parts[0] === 'groups' && i === 1 ? ':id' : p)).join('/')}`;
  const gid = parts[0] === 'groups' ? parts[1] : null;
  if (gid !== null && gid !== undefined && !GROUP_ID.test(gid)) throw notFound();

  switch (route) {
    case 'GET /config': {
      const { xofPerSat, source, updatedAt } = rate.get();
      return { lightning: wallet.name, xofPerSat, rate: { source, updatedAt }, demo: true, publicDemo: true, browserDemo: true, ai: false };
    }
    case 'GET /demo': {
      const demo = JSON.parse(store.get(KEYS.demo) || 'null');
      if (!demo) throw notFound();
      return { groupId: demo.groupId, members: demo.links.map(({ name, position, url }) => ({ name, position, path: url.slice(url.indexOf('#')) })) };
    }
    case 'POST /groups': {
      const res = tontine.createGroup(validate(createSchema, body || {}));
      save();
      return res;
    }
    case 'GET /groups/:id/preview': {
      const v = tontine.view(gid);
      return { id: v.id, name: v.name, status: v.status, contributionSats: v.contributionSats, frequency: v.frequency, maxMembers: v.maxMembers, memberCount: v.members.length };
    }
    case 'POST /groups/:id/join': {
      const res = tontine.joinGroup(gid, validate(joinSchema, body || {}));
      save();
      return res;
    }
    case 'GET /groups/:id': {
      const member = auth(gid);
      await tontine.syncPayments(gid);
      save();
      return tontine.view(gid, member);
    }
    case 'POST /groups/:id/start': {
      const res = tontine.startGroup(gid, auth(gid));
      save();
      return res;
    }
    case 'POST /groups/:id/invoice': {
      const res = await tontine.getInvoice(gid, auth(gid));
      save();
      return res;
    }
    case 'POST /groups/:id/payout': {
      const member = auth(gid);
      const { destination } = validate(payoutSchema, body || {});
      const res = await tontine.claimPayout(gid, member, destination);
      save();
      return res;
    }
    case 'GET /groups/:id/ledger': {
      tontine.view(gid);
      const pubkey = ledger.pubkey(gid);
      const events = ledger.events(gid);
      return { pubkey: pubkey.hex, npub: pubkey.npub, relays: [], verification: verifyLedger(events, pubkey.hex), events };
    }
    case 'POST /groups/:id/assistant': {
      const member = auth(gid);
      const { question, lang } = validate(askSchema, body || {});
      return { answer: builtInAnswer(tontine.view(gid, member), question, lang || 'fr', rate.get().xofPerSat), source: 'built-in' };
    }
    case 'POST /dev/pay': {
      const { paymentHash } = validate(devPaySchema, body || {});
      if (!wallet.markPaid(paymentHash)) throw notFound('Invoice not found');
      save();
      return { ok: true };
    }
    case 'POST /dev/payout-invoice': {
      const { amountSats } = validate(devInvoiceSchema, body || {});
      const bolt11 = await wallet.makeExternalInvoice(amountSats);
      save();
      return { bolt11 };
    }
    default:
      throw badRequest('Unknown API route');
  }
}

window.nattLocalApi = async (method, path, body, headers = {}) => {
  try {
    // Round-trip through JSON, like a real HTTP response.
    return JSON.parse(JSON.stringify(await handle(method, path, body, headers)));
  } catch (err) {
    if (err instanceof AppError) throw { status: err.status, message: err.message };
    console.error(err);
    throw { status: 500, message: 'Something went wrong' };
  }
};

// Start a fresh demo group (used by the "Reset demo" button).
window.nattResetDemo = () => {
  try {
    for (const k of Object.values(KEYS)) localStorage.removeItem(k);
    localStorage.removeItem('groups');
  } catch {
    /* nothing saved */
  }
  location.hash = '#/';
  location.reload();
};
