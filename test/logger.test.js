import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/logger.js';

test('redacts phone numbers, invoices, keys and emails', () => {
  const out = redact('call +221 77 123 45 67 pay lnbc10u1pjxyzabcdefghijklmnopqrstuvw key 0123456789abcdef0123456789abcdef mail awa@example.sn');
  assert.ok(!out.includes('77 123'));
  assert.ok(!out.includes('lnbc10u1'));
  assert.ok(!out.includes('0123456789abcdef'));
  assert.ok(!out.includes('awa@example.sn'));
});

test('keeps ordinary text', () => {
  assert.equal(redact('GET /api/health 200 3ms'), 'GET /api/health 200 3ms');
});
