// Resolve a Lightning address (name@domain) into an invoice for an exact
// amount, via LNURL-pay. Only public HTTPS hosts are allowed, so this
// can't be used to probe the server's internal network.
import { decodeInvoice } from './bolt11.js';

const ADDRESS_RE = /^[a-z0-9._-]{1,64}@([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/i;
const PRIVATE_HOST_RE = /^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/i;

export function isLightningAddress(value) {
  return ADDRESS_RE.test(String(value).trim());
}

export async function invoiceFromAddress(address, amountSats, fetchImpl = fetch) {
  const [user, domain] = String(address).trim().toLowerCase().split('@');
  if (!isLightningAddress(address) || PRIVATE_HOST_RE.test(domain)) {
    throw new Error('Invalid Lightning address');
  }
  const opts = { signal: AbortSignal.timeout(10_000), redirect: 'error' };

  const meta = await (await fetchImpl(`https://${domain}/.well-known/lnurlp/${user}`, opts)).json();
  if (meta.tag !== 'payRequest' || typeof meta.callback !== 'string' || !meta.callback.startsWith('https://')) {
    throw new Error('This Lightning address does not accept payments');
  }
  const msat = amountSats * 1000;
  if (msat < meta.minSendable || msat > meta.maxSendable) {
    throw new Error('Amount is outside what this Lightning address accepts');
  }

  const cb = new URL(meta.callback);
  cb.searchParams.set('amount', String(msat));
  const { pr } = await (await fetchImpl(cb, opts)).json();
  if (!pr || decodeInvoice(pr).amountSats !== amountSats) {
    throw new Error('Lightning address returned a wrong invoice');
  }
  return pr;
}
