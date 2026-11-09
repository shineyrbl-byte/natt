// Natt Helper's built-in answers (no AI, works offline), and the privacy-safe
// group summary the AI sees. Shared by the server and the browser-only demo.

export function summarize(view, xofPerSat) {
  const fcfa = (sats) => Math.round(sats * xofPerSat);
  const recipient = view.members.find((m) => m.id === view.round?.recipientId);
  return {
    group: view.name,
    status: view.status,
    contribution: { sats: view.contributionSats, fcfa: fcfa(view.contributionSats), frequency: view.frequency },
    pot: { sats: view.potSats, fcfa: fcfa(view.potSats) },
    you: view.you && { name: view.you.name, yourTurnNumber: view.you.position, isOrganizer: view.you.isOrganizer },
    currentRound: view.round && {
      number: view.round.number,
      totalRounds: view.members.length,
      receiver: recipient?.name,
      paid: view.members.filter((m) => m.paidThisRound).map((m) => m.name),
      notYetPaid: view.members.filter((m) => !m.paidThisRound).map((m) => m.name),
      youPaid: view.members.find((m) => m.id === view.you?.id)?.paidThisRound ?? false,
    },
    payoutOrder: view.members.filter((m) => m.position).map((m) => `${m.position}. ${m.name}`),
    roundsDone: view.history.length,
  };
}

// Offline answers for the questions people ask most, in fr / wo / en.
const ANSWERS = {
  fr: {
    forming: (s) => `Le groupe n'a pas encore commencé. ${s.members} membre(s) sur ${s.max}. L'organisateur lance le tirage au sort quand tout le monde est là.`,
    completed: () => 'Ce natt est terminé : chaque membre a reçu la cagnotte une fois. Jërëjëf !',
    yourTurn: (s) => `C'est votre tour ! Vous recevez ${s.sats} sats (~${s.fcfa} FCFA) quand tout le monde a payé.`,
    alreadyReceived: (s) => `Vous avez déjà reçu la cagnotte au tour ${s.turn}.`,
    turnLater: (s) => `Votre tour est le n°${s.turn}. Encore ${s.left} tour(s) avant vous.`,
    allPaid: () => 'Tout le monde a payé ce tour. Bravo !',
    notPaid: (s) => `Pas encore payé : ${s.names}.${s.youPaid ? '' : ' Vous non plus : appuyez sur « Payer ».'}`,
    bitcoin: () => 'Les sats sont de petites unités de bitcoin. Lightning permet de payer en quelques secondes depuis une appli comme Wallet of Satoshi, Phoenix ou Blink : scannez le code QR et confirmez.',
    status: (s) => `Tour ${s.round}/${s.total}. ${s.receiver} reçoit la cagnotte de ${s.sats} sats (~${s.fcfa} FCFA). ${s.paid} membre(s) ont payé.`,
  },
  // Draft Wolof: to be reviewed by a native speaker (see public/i18n.js).
  wo: {
    forming: (s) => `Mbootaay bi tambaliwul. ${s.members} ci ${s.max} ñoo bokk. Ki yor natt bi dina tambali tegg bi bu ñépp ñëwee.`,
    completed: () => 'Natt bi jeex na : ku nekk jot na xaalis bi benn yoon. Jërëjëf !',
    yourTurn: (s) => `Sa wër la ! Dinga jot ${s.sats} sats (~${s.fcfa} FCFA) bu ñépp feyee.`,
    alreadyReceived: (s) => `Jot nga xaalis bi ci wër ${s.turn}.`,
    turnLater: (s) => `Sa wër mooy ${s.turn}. Des na ${s.left} wër laata sa wër di agsi.`,
    allPaid: () => 'Ñépp fey nañu ci wër bii. Jërëjëf !',
    notPaid: (s) => `Feyaguñu : ${s.names}.${s.youPaid ? '' : ' Yaw itam feyagoo : bësal « Fey ».'}`,
    bitcoin: () => 'Sats yi ay xaaj yu tuuti lañu ci bitcoin. Lightning dafay tax nga fey ci ay saa yu gàtt ak appli ni Wallet of Satoshi, Phoenix walla Blink : skane QR kod bi te nga dëggal.',
    status: (s) => `Wër ${s.round}/${s.total}. ${s.receiver} mooy jot xaalis bi : ${s.sats} sats (~${s.fcfa} FCFA). ${s.paid} nit fey nañu.`,
  },
  en: {
    forming: (s) => `The group has not started yet. ${s.members} of ${s.max} members. The organizer starts the draw when everyone has joined.`,
    completed: () => 'This natt is finished: every member received the pot once. Jërëjëf!',
    yourTurn: (s) => `It's your turn! You receive ${s.sats} sats (~${s.fcfa} FCFA) once everyone has paid.`,
    alreadyReceived: (s) => `You already received the pot in round ${s.turn}.`,
    turnLater: (s) => `Your turn is number ${s.turn}. ${s.left} more round(s) before you.`,
    allPaid: () => 'Everyone has paid this round. Well done!',
    notPaid: (s) => `Not paid yet: ${s.names}.${s.youPaid ? '' : ' That includes you: tap "Pay".'}`,
    bitcoin: () => 'Sats are small units of bitcoin. Lightning lets you pay in seconds from an app like Wallet of Satoshi, Phoenix or Blink: scan the QR code and confirm.',
    status: (s) => `Round ${s.round}/${s.total}. ${s.receiver} receives the pot of ${s.sats} sats (~${s.fcfa} FCFA). ${s.paid} member(s) have paid.`,
  },
};

export function builtInAnswer(view, question, lang, xofPerSat) {
  const A = ANSWERS[lang] ?? ANSWERS.fr;
  if (view.status === 'forming') return A.forming({ members: view.members.length, max: view.maxMembers });
  if (view.status === 'completed') return A.completed();

  const s = summarize(view, xofPerSat);
  const q = question.toLowerCase();
  const r = s.currentRound;
  const pot = { sats: s.pot.sats, fcfa: s.pot.fcfa };

  if (/tour|turn|quand|when|ordre|order|wër|kañ/.test(q)) {
    const left = s.you.yourTurnNumber - r.number;
    if (left === 0) return A.yourTurn(pot);
    if (left < 0) return A.alreadyReceived({ turn: s.you.yourTurnNumber });
    return A.turnLater({ turn: s.you.yourTurnNumber, left });
  }
  if (/pay|paid|retard|late|qui|who|fey|kan|ñan/.test(q)) {
    if (!r.notYetPaid.length) return A.allPaid();
    return A.notPaid({ names: r.notYetPaid.join(', '), youPaid: r.youPaid });
  }
  if (/bitcoin|lightning|sats?|wallet|portefeuille/.test(q)) return A.bitcoin();
  return A.status({ ...pot, round: r.number, total: r.totalRounds, receiver: r.receiver, paid: r.paid.length });
}
