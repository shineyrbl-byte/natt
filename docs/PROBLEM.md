# The problem

## Who we build for

**Primary user: Awa, 34, sells fabric at Marché HLM in Dakar.** She is in two
*natt* (tontines): one with 12 other vendors (5,000 FCFA every week) and one
with her family abroad (25,000 FCFA every month).

Tontines are everywhere in West Africa. Studies estimate that a large share of
adults in Senegal, Côte d'Ivoire, Cameroon and Benin take part in at least one.
They work because they rely on trust between people who know each other.

## What goes wrong today

| Pain | Today | With Natt |
|---|---|---|
| **Cash handling** | The organizer (*bëkk-néeg*) collects cash door to door, carries it, and can lose it or be robbed. | Each member pays a Lightning invoice from their phone. No cash moves. |
| **Trust in the organizer** | Records live in a paper notebook. Disputes ("I paid!") are common and an organizer can disappear with the pot. | Every payment produces a receipt signed with the group's Nostr key and published to relays. Anyone can check the ledger. |
| **Diaspora members** | Family abroad pays through remittance services that take 5–10 % and days. | Lightning payments arrive in seconds for a tiny fee, from anywhere. |
| **Late payments** | The organizer has to chase people one by one. | Natt shows who has paid this round and the AI drafts polite reminders. |
| **Understanding** | Bitcoin feels like jargon. | The assistant answers "C'est quand mon tour ?" in plain words. |

## Reach (estimate)

- One organizer typically runs 1–3 groups of 10–20 members.
- One market has dozens of tontines. A pilot with **10 organizers at one
  market = ~200 members and ~200 Lightning payments per week**.

## Metrics we will track

- Groups created / active groups per week
- Contributions paid on time (%) per round
- Median time from invoice to payment
- Disputes raised (target: 0 unresolved, since the ledger is public)
- Payouts completed vs. scheduled
