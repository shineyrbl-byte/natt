// Every backend implements the same interface:
//   createInvoice({ amountSats, memo }) -> { paymentHash, bolt11 }
//   isPaid(paymentHash)                 -> boolean
//   payInvoice(bolt11)                  -> { paymentHash }
//   getBalance()                        -> sats
import { createSimulatedWallet } from './simulated.js';
import { createLnbitsWallet } from './lnbits.js';

export function createWallet(config, db) {
  if (config.lightningBackend === 'lnbits') return createLnbitsWallet(config.lnbits);
  return createSimulatedWallet({ db });
}

export { decodeInvoice } from './bolt11.js';
export { isLightningAddress, invoiceFromAddress } from './address.js';
