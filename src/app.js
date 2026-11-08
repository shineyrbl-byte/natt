import express from 'express';
import { fileURLToPath } from 'node:url';
import { securityHeaders, rateLimit, requestLog } from './security.js';
import { createRoutes } from './routes.js';
import { log } from './logger.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const QR_MODULE = fileURLToPath(new URL('../node_modules/qrcode-generator/dist/qrcode.mjs', import.meta.url));

export function createApp({ config, wallet, ledger, tontine, assistant, rate }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(securityHeaders);
  app.use(requestLog);
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, lightning: wallet.name }));
  app.use('/api', rateLimit({ perMinute: config.rateLimitPerMinute }));
  app.use('/api', createRoutes({ config, wallet, ledger, tontine, assistant, rate }));

  app.get('/vendor/qrcode.mjs', (req, res) => res.type('text/javascript').sendFile(QR_MODULE, { maxAge: '7d' }));
  app.use(express.static(PUBLIC_DIR, { maxAge: '1h', index: 'index.html' }));

  // Never leak stack traces to clients.
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request too large' });
      return;
    }
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) log.error('Unhandled error', err.message);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message });
  });

  return app;
}
