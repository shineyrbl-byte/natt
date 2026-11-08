import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { log } from './logger.js';

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  log.info(`Natt listening on http://localhost:${config.port} (lightning: ${config.lightningBackend})`);
});
