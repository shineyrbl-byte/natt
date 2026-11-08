# Threat model

Scope: the Natt MVP (server, PWA, Lightning adapter, Nostr ledger, AI helper).

## Assets

1. Funds in the group's Lightning wallet (between collection and payout)
2. The Lightning backend admin key (LNbits)
3. The group's Nostr signing key (its signatures are the ledger)
4. Member data: display names and optional phone numbers (PII)
5. Integrity of the payment record

## Threats and mitigations

| # | Threat | Mitigation in the MVP |
|---|---|---|
| T1 | Attacker steals the Lightning admin key | Keys only come from environment variables, never from the database, API responses or logs. The server uses the *invoice key* for creating invoices and the *admin key* only for payouts. |
| T2 | A member claims a payment they did not make | A contribution is marked paid only after the Lightning backend confirms the invoice is settled. The client never says "paid". |
| T3 | Organizer pays the pot to themselves out of turn | The payout recipient comes from the payout order fixed when the group starts. The API refuses payouts to anyone else and refuses payout before every member has paid. |
| T4 | Organizer edits history | Every contribution and payout is a Nostr event signed by the group key and sent to public relays. Members can compare the app with the relays. |
| T5 | Payout to an attacker invoice for a larger amount | The server decodes the payout invoice and checks that its amount equals the pot (or the invoice has no amount and we set it). |
| T6 | Injection / malformed input | All request bodies are validated against strict schemas (types, lengths, ranges). SQL uses prepared statements only. |
| T7 | Brute force / abuse | Per-IP rate limiting on the API. Per-member secret tokens (random 128-bit) are required for member actions; only their hash is stored. |
| T8 | PII leaks via logs | The logger redacts phone numbers, tokens, invoices and keys. Request logs keep method, path and status only. |
| T9 | XSS in the web app | The frontend never uses `innerHTML` with user data. Strict Content-Security-Policy (`default-src 'self'`). |
| T10 | Prompt injection through group names sent to the AI | The AI only receives a structured summary, has no tools, and cannot move funds. Its output is shown as plain text. |
| T11 | Double payout on retry | Payout is guarded by a database state transition (`open → paying → paid`) inside a transaction. |

## Out of scope for the MVP (roadmap)

- Removing custody (per-member hold invoices, or a 2-of-3 multisig on-chain pot)
- Hardware-backed key storage for the group Nostr key
- Formal audit
