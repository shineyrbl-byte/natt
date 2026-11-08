// Real Lightning backend using an LNbits wallet (self-hosted or hosted).
// The invoice key can only create/read invoices; the admin key, needed
// to send payouts, is used for nothing else (docs/THREAT_MODEL.md, T1).

export function createLnbitsWallet({ url, invoiceKey, adminKey, fetchImpl = fetch }) {
  async function call(path, { method = 'GET', key = invoiceKey, body } = {}) {
    const res = await fetchImpl(`${url}${path}`, {
      method,
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // LNbits error text can be shown; it never contains our keys.
      throw new Error(`Lightning backend error (${res.status}): ${json.detail || 'unknown'}`);
    }
    return json;
  }

  return {
    name: 'lnbits',

    async createInvoice({ amountSats, memo }) {
      const json = await call('/api/v1/payments', {
        method: 'POST',
        body: { out: false, amount: amountSats, memo, expiry: 86_400 },
      });
      return { paymentHash: json.payment_hash, bolt11: json.bolt11 || json.payment_request };
    },

    async isPaid(paymentHash) {
      const json = await call(`/api/v1/payments/${encodeURIComponent(paymentHash)}`);
      return json.paid === true;
    },

    async payInvoice(bolt11) {
      const json = await call('/api/v1/payments', { method: 'POST', key: adminKey, body: { out: true, bolt11 } });
      return { paymentHash: json.payment_hash };
    },

    async getBalance() {
      const json = await call('/api/v1/wallet');
      return Math.floor(Number(json.balance || 0) / 1000);
    },
  };
}
