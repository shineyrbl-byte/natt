import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRate, xofPerSatFromEur } from '../src/rate.js';

const reply = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 503, json: async () => body });

test('converts BTC/EUR into FCFA per sat using the fixed euro peg', () => {
  // 100,000 EUR per BTC = 0.001 EUR per sat = 0.655957 FCFA
  assert.equal(xofPerSatFromEur(100_000).toFixed(6), '0.655957');
});

test('uses the live price when the source answers', async () => {
  const rate = createRate({ fallback: 0.55, live: true, fetchImpl: reply({ EUR: 100_000 }) });
  await rate.start();
  rate.stop();
  assert.equal(rate.get().source, 'live');
  assert.ok(Math.abs(rate.get().xofPerSat - 0.655957) < 1e-9);
});

test('keeps the fallback when the source fails or lies', async () => {
  for (const fetchImpl of [reply({}, false), reply({ EUR: 'abc' }), reply({ EUR: 1 }), async () => { throw new Error('offline'); }]) {
    const rate = createRate({ fallback: 0.55, live: true, fetchImpl });
    await rate.start();
    rate.stop();
    assert.deepEqual(rate.get(), { xofPerSat: 0.55, source: 'fixed', updatedAt: null });
  }
});

test('does not fetch at all when live rates are off', async () => {
  let called = false;
  const rate = createRate({ fallback: 0.5, fetchImpl: async () => (called = true) });
  await rate.start();
  assert.equal(called, false);
  assert.equal(rate.get().xofPerSat, 0.5);
});
