import { Router } from 'express';
import { validate } from './validate.js';
import { GROUP_ID, createSchema, joinSchema, payoutSchema, askSchema, devPaySchema, devInvoiceSchema } from './schemas.js';
import { verifyLedger } from './nostr.js';
import { badRequest, notFound } from './errors.js';
import { readFileSync } from 'node:fs';
import { demoLinksPath } from './config.js';

// Express 5 forwards rejected promises to the error handler.
export function createRoutes({ config, wallet, ledger, tontine, assistant, rate }) {
  const r = Router();

  r.param('groupId', (req, res, next, id) => (GROUP_ID.test(id) ? next() : next(notFound())));

  // Member auth: id + secret token in headers, never in the URL.
  const auth = (req, res, next) => {
    req.member = tontine.authenticate(req.params.groupId, req.get('x-member-id'), req.get('x-member-token'));
    next();
  };

  r.get('/config', (req, res) => {
    const { xofPerSat, source, updatedAt } = rate?.get() ?? { xofPerSat: config.xofPerSat, source: 'fixed', updatedAt: null };
    res.json({ lightning: wallet.name, xofPerSat, rate: { source, updatedAt }, demo: wallet.name === 'simulated', publicDemo: publicDemo(), ai: Boolean(config.anthropicApiKey) });
  });

  // Public demo links: simulated wallet only, so no real money is reachable.
  const publicDemo = () => Boolean(config.publicDemo && wallet.name === 'simulated');
  r.get('/demo', (req, res) => {
    if (!publicDemo()) throw notFound();
    let demo;
    try {
      demo = JSON.parse(readFileSync(demoLinksPath(config), 'utf8'));
    } catch {
      throw notFound();
    }
    res.json({ groupId: demo.groupId, members: demo.links.map(({ name, position, url }) => ({ name, position, path: url.slice(url.indexOf('#')) })) });
  });

  r.post('/groups', (req, res) => {
    res.status(201).json(tontine.createGroup(validate(createSchema, req.body)));
  });

  // Public preview for the invite page: no member names.
  r.get('/groups/:groupId/preview', (req, res) => {
    const v = tontine.view(req.params.groupId);
    res.json({ id: v.id, name: v.name, status: v.status, contributionSats: v.contributionSats, frequency: v.frequency, maxMembers: v.maxMembers, memberCount: v.members.length });
  });

  r.post('/groups/:groupId/join', (req, res) => {
    res.status(201).json(tontine.joinGroup(req.params.groupId, validate(joinSchema, req.body)));
  });

  r.get('/groups/:groupId', auth, async (req, res) => {
    await tontine.syncPayments(req.params.groupId);
    res.json(tontine.view(req.params.groupId, req.member));
  });

  r.post('/groups/:groupId/start', auth, (req, res) => {
    res.json(tontine.startGroup(req.params.groupId, req.member));
  });

  r.post('/groups/:groupId/invoice', auth, async (req, res) => {
    res.json(await tontine.getInvoice(req.params.groupId, req.member));
  });

  r.post('/groups/:groupId/payout', auth, async (req, res) => {
    const { destination } = validate(payoutSchema, req.body);
    res.json(await tontine.claimPayout(req.params.groupId, req.member, destination));
  });

  // Anyone with the invite code can audit the ledger.
  r.get('/groups/:groupId/ledger', (req, res) => {
    tontine.view(req.params.groupId); // 404 if missing
    const pubkey = ledger.pubkey(req.params.groupId);
    const events = ledger.events(req.params.groupId);
    res.json({ pubkey: pubkey.hex, npub: pubkey.npub, relays: config.nostrRelays, verification: verifyLedger(events, pubkey.hex), events });
  });

  if (assistant) {
    r.post('/groups/:groupId/assistant', auth, async (req, res) => {
      const { question, lang } = validate(askSchema, req.body);
      res.json(await assistant.ask({ view: tontine.view(req.params.groupId, req.member), question, lang: lang || 'fr' }));
    });
  }

  // Demo-only helpers, mounted only with the simulated wallet.
  if (wallet.name === 'simulated') {
    r.post('/dev/pay', (req, res) => {
      const { paymentHash } = validate(devPaySchema, req.body);
      if (!wallet.markPaid(paymentHash)) throw notFound('Invoice not found');
      res.json({ ok: true });
    });
    r.post('/dev/payout-invoice', async (req, res) => {
      const { amountSats } = validate(devInvoiceSchema, req.body);
      res.json({ bolt11: await wallet.makeExternalInvoice(amountSats) });
    });
  }

  r.use((req, res, next) => next(badRequest('Unknown API route')));
  return r;
}
