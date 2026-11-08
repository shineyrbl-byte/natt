import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createLedger, verifyLedger } from '../src/nostr.js';

function setup() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO groups (id, name, contribution_sats, frequency, max_members) VALUES ('g1', 'T', 1000, 'weekly', 5)").run();
  const ledger = createLedger({ db, masterSecret: 'test-secret' });
  return { db, ledger };
}

test('records a signed, chained ledger that verifies', () => {
  const { ledger } = setup();
  ledger.record('g1', 'group', { content: 'Group created' });
  ledger.record('g1', 'contribution', { content: 'Member #1 paid 1000 sats', tags: [['amount', '1000']] });
  ledger.record('g1', 'payout', { content: 'Member #1 received 2000 sats' });
  const events = ledger.events('g1');
  assert.equal(events.length, 3);
  assert.deepEqual(verifyLedger(events, ledger.pubkey('g1').hex), { ok: true, count: 3 });
});

test('detects a removed record', () => {
  const { ledger } = setup();
  for (let i = 0; i < 3; i++) ledger.record('g1', 'contribution', { content: `#${i}` });
  const events = ledger.events('g1');
  events.splice(1, 1);
  const res = verifyLedger(events, ledger.pubkey('g1').hex);
  assert.equal(res.ok, false);
  assert.match(res.problem, /chain/);
});

test('detects an edited record', () => {
  const { ledger } = setup();
  ledger.record('g1', 'contribution', { content: 'Member #2 paid 1000 sats' });
  const events = ledger.events('g1');
  events[0].content = 'Member #2 paid 9000 sats';
  assert.match(verifyLedger(events, ledger.pubkey('g1').hex).problem, /signature/);
});

test('group keys are deterministic and distinct per group', () => {
  const { ledger } = setup();
  assert.equal(ledger.pubkey('g1').hex, ledger.pubkey('g1').hex);
  assert.notEqual(ledger.pubkey('g1').hex, ledger.pubkey('g2').hex);
  assert.match(ledger.pubkey('g1').npub, /^npub1/);
});
