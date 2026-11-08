// A fake Lightning wallet for demos and tests. It creates genuine,
// signed regtest invoices but no real sats move. Payments are marked
// settled through markPaid(), which the dev-only API route calls.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { encodeInvoice, decodeInvoice } from './bolt11.js';

export function createSimulatedWallet() {
  const nodeKey = secp256k1.utils.randomSecretKey();
  const invoices = new Map(); // paymentHash -> { amountSats, paid }
  let balance = 0;

  return {
    name: 'simulated',

    async createInvoice({ amountSats, memo }) {
      const inv = encodeInvoice({ amountSats, description: memo, secretKey: nodeKey });
      invoices.set(inv.paymentHash, { amountSats, paid: false });
      return { paymentHash: inv.paymentHash, bolt11: inv.bolt11 };
    },

    async isPaid(paymentHash) {
      return invoices.get(paymentHash)?.paid === true;
    },

    async payInvoice(bolt11) {
      const { amountSats, paymentHash } = decodeInvoice(bolt11);
      if (amountSats > balance) throw new Error('Insufficient balance in group wallet');
      balance -= amountSats;
      return { paymentHash };
    },

    async getBalance() {
      return balance;
    },

    // Demo helper: pretend a member paid this invoice.
    markPaid(paymentHash) {
      const inv = invoices.get(paymentHash);
      if (!inv) return false;
      if (!inv.paid) {
        inv.paid = true;
        balance += inv.amountSats;
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
