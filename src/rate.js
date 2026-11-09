// Live sats → FCFA rate, for display only. Amounts are always stored in sats.
//
// The CFA franc (XOF) is pegged to the euro at a fixed rate, so a public
// BTC/EUR price is enough. If the price source is down or returns
// something implausible, we keep the last good rate, or the configured one.
import { log } from './logger.js';

export const XOF_PER_EUR = 655.957;
const PRICE_URL = 'https://mempool.space/api/v1/prices';

export function xofPerSatFromEur(eurPerBtc) {
  return (eurPerBtc * XOF_PER_EUR) / 100_000_000;
}

export function createRate({ fallback, live = false, fetchImpl = fetch, refreshMs = 10 * 60_000, retryMs = 60_000, now = Date.now }) {
  let current = { xofPerSat: fallback, source: 'fixed', updatedAt: null };
  let timer = null;

  async function refresh() {
    try {
      const res = await fetchImpl(PRICE_URL, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const eur = Number((await res.json())?.EUR);
      const rate = xofPerSatFromEur(eur);
      // 1 sat between 0.01 and 100 FCFA (BTC between ~1.5k and ~15M EUR).
      if (!Number.isFinite(rate) || rate < 0.01 || rate > 100) throw new Error('implausible price');
      current = { xofPerSat: rate, source: 'live', updatedAt: new Date(now()).toISOString() };
      return true;
    } catch (err) {
      log.warn(`Price refresh failed (${err.message}); keeping ${current.source} rate`);
      return false;
    }
  }

  // Refresh every 10 minutes; after a failure, try again in a minute.
  async function loop() {
    const ok = await refresh();
    timer = setTimeout(loop, ok ? refreshMs : retryMs);
    timer.unref?.();
  }

  return {
    get: () => current,
    async start() {
      if (!live) return current;
      await loop();
      return current;
    },
    refresh,
    stop: () => clearTimeout(timer),
  };
}
