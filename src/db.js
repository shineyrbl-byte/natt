// SQLite storage through Node's built-in driver (no native build step).
// Only prepared statements are used (docs/THREAT_MODEL.md, T6).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  contribution_sats INTEGER NOT NULL CHECK (contribution_sats > 0),
  frequency         TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  max_members       INTEGER NOT NULL CHECK (max_members BETWEEN 2 AND 50),
  status            TEXT NOT NULL DEFAULT 'forming'
                    CHECK (status IN ('forming', 'active', 'completed')),
  organizer_id      TEXT,
  current_round     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id              TEXT PRIMARY KEY,
  group_id        TEXT NOT NULL REFERENCES groups(id),
  name            TEXT NOT NULL,
  phone           TEXT,
  token_hash      TEXT NOT NULL,
  payout_position INTEGER,
  joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, payout_position)
);

CREATE TABLE IF NOT EXISTS rounds (
  id                  TEXT PRIMARY KEY,
  group_id            TEXT NOT NULL REFERENCES groups(id),
  number              INTEGER NOT NULL,
  recipient_id        TEXT NOT NULL REFERENCES members(id),
  status              TEXT NOT NULL DEFAULT 'collecting'
                      CHECK (status IN ('collecting', 'paying', 'paid')),
  payout_payment_hash TEXT,
  opened_at           TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at             TEXT,
  UNIQUE (group_id, number)
);

CREATE TABLE IF NOT EXISTS contributions (
  id            TEXT PRIMARY KEY,
  round_id      TEXT NOT NULL REFERENCES rounds(id),
  member_id     TEXT NOT NULL REFERENCES members(id),
  amount_sats   INTEGER NOT NULL,
  payment_hash  TEXT NOT NULL UNIQUE,
  bolt11        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at       TEXT,
  UNIQUE (round_id, member_id)
);

CREATE TABLE IF NOT EXISTS ledger (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id),
  kind        TEXT NOT NULL,
  event_json  TEXT NOT NULL,
  published   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_rounds_group ON rounds(group_id);
CREATE INDEX IF NOT EXISTS idx_ledger_group ON ledger(group_id);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

// Run fn inside a transaction; roll back on any error.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
