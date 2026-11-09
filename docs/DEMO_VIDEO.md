# Demo video script (3 minutes)

Recorded on the live demo, **https://shineyrbl-byte.github.io/natt/**. About 400 words of
voiceover, read at a calm pace. Lines in *italics* are what you say; the
rest is what you do on screen.

## Before you record

1. **Reset the demo** so it starts at 3 of 5 paid: on the home page, tap
   **↺ Recommencer la démo** (Start the demo again).
2. **Note who is #1.** The payout order is drawn at random on every reset.
   Open any member and look at the list: the person at position 1 receives
   the pot in round 1. Aminata and Ibrahima are always the two who haven't
   paid; Awa is always the organizer.
   If #1 is Aminata or Ibrahima, that's fine: they pay first, then claim.
3. **Phone-sized window.** In Chrome, open DevTools → device toolbar →
   iPhone 12 Pro (390 px wide), zoom 100 %. Or record on a real phone.
4. **Language:** start in French. If the app opens in English, tap the
   language button until it shows French.
5. The browser demo uses the helper's built-in answers, labelled "Réponse
   automatique". Claude answers need the server version with
   `ANTHROPIC_API_KEY` set (type it yourself; never paste it into a chat or
   a commit).
6. To switch member: tap **⚡ Natt** (top left) to go home, then tap the next
   name under **🧪 Essayer la démo**.

---

## 0:00 – 0:25 · The problem

**Screen:** home page of Natt in French.

*"In Senegal, many people save through a natt, a tontine. Everyone
puts in the same amount each week, and one person takes the whole pot, until
everyone has had a turn.*

*It works, but it runs on cash and trust. The organizer carries the money,
the records are in a notebook, and when the pot goes missing, there's no
proof of who paid. Family abroad can't easily join in."*

## 0:25 – 0:45 · The idea

**Screen:** stay on the home page; slowly scroll past the hero text.

*"Natt keeps the tontine people already trust, and puts it on Bitcoin
Lightning. Members pay from their phone, the payout order is drawn fairly,
and every payment becomes a signed receipt on Nostr that nobody can change.
It's in French, Wolof and English."*

## 0:45 – 1:10 · The organizer's view

**Screen:** tap **Awa**. Show round 1, the pot (50 000 sats ≈ FCFA) and the
progress bar at 3 of 5. Scroll to the member list.

*"This is Awa, the organizer of a market natt at Marché HLM: five members,
10,000 sats each per week. The pot is shown in sats and in FCFA, using a live
bitcoin price.*

*Three of five have paid. Aminata and Ibrahima haven't, so Awa taps the
bell, and WhatsApp opens with a polite reminder, ready to send."*

**Screen:** point at (or tap) the 🔔 next to Aminata. If WhatsApp opens, show
the drafted message for a second, then close it without sending.

## 1:10 – 1:40 · A member pays

**Screen:** home → tap **Aminata** → tap **Payer 10 000 sats**. Show the QR
code. Then tap **Démo : simuler le paiement**. Wait for the
"Paiement reçu. Jërëjëf !" message and the bar moving to 4 of 5.

*"Now I'm Aminata. I tap Pay and get a Lightning QR code. In real life, I'd
scan it with any Lightning wallet, like Wallet of Satoshi or Phoenix, from
Dakar or from Paris. Here the demo wallet pays it for me.*

*Paid in seconds: four of five."*

**Screen:** home → tap **Ibrahima** → pay the same way → 5 of 5.

*"Ibrahima pays too. Everyone is in."*

## 1:40 – 2:05 · The guarded payout

**Screen:** home → tap the **#1 member**. Show "C'est votre tour ! 🎉". Tap
**Démo : créer une facture test**, then **💰 Recevoir la cagnotte**. Show
"Cagnotte envoyée" and round 2 opening.

*"It's [name]'s turn. The pot only goes to the person whose turn it is, only
after everyone has paid, and only to an invoice for the exact amount, or a
Lightning address. [Name] taps Receive, and 50,000 sats are sent. Round two
opens automatically."*

## 2:05 – 2:25 · Nobody can cheat

**Screen:** scroll down and open **🔏 Registre public (Nostr)**. Show the
green "Vérifié : … reçus signés, aucune modification".

*"Every payment and payout is a Nostr event, signed with the group's key and
linked to the one before it. Anyone with the group code can check this
ledger. If someone edits or deletes a receipt, the chain breaks and the app
shows it."*

## 2:25 – 2:45 · Wolof and Natt Helper

**Screen:** tap the language button once to switch to **Wolof**. Scroll to
**Natt Helper**, type « Kañ la sama wër ? » and tap **Laaj**. Show the answer.

*"Natt speaks Wolof too. And Natt Helper answers simple questions, like
'When is my turn?', in the member's language. It only sees first names and
payment status, never phone numbers, and it can't move money."*

## 2:45 – 3:00 · Close

**Screen:** back to the home page, or the GitHub README with the live link.

*"Natt is open source and runs with one command. Next: hold invoices so the
server holds less money, Nostr login, and a pilot with organizers at Marché
HLM. Natt: the tontine you know, without the cash and without the doubt.
Jërëjëf."*

---

## Recording tips

- Do one full practice run first, then reset the demo (step 1) before the
  real take.
- Record the screen and the voice separately if that's easier; it's simpler
  to fix timing in the edit.
- Keep the cursor still while you talk; move it only to tap.
- Add captions: many judges watch without sound, and it helps non-French
  speakers follow the French screens.
- If you go over 3 minutes, cut the Ibrahima payment (say "and once everyone
  has paid…") and the WhatsApp part first.
