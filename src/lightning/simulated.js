// A fake Lightning wallet for demos and tests. It creates genuine,
// signed regtest invoices but no real sats move. Payments are marked
// settled through markPaid(), which the dev-only API route calls.
// State is kept in SQLite when a db is given, so demos survive restarts.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { encodeInvoice, decodeInvoice } from './bolt11.js';

function memoryStore() {
  const invoices = new Map();
  let balance = 0;
  return {
    add: (hash, amount) => invoices.set(hash, { amount, paid: false }),
    get: (hash) => invoices.get(hash),
    setPaid: (hash) => (invoices.get(hash).paid = true),
    balance: () => balance,
    addBalance: (d) => (balance += d),
  };
}

function sqliteStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sim_invoices (payment_hash TEXT PRIMARY KEY, amount INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sim_wallet (id INTEGER PRIMARY KEY CHECK (id = 1), balance INTEGER NOT NULL);
    INSERT OR IGNORE INTO sim_wallet (id, balance) VALUES (1, 0);
  `);
  const q = {
    add: db.prepare('INSERT INTO sim_invoices (payment_hash, amount) VALUES (?, ?)'),
    get: db.prepare('SELECT amount, paid FROM sim_invoices WHERE payment_hash = ?'),
    setPaid: db.prepare('UPDATE sim_invoices SET paid = 1 WHERE payment_hash = ?'),
    balance: db.prepare('SELECT balance FROM sim_wallet WHERE id = 1'),
    addBalance: db.prepare('UPDATE sim_wallet SET balance = balance + ? WHERE id = 1'),
  };
  return {
    add: (hash, amount) => q.add.run(hash, amount),
    get: (hash) => {
      const row = q.get.get(hash);
      return row && { amount: row.amount, paid: row.paid === 1 };
    },
    setPaid: (hash) => q.setPaid.run(hash),
    balance: () => q.balance.get().balance,
    addBalance: (d) => q.addBalance.run(d),
  };
}

export function createSimulatedWallet({ db } = {}) {
  const nodeKey = secp256k1.utils.randomSecretKey();
  const s = db ? sqliteStore(db) : memoryStore();

  return {
    name: 'simulated',

    async createInvoice({ amountSats, memo }) {
      const inv = encodeInvoice({ amountSats, description: memo, secretKey: nodeKey });
      s.add(inv.paymentHash, amountSats);
      return { paymentHash: inv.paymentHash, bolt11: inv.bolt11 };
    },

    async isPaid(paymentHash) {
      return s.get(paymentHash)?.paid === true;
    },

    async payInvoice(bolt11) {
      const { amountSats, paymentHash } = decodeInvoice(bolt11);
      if (amountSats > s.balance()) throw new Error('Insufficient balance in group wallet');
      s.addBalance(-amountSats);
      return { paymentHash };
    },

    async getBalance() {
      return s.balance();
    },

    // Demo helper: pretend a member paid this invoice.
    markPaid(paymentHash) {
      const inv = s.get(paymentHash);
      if (!inv) return false;
      if (!inv.paid) {
        s.setPaid(paymentHash);
        s.addBalance(inv.amount);
      }
      return true;
    },

    // Demo helper: an invoice the "recipient's wallet" would give us.
    async makeExternalInvoice(amountSats) {
      const other = secp256k1.utils.randomSecretKey();
      return encodeInvoice({ amountSats, description: 'Natt payout', secretKey: other }).bolt11;
    },
  };
}
