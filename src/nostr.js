// Tamper-evident group ledger on Nostr.
//
// Each group has its own Nostr key, derived from one server secret, so no
// private keys are ever stored in the database. Every contribution and
// payout becomes a signed event that references the previous event of the
// same group (an "e" tag), forming a hash chain. Members can fetch the
// events from public relays and check them with verifyLedger().
//
// Privacy: events never contain names or phone numbers, only the member's
// position number in the payout order (docs/THREAT_MODEL.md, T8).
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { finalizeEvent, verifyEvent, getPublicKey, nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { log } from './logger.js';

export const LEDGER_TAG = 'natt-ledger';

export function loadOrCreateSecret(path) {
  if (process.env.NATT_NOSTR_SECRET) return process.env.NATT_NOSTR_SECRET;
  if (existsSync(path)) return readFileSync(path, 'utf8').trim();
  mkdirSync(dirname(path), { recursive: true });
  const secret = randomBytes(32).toString('hex');
  writeFileSync(path, secret, { mode: 0o600 });
  return secret;
}

export function createLedger({ db, masterSecret, relays = [] }) {
  const pool = relays.length ? new SimplePool() : null;

  const groupKey = (groupId) => new Uint8Array(createHmac('sha256', masterSecret).update(`natt-group:${groupId}`).digest());

  const lastEvent = db.prepare('SELECT id FROM ledger WHERE group_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1');
  const insert = db.prepare('INSERT INTO ledger (id, group_id, kind, event_json) VALUES (?, ?, ?, ?)');
  const markPublished = db.prepare('UPDATE ledger SET published = 1 WHERE id = ?');
  const listEvents = db.prepare('SELECT event_json FROM ledger WHERE group_id = ? ORDER BY created_at, rowid');

  function publish(event) {
    if (!pool) return;
    Promise.any(pool.publish(relays, event))
      .then(() => markPublished.run(event.id))
      .catch(() => log.warn('Nostr publish failed; event kept locally', { id: event.id }));
  }

  return {
    pubkey(groupId) {
      const hex = getPublicKey(groupKey(groupId));
      return { hex, npub: nip19.npubEncode(hex) };
    },

    // kind: 'group' | 'contribution' | 'payout'
    record(groupId, kind, { content, tags = [] }) {
      const prev = lastEvent.get(groupId);
      const event = finalizeEvent(
        {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          content,
          tags: [['t', LEDGER_TAG], ['natt', kind], ['g', groupId], ...(prev ? [['e', prev.id, '', 'reply']] : []), ...tags],
        },
        groupKey(groupId),
      );
      insert.run(event.id, groupId, kind, JSON.stringify(event));
      publish(event);
      return event;
    },

    events(groupId) {
      return listEvents.all(groupId).map((r) => JSON.parse(r.event_json));
    },

    close() {
      pool?.close(relays);
    },
  };
}

// Check that events are validly signed by the group key and form an
// unbroken chain. Returns { ok, count, problem? }.
export function verifyLedger(events, expectedPubkey) {
  let prevId = null;
  for (const [i, ev] of events.entries()) {
    if (!verifyEvent(ev)) return { ok: false, count: i, problem: `Event ${i + 1} has a bad signature` };
    if (ev.pubkey !== expectedPubkey) return { ok: false, count: i, problem: `Event ${i + 1} was signed by another key` };
    const ref = ev.tags.find((t) => t[0] === 'e')?.[1] ?? null;
    if (ref !== prevId) return { ok: false, count: i, problem: `Event ${i + 1} breaks the chain (a record is missing or changed)` };
    prevId = ev.id;
  }
  return { ok: true, count: events.length };
}
