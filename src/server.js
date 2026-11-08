import { join, dirname } from 'node:path';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createWallet } from './lightning/index.js';
import { createLedger, loadOrCreateSecret } from './nostr.js';
import { createTontine } from './tontine.js';
import { createApp } from './app.js';
import { createAssistant } from './assistant.js';
import { log } from './logger.js';

export function buildServices(config) {
  const db = openDb(config.dbPath);
  const wallet = createWallet(config, db);
  const secretPath = config.dbPath === ':memory:' ? 'data/nostr.secret' : join(dirname(config.dbPath), 'nostr.secret');
  const ledger = createLedger({ db, masterSecret: loadOrCreateSecret(secretPath), relays: config.nostrRelays });
  const tontine = createTontine({ db, wallet, ledger });
  const assistant = createAssistant({ apiKey: config.anthropicApiKey, model: config.anthropicModel, xofPerSat: config.xofPerSat });
  return { db, wallet, ledger, tontine, assistant };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const services = buildServices(config);
  const app = createApp({ config, ...services });
  app.listen(config.port, async () => {
    log.info(`Natt listening on http://localhost:${config.port} (lightning: ${services.wallet.name})`);
    const empty = services.db.prepare('SELECT COUNT(*) AS n FROM groups').get().n === 0;
    if (process.env.SEED_DEMO === '1' && empty && services.wallet.name === 'simulated') {
      const { seedDemo, printDemo } = await import('../scripts/seed.js');
      printDemo(await seedDemo({ ...services, baseUrl: process.env.PUBLIC_URL || `http://localhost:${config.port}` }));
    }
  });
}
