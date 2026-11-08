import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, tx } from '../src/db.js';

test('creates schema and enforces constraints', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO groups (id, name, contribution_sats, frequency, max_members) VALUES ('g1', 'Test', 1000, 'weekly', 5)").run();
  assert.throws(() =>
    db.prepare("INSERT INTO groups (id, name, contribution_sats, frequency, max_members) VALUES ('g2', 'Bad', -1, 'weekly', 5)").run(),
  );
});

test('tx rolls back on error', () => {
  const db = openDb(':memory:');
  assert.throws(() =>
    tx(db, () => {
      db.prepare("INSERT INTO groups (id, name, contribution_sats, frequency, max_members) VALUES ('g1', 'T', 1, 'weekly', 5)").run();
      throw new Error('boom');
    }),
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM groups').get().n, 0);
});
