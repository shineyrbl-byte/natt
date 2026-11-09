// Request rules, shared by the HTTP routes and the browser-only demo.
import { str, int, oneOf, PHONE } from './validate.js';

export const GROUP_ID = /^[A-Za-z0-9_-]{8}$/;

export const createSchema = {
  name: str(2, 60, { label: 'Group name' }),
  contributionSats: int(100, 10_000_000, { label: 'Contribution' }),
  frequency: oneOf(['weekly', 'monthly'], { label: 'Frequency' }),
  maxMembers: int(2, 50, { label: 'Number of members' }),
  organizerName: str(1, 40, { label: 'Your name' }),
  organizerPhone: str(8, 20, { pattern: PHONE, optional: true, label: 'Phone number' }),
};
export const joinSchema = {
  name: str(1, 40, { label: 'Your name' }),
  phone: str(8, 20, { pattern: PHONE, optional: true, label: 'Phone number' }),
};
export const payoutSchema = { destination: str(5, 2000, { label: 'Invoice or Lightning address' }) };
export const askSchema = { question: str(1, 500, { label: 'Question' }), lang: oneOf(['fr', 'wo', 'en'], { optional: true }) };
export const devPaySchema = { paymentHash: str(64, 64, { pattern: /^[0-9a-f]{64}$/ }) };
export const devInvoiceSchema = { amountSats: int(1, 1_000_000_000) };
