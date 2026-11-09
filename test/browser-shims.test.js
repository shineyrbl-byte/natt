// The browser demo swaps node:crypto and node:sqlite for stand-ins.
// These tests check the stand-ins give the same results as Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeCrypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as shim from '../browser/shims/crypto.js';
import { Buffer as PolyBuffer } from '../browser/shims/buffer-global.js';
import { setSqlJs, DatabaseSync } from '../browser/shims/sqlite.js';

test('sha256 and hmac match node:crypto', () => {
  for (const input of ['', 'natt', 'Jërëjëf ⚡']) {
    assert.equal(shim.createHash('sha256').update(input).digest('hex'), nodeCrypto.createHash('sha256').update(input).digest('hex'));
    assert.equal(shim.createHmac('sha256', 'secret').update(input).digest('hex'), nodeCrypto.createHmac('sha256', 'secret').update(input).digest('hex'));
  }
});

test('the Buffer polyfill encodes base64url like Node', () => {
  for (let i = 0; i < 50; i++) {
    const bytes = nodeCrypto.randomBytes(1 + (i % 17));
    assert.equal(PolyBuffer.from(bytes).toString('base64url'), bytes.toString('base64url'));
  }
});

test('randomInt stays in range and timingSafeEqual compares correctly', () => {
  for (let i = 0; i < 500; i++) {
    const n = shim.randomInt(7);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 7);
  }
  assert.equal(shim.timingSafeEqual(Buffer.from('ab'), Buffer.from('ab')), true);
  assert.equal(shim.timingSafeEqual(Buffer.from('ab'), Buffer.from('ac')), false);
});

test('the sql.js adapter behaves like node:sqlite for run/get/all, and survives export', async () => {
  const require = createRequire(import.meta.url);
  const initSqlJs = require('sql.js');
  setSqlJs(await initSqlJs());
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
  const ins = db.prepare('INSERT INTO t (id, n) VALUES (?, ?)');
  assert.equal(ins.run('a', 1).changes, 1);
  ins.run('b', 2);
  db.export(); // frees sql.js statements; ours are prepared per call
  assert.deepEqual({ ...db.prepare('SELECT * FROM t WHERE id = ?').get('b') }, { id: 'b', n: 2 });
  assert.equal(db.prepare('SELECT * FROM t WHERE id = ?').get('zz'), undefined);
  assert.equal(db.prepare('SELECT * FROM t ORDER BY id').all().length, 2);
  assert.equal(db.prepare('UPDATE t SET n = 9 WHERE id = ?').run('nope').changes, 0);
});
