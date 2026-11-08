// The tontine engine: groups, members, payout order, rounds,
// contributions and payouts. Money only moves through the wallet
// adapter and every money event is written to the Nostr ledger.
import { randomBytes, randomUUID, createHash, timingSafeEqual, randomInt } from 'node:crypto';
import { tx } from './db.js';
import { badRequest, unauthorized, forbidden, notFound, conflict } from './errors.js';
import { decodeInvoice, isLightningAddress, invoiceFromAddress } from './lightning/index.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(16).toString('base64url'); // 128 bits
const newGroupId = () => randomBytes(6).toString('base64url'); // invite code

// Fisher–Yates with a cryptographic RNG: the "tirage au sort".
function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createTontine({ db, wallet, ledger, now = () => Date.now() }) {
  const q = {
    group: db.prepare('SELECT * FROM groups WHERE id = ?'),
    members: db.prepare('SELECT * FROM members WHERE group_id = ? ORDER BY COALESCE(payout_position, 999), joined_at, rowid'),
    member: db.prepare('SELECT * FROM members WHERE id = ? AND group_id = ?'),
    round: db.prepare('SELECT * FROM rounds WHERE group_id = ? AND number = ?'),
    rounds: db.prepare('SELECT * FROM rounds WHERE group_id = ? ORDER BY number'),
    contributions: db.prepare('SELECT * FROM contributions WHERE round_id = ?'),
    contribution: db.prepare('SELECT * FROM contributions WHERE round_id = ? AND member_id = ?'),
    insertGroup: db.prepare('INSERT INTO groups (id, name, contribution_sats, frequency, max_members) VALUES (?, ?, ?, ?, ?)'),
    setOrganizer: db.prepare('UPDATE groups SET organizer_id = ? WHERE id = ?'),
    insertMember: db.prepare('INSERT INTO members (id, group_id, name, phone, token_hash) VALUES (?, ?, ?, ?, ?)'),
    setPosition: db.prepare('UPDATE members SET payout_position = ? WHERE id = ?'),
    activate: db.prepare("UPDATE groups SET status = 'active', current_round = ? WHERE id = ?"),
    complete: db.prepare("UPDATE groups SET status = 'completed' WHERE id = ?"),
    insertRound: db.prepare('INSERT INTO rounds (id, group_id, number, recipient_id) VALUES (?, ?, ?, ?)'),
    roundStatus: db.prepare('UPDATE rounds SET status = ? WHERE id = ? AND status = ?'),
    roundPaid: db.prepare("UPDATE rounds SET status = 'paid', payout_payment_hash = ?, paid_at = datetime('now') WHERE id = ?"),
    insertContribution: db.prepare('INSERT INTO contributions (id, round_id, member_id, amount_sats, payment_hash, bolt11) VALUES (?, ?, ?, ?, ?, ?)'),
    deleteContribution: db.prepare("DELETE FROM contributions WHERE id = ? AND status = 'pending'"),
    markPaid: db.prepare("UPDATE contributions SET status = 'paid', paid_at = datetime('now') WHERE id = ? AND status = 'pending'"),
  };

  function getGroup(groupId) {
    const group = q.group.get(String(groupId));
    if (!group) throw notFound();
    return group;
  }

  function addMember(groupId, name, phone) {
    const token = newToken();
    const member = { id: randomUUID(), group_id: groupId, name, phone: phone || null };
    q.insertMember.run(member.id, groupId, name, member.phone, hashToken(token));
    return { member, token };
  }

  function currentRound(group) {
    return group.current_round ? q.round.get(group.id, group.current_round) : null;
  }

  function openRound(group, number) {
    const recipient = q.members.all(group.id).find((m) => m.payout_position === number);
    q.insertRound.run(randomUUID(), group.id, number, recipient.id);
    q.activate.run(number, group.id);
  }

  const api = {
    createGroup({ name, contributionSats, frequency, maxMembers, organizerName, organizerPhone }) {
      return tx(db, () => {
        const id = newGroupId();
        q.insertGroup.run(id, name, contributionSats, frequency, maxMembers);
        const { member, token } = addMember(id, organizerName, organizerPhone);
        q.setOrganizer.run(member.id, id);
        ledger.record(id, 'group', {
          content: `Natt group created: ${contributionSats} sats ${frequency}, up to ${maxMembers} members.`,
          tags: [['amount', String(contributionSats)], ['frequency', frequency]],
        });
        return { groupId: id, memberId: member.id, token };
      });
    },

    joinGroup(groupId, { name, phone }) {
      return tx(db, () => {
        const group = getGroup(groupId);
        if (group.status !== 'forming') throw conflict('This group has already started. Ask the organizer to create a new one.');
        if (q.members.all(group.id).length >= group.max_members) throw conflict('This group is full.');
        const { member, token } = addMember(group.id, name, phone);
        return { groupId: group.id, memberId: member.id, token };
      });
    },

    authenticate(groupId, memberId, token) {
      const member = q.member.get(String(memberId || ''), String(groupId));
      if (!member || typeof token !== 'string') throw unauthorized();
      const a = Buffer.from(member.token_hash, 'hex');
      const b = Buffer.from(hashToken(token), 'hex');
      if (!timingSafeEqual(a, b)) throw unauthorized();
      return member;
    },

    // Organizer starts the group: random draw of payout order, round 1 opens.
    startGroup(groupId, member) {
      return tx(db, () => {
        const group = getGroup(groupId);
        if (group.organizer_id !== member.id) throw forbidden('Only the organizer can start the group.');
        if (group.status !== 'forming') throw conflict('The group has already started.');
        const members = q.members.all(group.id);
        if (members.length < 2) throw badRequest('You need at least 2 members to start.');

        shuffle(members).forEach((m, i) => q.setPosition.run(i + 1, m.id));
        ledger.record(group.id, 'start', {
          content: `Draw done. ${members.length} members, payout order fixed. Pot per round: ${group.contribution_sats * members.length} sats.`,
          tags: [['members', String(members.length)]],
        });
        openRound(group, 1);
        return api.view(group.id, member);
      });
    },

    // Get (or create) this member's invoice for the current round.
    async getInvoice(groupId, member) {
      const group = getGroup(groupId);
      const round = currentRound(group);
      if (group.status !== 'active' || !round) throw conflict('There is no open round right now.');

      const existing = q.contribution.get(round.id, member.id);
      if (existing?.status === 'paid') return { paid: true };
      if (existing && decodeInvoice(existing.bolt11).expiresAt > now() + 60_000) {
        return { paid: false, bolt11: existing.bolt11, paymentHash: existing.payment_hash, amountSats: existing.amount_sats };
      }

      const memo = `Natt ${group.name} - round ${round.number}`.slice(0, 100);
      const inv = await wallet.createInvoice({ amountSats: group.contribution_sats, memo });
      tx(db, () => {
        if (existing) q.deleteContribution.run(existing.id);
        q.insertContribution.run(randomUUID(), round.id, member.id, group.contribution_sats, inv.paymentHash, inv.bolt11);
      });
      return { paid: false, bolt11: inv.bolt11, paymentHash: inv.paymentHash, amountSats: group.contribution_sats };
    },

    // Ask the Lightning backend which pending invoices are settled.
    // Only the backend can mark a payment as paid (threat model T2).
    async syncPayments(groupId) {
      const group = getGroup(groupId);
      const round = currentRound(group);
      if (!round || round.status !== 'collecting') return 0;
      const members = q.members.all(group.id);
      let newlyPaid = 0;
      for (const c of q.contributions.all(round.id)) {
        if (c.status !== 'pending' || !(await wallet.isPaid(c.payment_hash))) continue;
        tx(db, () => {
          if (q.markPaid.run(c.id).changes !== 1) return;
          const pos = members.find((m) => m.id === c.member_id).payout_position;
          ledger.record(group.id, 'contribution', {
            content: `Round ${round.number}: member #${pos} paid ${c.amount_sats} sats.`,
            tags: [['round', String(round.number)], ['member', String(pos)], ['amount', String(c.amount_sats)], ['payment_hash', c.payment_hash]],
          });
          newlyPaid++;
        });
      }
      return newlyPaid;
    },

    // The round's recipient claims the pot to an invoice or Lightning address.
    async claimPayout(groupId, member, destination) {
      await api.syncPayments(groupId);
      const group = getGroup(groupId);
      const round = currentRound(group);
      if (!round || group.status !== 'active') throw conflict('There is no open round right now.');
      if (round.recipient_id !== member.id) throw forbidden("It is not your turn to receive the pot.");
      if (round.status !== 'collecting') throw conflict('This payout is already in progress or done.');

      const members = q.members.all(group.id);
      const paid = q.contributions.all(round.id).filter((c) => c.status === 'paid');
      if (paid.length < members.length) {
        throw conflict(`Waiting for ${members.length - paid.length} member(s) to pay before the pot can be sent.`);
      }
      const pot = paid.reduce((sum, c) => sum + c.amount_sats, 0);

      let bolt11 = String(destination || '').trim();
      if (isLightningAddress(bolt11)) bolt11 = await invoiceFromAddress(bolt11, pot);
      let decoded;
      try {
        decoded = decodeInvoice(bolt11);
      } catch {
        throw badRequest('That is not a valid Lightning invoice or address.');
      }
      if (decoded.amountSats !== pot) throw badRequest(`The invoice must be for exactly ${pot} sats.`);
      if (decoded.expiresAt < now()) throw badRequest('That invoice has expired. Please create a new one.');

      // Lock the round so a retry can't pay twice (threat model T11).
      if (q.roundStatus.run('paying', round.id, 'collecting').changes !== 1) throw conflict('This payout is already in progress.');
      let result;
      try {
        result = await wallet.payInvoice(bolt11);
      } catch (err) {
        q.roundStatus.run('collecting', round.id, 'paying');
        throw badRequest(`Payout failed: ${err.message}`);
      }

      return tx(db, () => {
        q.roundPaid.run(result.paymentHash, round.id);
        const pos = q.member.get(member.id, group.id).payout_position;
        ledger.record(group.id, 'payout', {
          content: `Round ${round.number}: member #${pos} received the pot of ${pot} sats.`,
          tags: [['round', String(round.number)], ['member', String(pos)], ['amount', String(pot)], ['payment_hash', result.paymentHash]],
        });
        if (round.number >= members.length) {
          q.complete.run(group.id);
          ledger.record(group.id, 'complete', { content: 'All rounds done. Every member received the pot once. Jërëjëf!' });
        } else {
          openRound(group, round.number + 1);
        }
        return { pot, round: round.number };
      });
    },

    // Everything the app screen needs. Phone numbers are only shown to the organizer.
    view(groupId, viewer) {
      const group = getGroup(groupId);
      const members = q.members.all(group.id);
      const round = currentRound(group);
      const contributions = round ? q.contributions.all(round.id) : [];
      const isOrganizer = viewer?.id === group.organizer_id;
      const paidIds = new Set(contributions.filter((c) => c.status === 'paid').map((c) => c.member_id));

      return {
        id: group.id,
        name: group.name,
        status: group.status,
        contributionSats: group.contribution_sats,
        frequency: group.frequency,
        maxMembers: group.max_members,
        potSats: group.contribution_sats * members.length,
        nostrPubkey: ledger.pubkey(group.id).npub,
        you: viewer ? { id: viewer.id, name: viewer.name, isOrganizer, position: q.member.get(viewer.id, group.id).payout_position } : null,
        members: members.map((m) => ({
          id: m.id,
          name: m.name,
          position: m.payout_position,
          isOrganizer: m.id === group.organizer_id,
          paidThisRound: paidIds.has(m.id),
          ...(isOrganizer && m.phone ? { phone: m.phone } : {}),
        })),
        round: round
          ? {
              number: round.number,
              status: round.status,
              recipientId: round.recipient_id,
              paidCount: paidIds.size,
            }
          : null,
        history: q.rounds.all(group.id).filter((r) => r.status === 'paid').map((r) => ({ number: r.number, recipientId: r.recipient_id, paidAt: r.paid_at })),
      };
    },
  };

  return api;
}
