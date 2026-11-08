import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createLedger, verifyLedger } from '../src/nostr.js';
import { createSimulatedWallet } from '../src/lightning/simulated.js';
import { createTontine } from '../src/tontine.js';

function setup() {
  const db = openDb(':memory:');
  const wallet = createSimulatedWallet();
  const ledger = createLedger({ db, masterSecret: 's' });
  const t = createTontine({ db, wallet, ledger });
  const org = t.createGroup({ name: 'Marché HLM', contributionSats: 1000, frequency: 'weekly', maxMembers: 3, organizerName: 'Awa' });
  const b = t.joinGroup(org.groupId, { name: 'Fatou' });
  const c = t.joinGroup(org.groupId, { name: 'Moussa' });
  const auth = (x) => t.authenticate(org.groupId, x.memberId, x.token);
  return { t, wallet, ledger, gid: org.groupId, people: [org, b, c].map(auth) };
}

async function payAll(t, wallet, gid, people) {
  for (const p of people) {
    const inv = await t.getInvoice(gid, p);
    if (!inv.paid) wallet.markPaid(inv.paymentHash);
  }
  await t.syncPayments(gid);
}

test('full tontine cycle pays everyone exactly once', async () => {
  const { t, wallet, ledger, gid, people } = setup();
  t.startGroup(gid, people[0]);
  const received = [];
  for (let r = 1; r <= 3; r++) {
    await payAll(t, wallet, gid, people);
    const v = t.view(gid);
    const recipient = people.find((p) => p.id === v.round.recipientId);
    const res = await t.claimPayout(gid, recipient, await wallet.makeExternalInvoice(3000));
    assert.equal(res.pot, 3000);
    received.push(recipient.id);
  }
  assert.equal(new Set(received).size, 3);
  assert.equal(t.view(gid).status, 'completed');
  assert.equal(await wallet.getBalance(), 0);
  const events = ledger.events(gid);
  assert.equal(verifyLedger(events, ledger.pubkey(gid).hex).ok, true);
  assert.equal(events.filter((e) => e.tags.some((x) => x[1] === 'contribution')).length, 9);
});

test('only the organizer can start, and only once', () => {
  const { t, gid, people } = setup();
  assert.throws(() => t.startGroup(gid, people[1]), /Only the organizer/);
  t.startGroup(gid, people[0]);
  assert.throws(() => t.startGroup(gid, people[0]), /already started/);
});

test('cannot join a full or started group', () => {
  const { t, gid } = setup();
  assert.throws(() => t.joinGroup(gid, { name: 'Late' }), /full/);
});

test('wrong token is rejected', () => {
  const { t, gid, people } = setup();
  assert.throws(() => t.authenticate(gid, people[0].id, 'nope'), /link/);
});

test('payout refused before everyone paid, to the wrong member, or for the wrong amount', async () => {
  const { t, wallet, gid, people } = setup();
  t.startGroup(gid, people[0]);
  const v = t.view(gid);
  const recipient = people.find((p) => p.id === v.round.recipientId);
  const other = people.find((p) => p.id !== v.round.recipientId);
  const inv = await wallet.makeExternalInvoice(3000);

  await assert.rejects(t.claimPayout(gid, recipient, inv), /Waiting for 3/);
  await payAll(t, wallet, gid, people);
  await assert.rejects(t.claimPayout(gid, other, inv), /not your turn/);
  await assert.rejects(t.claimPayout(gid, recipient, await wallet.makeExternalInvoice(99999)), /exactly 3000/);
  await assert.rejects(t.claimPayout(gid, recipient, 'garbage'), /not a valid/);
});

test('a client cannot mark itself paid; only the wallet can', async () => {
  const { t, gid, people } = setup();
  t.startGroup(gid, people[0]);
  await t.getInvoice(gid, people[1]);
  await t.syncPayments(gid);
  assert.equal(t.view(gid).round.paidCount, 0);
});

test('phone numbers are only visible to the organizer', () => {
  const { t } = setup();
  const g = t.createGroup({ name: 'G', contributionSats: 1, frequency: 'weekly', maxMembers: 5, organizerName: 'O' });
  const m = t.joinGroup(g.groupId, { name: 'P', phone: '+221770000000' });
  const org = t.authenticate(g.groupId, g.memberId, g.token);
  const member = t.authenticate(g.groupId, m.memberId, m.token);
  assert.ok(t.view(g.groupId, org).members.some((x) => x.phone === '+221770000000'));
  assert.ok(t.view(g.groupId, member).members.every((x) => !('phone' in x)));
});
