// Security middleware: headers, rate limiting and request logging
// without PII. See docs/THREAT_MODEL.md.
import { log } from './logger.js';

export function securityHeaders(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
}

// Fixed-window limiter kept in memory. Good enough for one instance.
export function rateLimit({ perMinute }) {
  const hits = new Map();
  setInterval(() => hits.clear(), 60_000).unref();
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const count = (hits.get(key) || 0) + 1;
    hits.set(key, count);
    if (count > perMinute) {
      res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
      return;
    }
    next();
  };
}

export function requestLog(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    // Path only, never query strings or bodies (they can hold tokens).
    log.info(`${req.method} ${req.baseUrl}${req.route?.path ?? req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
