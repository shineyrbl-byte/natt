import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { buildServices } from '../src/server.js';
import { createApp } from '../src/app.js';

let server;
let base;

before(async () => {
  process.env.NATT_NOSTR_SECRET = 'test';
  const config = loadConfig({ DB_PATH: ':memory:' });
  const app = createApp({ config: { ...config, dbPath: ':memory:' }, ...buildServices({ ...config, dbPath: ':memory:' }) });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, body, who) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) Object.assign(headers, { 'x-member-id': who.memberId, 'x-member-token': who.token });
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

test('end-to-end happy path over HTTP', async () => {
  const org = (await call('POST', '/groups', { name: 'Natt Marché', contributionSats: 500, frequency: 'weekly', maxMembers: 2, organizerName: 'Awa' })).body;
  const gid = org.groupId;
  const preview = (await call('GET', `/groups/${gid}/preview`)).body;
  assert.equal(preview.memberCount, 1);
  const fatou = (await call('POST', `/groups/${gid}/join`, { name: 'Fatou', phone: '+221 77 000 00 00' })).body;

  assert.equal((await call('POST', `/groups/${gid}/start`, null, fatou)).status, 403);
  assert.equal((await call('POST', `/groups/${gid}/start`, null, org)).status, 200);

  for (const who of [org, fatou]) {
    const inv = (await call('POST', `/groups/${gid}/invoice`, null, who)).body;
    assert.match(inv.bolt11, /^lnbcrt/);
    assert.equal((await call('POST', '/dev/pay', { paymentHash: inv.paymentHash })).status, 200);
  }

  const view = (await call('GET', `/groups/${gid}`, null, org)).body;
  assert.equal(view.round.paidCount, 2);
  const recipient = view.round.recipientId === org.memberId ? org : fatou;
  const { bolt11 } = (await call('POST', '/dev/payout-invoice', { amountSats: 1000 })).body;
  const payout = await call('POST', `/groups/${gid}/payout`, { destination: bolt11 }, recipient);
  assert.equal(payout.status, 200);
  assert.equal(payout.body.pot, 1000);

  const ledger = (await call('GET', `/groups/${gid}/ledger`)).body;
  assert.equal(ledger.verification.ok, true);
  assert.ok(ledger.events.every((e) => !e.content.includes('Fatou') && !e.content.includes('77 000')));
});

test('rejects bad input, unknown fields and missing auth', async () => {
  assert.equal((await call('POST', '/groups', { name: 'x' })).status, 400);
  const extra = await call('POST', '/groups', { name: 'Ok group', contributionSats: 500, frequency: 'weekly', maxMembers: 3, organizerName: 'A', isAdmin: true });
  assert.equal(extra.status, 400);
  assert.match(extra.body.error, /Unknown field/);
  assert.equal((await call('POST', '/groups', { name: 'Ok group', contributionSats: 5, frequency: 'weekly', maxMembers: 3, organizerName: 'A' })).status, 400);
  assert.equal((await call('GET', '/groups/abcdefgh')).status, 401);
  assert.equal((await call('GET', '/groups/bad%27id')).status, 404);
  const org = (await call('POST', '/groups', { name: 'Ok group', contributionSats: 500, frequency: 'weekly', maxMembers: 3, organizerName: 'A' })).body;
  assert.equal((await call('GET', `/groups/${org.groupId}`)).status, 401);
  assert.equal((await call('GET', `/groups/${org.groupId}`, null, { ...org, token: 'wrong' })).status, 401);
});
