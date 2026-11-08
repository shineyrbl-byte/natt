import { join, dirname } from 'node:path';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createWallet } from './lightning/index.js';
import { createLedger, loadOrCreateSecret } from './nostr.js';
import { createTontine } from './tontine.js';
import { createApp } from './app.js';
import { log } from './logger.js';

export function buildServices(config) {
  const db = openDb(config.dbPath);
  const wallet = createWallet(config);
  const secretPath = config.dbPath === ':memory:' ? 'data/nostr.secret' : join(dirname(config.dbPath), 'nostr.secret');
  const ledger = createLedger({ db, masterSecret: loadOrCreateSecret(secretPath), relays: config.nostrRelays });
  const tontine = createTontine({ db, wallet, ledger });
  return { db, wallet, ledger, tontine };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const services = buildServices(config);
  const app = createApp({ config, ...services });
  app.listen(config.port, () => {
    log.info(`Natt listening on http://localhost:${config.port} (lightning: ${services.wallet.name})`);
  });
}
