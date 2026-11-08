import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulatedWallet } from '../src/lightning/simulated.js';
import { createLnbitsWallet } from '../src/lightning/lnbits.js';
import { decodeInvoice } from '../src/lightning/bolt11.js';
import { isLightningAddress, invoiceFromAddress } from '../src/lightning/address.js';

test('simulated wallet creates decodable regtest invoices', async () => {
  const w = createSimulatedWallet();
  const inv = await w.createInvoice({ amountSats: 2500, memo: 'Natt round 1' });
  assert.match(inv.bolt11, /^lnbcrt25000n1/);
  const decoded = decodeInvoice(inv.bolt11);
  assert.equal(decoded.amountSats, 2500);
  assert.equal(decoded.paymentHash, inv.paymentHash);
  assert.equal(decoded.description, 'Natt round 1');
});

test('simulated wallet tracks payments and balance', async () => {
  const w = createSimulatedWallet();
  const inv = await w.createInvoice({ amountSats: 1000, memo: 'x' });
  assert.equal(await w.isPaid(inv.paymentHash), false);
  w.markPaid(inv.paymentHash);
  w.markPaid(inv.paymentHash); // idempotent
  assert.equal(await w.isPaid(inv.paymentHash), true);
  assert.equal(await w.getBalance(), 1000);
  await assert.rejects(w.payInvoice(await w.makeExternalInvoice(5000)), /Insufficient/);
  await w.payInvoice(await w.makeExternalInvoice(1000));
  assert.equal(await w.getBalance(), 0);
});

test('lnbits wallet uses invoice key for invoices and admin key for payouts', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, key: opts.headers['X-Api-Key'], body: opts.body && JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ payment_hash: 'abc', bolt11: 'lnbc1', paid: true, balance: 5000 }) };
  };
  const w = createLnbitsWallet({ url: 'https://ln.example', invoiceKey: 'INV', adminKey: 'ADM', fetchImpl });
  await w.createInvoice({ amountSats: 10, memo: 'm' });
  await w.isPaid('abc');
  await w.payInvoice('lnbc1');
  assert.equal(await w.getBalance(), 5);
  assert.deepEqual(calls.map((c) => c.key), ['INV', 'INV', 'ADM', 'INV']);
  assert.equal(calls[0].body.out, false);
  assert.equal(calls[2].body.out, true);
});

test('lightning address validation blocks private hosts', async () => {
  assert.ok(isLightningAddress('awa@blink.sv'));
  assert.ok(!isLightningAddress('not an address'));
  await assert.rejects(invoiceFromAddress('x@127.0.0.1', 10, async () => assert.fail('no fetch')), /Invalid/);
});

test('lightning address rejects invoice with wrong amount', async () => {
  const w = createSimulatedWallet();
  const wrong = await w.makeExternalInvoice(999);
  const fetchImpl = async (url) => ({
    json: async () =>
      String(url).includes('.well-known')
        ? { tag: 'payRequest', callback: 'https://pay.example/cb', minSendable: 1000, maxSendable: 1e9 }
        : { pr: wrong },
  });
  await assert.rejects(invoiceFromAddress('awa@pay.example', 1000, fetchImpl), /wrong invoice/);
});

test('simulated wallet state survives a restart when backed by SQLite', async () => {
  const { openDb } = await import('../src/db.js');
  const db = openDb(':memory:');
  const w1 = createSimulatedWallet({ db });
  const inv = await w1.createInvoice({ amountSats: 700, memo: 'x' });
  w1.markPaid(inv.paymentHash);
  const w2 = createSimulatedWallet({ db });
  assert.equal(await w2.isPaid(inv.paymentHash), true);
  assert.equal(await w2.getBalance(), 700);
});
