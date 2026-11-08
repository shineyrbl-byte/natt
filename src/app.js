import express from 'express';
import { securityHeaders, rateLimit, requestLog } from './security.js';

export function createApp({ config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(securityHeaders);
  app.use(requestLog);
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', rateLimit({ perMinute: config.rateLimitPerMinute }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, lightning: config.lightningBackend });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Never leak stack traces to clients.
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    const status = err.status && err.status < 500 ? err.status : 500;
    res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message });
  });

  return app;
}
