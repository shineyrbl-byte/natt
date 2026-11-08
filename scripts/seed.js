// Demo data: a market tontine in Dakar, mid-way through round 1.
// Run with `npm run demo` (fresh database + seed + server).
import { log } from '../src/logger.js';

const PEOPLE = [
  { name: 'Awa', phone: '+221 77 123 45 67' },
  { name: 'Fatou' },
  { name: 'Moussa', phone: '+221 76 555 12 34' },
  { name: 'Aminata' },
  { name: 'Ibrahima' },
];

export async function seedDemo({ tontine, wallet, baseUrl }) {
  const org = tontine.createGroup({
    name: 'Natt Marché HLM',
    contributionSats: 10_000,
    frequency: 'weekly',
    maxMembers: 5,
    organizerName: PEOPLE[0].name,
    organizerPhone: PEOPLE[0].phone,
  });
  const gid = org.groupId;
  const all = [org, ...PEOPLE.slice(1).map((p) => tontine.joinGroup(gid, p))];
  const members = all.map((m) => tontine.authenticate(gid, m.memberId, m.token));

  tontine.startGroup(gid, members[0]);
  // Three of five members have already paid round 1.
  for (const m of members.slice(0, 3)) {
    const inv = await tontine.getInvoice(gid, m);
    wallet.markPaid(inv.paymentHash);
  }
  await tontine.syncPayments(gid);

  const view = tontine.view(gid);
  const links = all.map((m, i) => {
    const pos = view.members.find((x) => x.id === m.memberId).position;
    return { name: PEOPLE[i].name, position: pos, url: `${baseUrl}/#/g/${gid}?m=${m.memberId}&t=${m.token}` };
  });
  return { groupId: gid, links };
}

export function printDemo({ groupId, links }) {
  const lines = [
    '',
    '  ⚡ Natt demo ready',
    `  Group "Natt Marché HLM" (code ${groupId}), round 1, 3 of 5 paid.`,
    '  Open each member in a different browser profile or private window:',
    '',
    ...links.sort((a, b) => a.position - b.position).map((l) => `   #${l.position} ${l.name.padEnd(9)} ${l.url}`),
    '',
  ];
  // Printed directly (not through the redacting logger) so the links work.
  console.log(lines.join('\n'));
  log.info('Demo data seeded');
}
