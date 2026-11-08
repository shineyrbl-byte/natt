// Natt web app. Plain JS, no framework, no innerHTML with user data
// (docs/THREAT_MODEL.md, T9). Secrets live in this device's storage only.
import qrcode from '/vendor/qrcode.mjs';
import { STRINGS } from '/i18n.js';

// ---------- small helpers ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: keep going without saving */
    }
  },
};

const LANGS = ['fr', 'wo', 'en'];
const detected = navigator.language?.startsWith('wo') ? 'wo' : navigator.language?.startsWith('en') ? 'en' : 'fr';
let lang = LANGS.includes(store.get('lang')) ? store.get('lang') : detected;
// Wolof speakers in Senegal read numbers the French way.
const locale = () => (lang === 'en' ? 'en-US' : 'fr-FR');
let config = { xofPerSat: 0.55, demo: false, ai: false };
let pollTimer = null;

function t(key, vars = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.fr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

const fcfa = (sats) => Math.round(sats * config.xofPerSat).toLocaleString(locale());
const num = (n) => Number(n).toLocaleString(locale());

// Build DOM nodes safely: text always goes through textContent.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren() would print null as text, so skip empty parts.
function setChildren(el, ...nodes) {
  el.replaceChildren(...nodes.flat().filter(Boolean));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3500);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
  } catch {
    window.prompt('', text); // fallback for old browsers
  }
}

async function api(method, path, body, auth) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) Object.assign(headers, { 'x-member-id': auth.memberId, 'x-member-token': auth.token });
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(t('offline'));
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || t('error'));
    err.status = res.status;
    throw err;
  }
  return json;
}

// Wrap a button action: disable while running, show errors nicely.
function action(fn, errorEl) {
  return async (e) => {
    e?.preventDefault();
    const btn = e?.submitter || e?.currentTarget;
    if (btn?.tagName === 'BUTTON') btn.disabled = true;
    if (errorEl) errorEl.textContent = '';
    try {
      await fn(e);
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
      else toast(err.message);
    } finally {
      if (btn?.tagName === 'BUTTON') btn.disabled = false;
    }
  };
}

function qrNode(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text.toUpperCase()); // uppercase = smaller QR for bech32
  qr.make();
  const box = h('div', { class: 'qr', role: 'img', 'aria-label': 'QR code' });
  const tpl = document.createElement('template');
  // Output of the QR library only (no user text), so this is safe.
  tpl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  box.append(tpl.content);
  return box;
}

// ---------- saved memberships ----------

const groups = () => store.get('groups', {});
function saveMembership(groupId, data) {
  const all = groups();
  all[groupId] = { ...all[groupId], ...data };
  store.set('groups', all);
}
const secretLink = (gid, m) => `${location.origin}/#/g/${gid}?m=${encodeURIComponent(m.memberId)}&t=${encodeURIComponent(m.token)}`;

// ---------- views ----------

const app = () => document.getElementById('app');

function field(label, input, hint) {
  return h('div', { class: 'field' }, h('label', { for: input.id }, label, hint ? h('span', { class: 'hint' }, ` (${hint})`) : null), input);
}

function demoBanner() {
  return config.demo ? h('p', { class: 'banner' }, '🧪 ', t('demoBanner')) : null;
}

function viewHome() {
  const mine = Object.entries(groups());
  const codeInput = h('input', { id: 'code', name: 'code', autocomplete: 'off', autocapitalize: 'none', maxlength: '120', required: true, placeholder: 'ab12CD34' });
  const err = h('p', { class: 'error', role: 'alert' });

  return [
    h('section', { class: 'hero' }, h('div', { class: 'big', 'aria-hidden': 'true' }, '🤝⚡'), h('h1', {}, t('tagline')), h('p', { class: 'muted' }, t('heroText'))),
    demoBanner(),
    h('a', { class: 'btn', href: '#/create' }, '＋ ', t('create')),
    h(
      'form',
      {
        class: 'card stack',
        onsubmit: action(() => {
          // Accept a bare code or a full invite link.
          const raw = codeInput.value.trim();
          const code = (raw.match(/([A-Za-z0-9_-]{8})\/?$/) || [])[1];
          if (!code) throw new Error(t('notFound'));
          location.hash = `#/join/${code}`;
        }, err),
      },
      h('h2', {}, t('join')),
      field(t('code'), codeInput, t('codeHint')),
      err,
      h('button', { type: 'submit', class: 'secondary' }, t('continue')),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, t('myGroups')),
      mine.length
        ? h('ul', { class: 'members' }, mine.map(([gid, g]) => h('li', {}, h('span', { class: 'pos' }, '⚡'), h('a', { class: 'name', href: `#/g/${gid}` }, g.name || gid))))
        : h('p', { class: 'muted' }, t('noGroups')),
    ),
  ];
}

function viewCreate() {
  const f = {
    name: h('input', { id: 'name', required: true, minlength: '2', maxlength: '60', placeholder: t('groupNameHint') }),
    contributionSats: h('input', { id: 'sats', type: 'number', inputmode: 'numeric', min: '100', max: '10000000', step: '1', value: '10000', required: true }),
    frequency: h('select', { id: 'freq' }, h('option', { value: 'weekly' }, t('weekly')), h('option', { value: 'monthly' }, t('monthly'))),
    maxMembers: h('input', { id: 'max', type: 'number', inputmode: 'numeric', min: '2', max: '50', value: '10', required: true }),
    organizerName: h('input', { id: 'you', required: true, maxlength: '40', autocomplete: 'given-name' }),
    organizerPhone: h('input', { id: 'phone', type: 'tel', maxlength: '20', autocomplete: 'tel', placeholder: '+221 77 123 45 67' }),
  };
  const approx = h('p', { class: 'hint', 'aria-live': 'polite' });
  const updateApprox = () => (approx.textContent = t('approx', { fcfa: fcfa(Number(f.contributionSats.value) || 0) }));
  f.contributionSats.addEventListener('input', updateApprox);
  updateApprox();
  const err = h('p', { class: 'error', role: 'alert' });

  return [
    h('h1', {}, t('create')),
    demoBanner(),
    h(
      'form',
      {
        class: 'card',
        onsubmit: action(async () => {
          const body = {
            name: f.name.value,
            contributionSats: Number(f.contributionSats.value),
            frequency: f.frequency.value,
            maxMembers: Number(f.maxMembers.value),
            organizerName: f.organizerName.value,
          };
          if (f.organizerPhone.value.trim()) body.organizerPhone = f.organizerPhone.value;
          const res = await api('POST', '/groups', body);
          saveMembership(res.groupId, { memberId: res.memberId, token: res.token, name: body.name });
          location.hash = `#/g/${res.groupId}`;
        }, err),
      },
      field(t('groupName'), f.name),
      field(t('contribution'), f.contributionSats),
      approx,
      field(t('frequency'), f.frequency),
      field(t('members'), f.maxMembers),
      field(t('yourName'), f.organizerName),
      field(t('phone'), f.organizerPhone, t('phoneHint')),
      err,
      h('p', {}, h('button', { type: 'submit' }, t('createBtn'))),
    ),
  ];
}

async function viewJoin(code) {
  let preview;
  try {
    preview = await api('GET', `/groups/${code}/preview`);
  } catch {
    return [h('h1', {}, t('join')), h('p', { class: 'error' }, t('notFound')), h('a', { class: 'btn secondary', href: '#/' }, '←')];
  }
  if (groups()[code]) {
    location.hash = `#/g/${code}`;
    return [];
  }
  const name = h('input', { id: 'you', required: true, maxlength: '40', autocomplete: 'given-name' });
  const phone = h('input', { id: 'phone', type: 'tel', maxlength: '20', autocomplete: 'tel', placeholder: '+221 77 123 45 67' });
  const err = h('p', { class: 'error', role: 'alert' });
  const open = preview.status === 'forming' && preview.memberCount < preview.maxMembers;

  return [
    h('h1', {}, t('joinTitle', { name: preview.name })),
    demoBanner(),
    h(
      'p',
      { class: 'muted' },
      t('joinInfo', {
        sats: num(preview.contributionSats),
        fcfa: fcfa(preview.contributionSats),
        freq: t(preview.frequency === 'weekly' ? 'perWeek' : 'perMonth'),
        count: preview.memberCount,
        max: preview.maxMembers,
      }),
    ),
    open
      ? h(
          'form',
          {
            class: 'card',
            onsubmit: action(async () => {
              const body = { name: name.value };
              if (phone.value.trim()) body.phone = phone.value;
              const res = await api('POST', `/groups/${code}/join`, body);
              saveMembership(code, { memberId: res.memberId, token: res.token, name: preview.name });
              location.hash = `#/g/${code}`;
            }, err),
          },
          field(t('yourName'), name),
          field(t('phone'), phone, t('phoneHint')),
          err,
          h('p', {}, h('button', { type: 'submit' }, t('joinBtn'))),
        )
      : h('p', { class: 'error' }, t(preview.status === 'forming' ? 'error' : 'waitStart')),
  ];
}

// ---------- group page ----------

function progressBar(pct) {
  const fill = h('span');
  fill.style.width = `${pct}%`; // set via CSSOM: inline style attributes are blocked by our CSP
  return h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
}

function statusPill(status) {
  const cls = { forming: 'warn', active: 'ok', completed: '' }[status];
  return h('span', { class: `pill ${cls}` }, t(status));
}

// WhatsApp wants international digits. Local Senegalese numbers
// (9 digits starting with 7 or 3) get the +221 country code.
function waLink(text, phone) {
  let digits = (phone || '').replace(/\D/g, '');
  if (/^[37]\d{8}$/.test(digits)) digits = `221${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const extLink = (href, attrs, ...children) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, ...children);

// Organizer only: unpaid members this round, minus the organizer.
function toRemind(v) {
  if (!v.you?.isOrganizer || v.status !== 'active') return [];
  return v.members.filter((m) => !m.paidThisRound && m.id !== v.you.id);
}

function remindText(v, m) {
  return t('remindText', { name: m.name, group: v.name, sats: num(v.contributionSats), fcfa: fcfa(v.contributionSats), n: v.round.number });
}

function memberList(v) {
  const now = v.round?.recipientId;
  const remindIds = new Set(toRemind(v).map((m) => m.id));
  return h(
    'ul',
    { class: 'members' },
    v.members.map((m) =>
      h(
        'li',
        {},
        h('span', { class: `pos ${m.id === now ? 'now' : ''}`, 'aria-label': `${t('turn')} ${m.position ?? '?'}` }, m.position ?? '·'),
        h(
          'span',
          { class: 'name' },
          m.name,
          m.id === v.you?.id ? h('span', { class: 'hint' }, ` (${t('you')})`) : null,
          m.isOrganizer ? h('span', { class: 'hint' }, ` · ${t('organizer')}`) : null,
          m.phone ? h('span', { class: 'hint' }, ` · ${m.phone}`) : null,
        ),
        v.status === 'active' ? h('span', { class: `pill ${m.paidThisRound ? 'ok' : 'warn'}` }, m.paidThisRound ? `✓ ${t('paid')}` : t('notPaid')) : null,
        remindIds.has(m.id)
          ? extLink(waLink(remindText(v, m), m.phone), { class: 'remind', title: t('remind', { name: m.name }), 'aria-label': t('remind', { name: m.name }) }, '🔔')
          : null,
      ),
    ),
  );
}

function remindGroupButton(v) {
  const late = toRemind(v);
  if (!late.length) return null;
  const text = t('remindAllText', { group: v.name, n: v.round.number, names: late.map((m) => m.name).join(', ') });
  return extLink(waLink(text), { class: 'btn secondary' }, '🔔 ', t('remindGroup'));
}

function inviteCard(v) {
  const url = `${location.origin}/#/join/${v.id}`;
  const text = t('inviteText', { name: v.name, url });
  return h(
    'section',
    { class: 'card stack' },
    h('h2', {}, t('invite')),
    h('p', {}, t('code'), ': ', h('b', { class: 'mono' }, v.id)),
    h(
      'div',
      { class: 'row' },
      navigator.share ? h('button', { type: 'button', onclick: () => navigator.share({ text }).catch(() => {}) }, t('share')) : null,
      extLink(waLink(text), { class: 'btn secondary' }, t('whatsapp')),
      h('button', { type: 'button', class: 'secondary', onclick: () => copy(url) }, t('copy')),
    ),
  );
}

function payCard(v, auth, refresh) {
  const box = h('div', { class: 'stack' });
  const me = v.members.find((m) => m.id === v.you.id);
  if (me.paidThisRound) return h('section', { class: 'card' }, h('p', { class: 'pill ok' }, t('youPaid')));

  const err = h('p', { class: 'error', role: 'alert' });
  const payBtn = h('button', { type: 'button' }, '⚡ ', t('pay', { sats: num(v.contributionSats) }));
  payBtn.addEventListener(
    'click',
    action(async () => {
      const inv = await api('POST', `/groups/${v.id}/invoice`, null, auth);
      if (inv.paid) return refresh();
      box.replaceChildren(
        h('h2', {}, t('payTitle')),
        h('p', { class: 'muted' }, `${num(inv.amountSats)} sats · ${t('approx', { fcfa: fcfa(inv.amountSats) })}`),
        qrNode(inv.bolt11),
        h('a', { class: 'btn', href: `lightning:${inv.bolt11}` }, t('openWallet')),
        h('button', { type: 'button', class: 'secondary', onclick: () => copy(inv.bolt11) }, t('copy')),
        h('p', { class: 'muted small', 'aria-live': 'polite' }, t('waitingPayment')),
        config.demo
          ? h(
              'button',
              {
                type: 'button',
                class: 'ghost',
                onclick: action(async () => {
                  await api('POST', '/dev/pay', { paymentHash: inv.paymentHash });
                  await refresh();
                }),
              },
              '🧪 ',
              t('demoPay'),
            )
          : null,
      );
    }, err),
  );
  box.append(payBtn, err);
  return h('section', { class: 'card' }, box);
}

function claimCard(v, auth, refresh) {
  const waiting = v.members.length - v.round.paidCount;
  const input = h('input', { id: 'dest', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: t('claimHint') });
  const err = h('p', { class: 'error', role: 'alert' });
  return h(
    'form',
    {
      class: 'card stack',
      onsubmit: action(async () => {
        const res = await api('POST', `/groups/${v.id}/payout`, { destination: input.value }, auth);
        toast(t('payoutDone', { sats: num(res.pot) }));
        await refresh(true);
      }, err),
    },
    h('h2', {}, t('yourTurn')),
    h('p', {}, t('claimText', { sats: num(v.potSats) })),
    waiting > 0 ? h('p', { class: 'pill warn' }, t('waitingOthers', { n: waiting })) : null,
    field(t('claimField'), input),
    config.demo
      ? h(
          'button',
          {
            type: 'button',
            class: 'ghost',
            onclick: action(async () => {
              input.value = (await api('POST', '/dev/payout-invoice', { amountSats: v.potSats })).bolt11;
            }),
          },
          '🧪 ',
          t('demoInvoice'),
        )
      : null,
    err,
    h('button', { type: 'submit', disabled: waiting > 0 }, '💰 ', t('claim')),
  );
}

async function ledgerCard(gid) {
  const card = h('details', { class: 'card' }, h('summary', {}, '🔏 ', t('ledger')));
  try {
    const l = await api('GET', `/groups/${gid}/ledger`);
    card.append(
      h('p', {}, h('span', { class: `pill ${l.verification.ok ? 'ok' : 'bad'}` }, l.verification.ok ? `✓ ${t('ledgerOk', { n: l.events.length })}` : t('ledgerBad', { problem: l.verification.problem }))),
      h('p', { class: 'muted small' }, t('ledgerHelp')),
      h('p', { class: 'small' }, t('groupKey'), ':'),
      h('p', { class: 'mono' }, l.npub),
      h(
        'ol',
        { class: 'receipts', reversed: true },
        [...l.events].reverse().map((e) => h('li', {}, e.content, h('div', { class: 'hint mono' }, new Date(e.created_at * 1000).toLocaleString(), ' · ', e.id.slice(0, 16), '…'))),
      ),
    );
  } catch (err) {
    card.append(h('p', { class: 'error' }, err.message));
  }
  return card;
}

function helperCard(gid, auth) {
  const input = h('input', { id: 'q', maxlength: '500', placeholder: t('helperHint') });
  const out = h('div', { 'aria-live': 'polite' });
  const err = h('p', { class: 'error', role: 'alert' });
  return h(
    'form',
    {
      class: 'card stack',
      onsubmit: action(async () => {
        if (!input.value.trim()) return;
        out.replaceChildren(h('p', { class: 'muted' }, '…'));
        const res = await api('POST', `/groups/${gid}/assistant`, { question: input.value, lang }, auth);
        out.replaceChildren(h('div', { class: 'chat-answer' }, res.answer), h('p', { class: 'hint' }, res.source === 'ai' ? t('aiSource') : t('builtSource')));
      }, err),
    },
    h('h2', {}, '💬 ', t('helper')),
    field(t('question'), input),
    err,
    out,
    h('button', { type: 'submit', class: 'secondary' }, t('ask')),
  );
}

async function viewGroup(gid, params) {
  // A secret link (#/g/ID?m=..&t=..) restores membership on a new phone.
  if (params.get('m') && params.get('t')) {
    saveMembership(gid, { memberId: params.get('m'), token: params.get('t') });
    history.replaceState(null, '', `#/g/${gid}`);
  }
  const auth = groups()[gid];
  if (!auth) {
    location.hash = `#/join/${gid}`;
    return [];
  }

  const live = h('div');
  const actions = h('div');
  const extras = h('div');
  let lastKey = '';

  async function refresh(force = false) {
    let v;
    try {
      v = await api('GET', `/groups/${gid}`, null, auth);
    } catch (err) {
      live.replaceChildren(h('p', { class: 'error' }, err.message));
      return;
    }
    saveMembership(gid, { name: v.name });
    const total = v.members.length;
    const pct = v.round ? Math.round((v.round.paidCount / total) * 100) : 0;
    const receiver = v.members.find((m) => m.id === v.round?.recipientId);

    setChildren(live, 
      h('h1', {}, v.name),
      h('p', {}, statusPill(v.status), ' ', h('span', { class: 'muted' }, `${num(v.contributionSats)} sats ${t(v.frequency === 'weekly' ? 'perWeek' : 'perMonth')}`)),
      demoBanner(),
      v.status === 'active'
        ? h(
            'section',
            { class: 'card' },
            h('h2', {}, t('round', { n: v.round.number, total })),
            h('div', { class: 'stat' }, h('span', {}, t('receiver')), h('b', {}, receiver?.name ?? '?')),
            h('div', { class: 'stat' }, h('span', {}, t('pot')), h('b', {}, `${num(v.potSats)} sats`)),
            h('p', { class: 'muted small' }, t('approx', { fcfa: fcfa(v.potSats) })),
            progressBar(pct),
            h('p', { class: 'small' }, t('paidCount', { paid: v.round.paidCount, total })),
          )
        : null,
      v.status === 'completed' ? h('section', { class: 'card hero' }, h('div', { class: 'big' }, '🎉'), h('p', {}, t('done'))) : null,
      h('section', { class: 'card stack' }, h('h2', {}, `👥 ${total}/${v.maxMembers}`), memberList(v), remindGroupButton(v)),
    );

    // Only rebuild the action area when the situation changes, so a
    // QR code or half-typed invoice is not wiped by the 4 s refresh.
    const me = v.members.find((m) => m.id === v.you.id);
    const key = [v.status, v.round?.number, me?.paidThisRound, v.round?.paidCount === total, lang].join('|');
    if (force || key !== lastKey) {
      lastKey = key;
      const parts = [];
      if (v.status === 'forming') {
        parts.push(inviteCard(v));
        if (v.you.isOrganizer) {
          parts.push(
            h(
              'section',
              { class: 'card stack' },
              h('p', { class: 'muted' }, t('startHint')),
              h(
                'button',
                {
                  type: 'button',
                  disabled: total < 2,
                  onclick: action(async () => {
                    await api('POST', `/groups/${gid}/start`, null, auth);
                    await refresh(true);
                  }),
                },
                '🎲 ',
                t('start'),
              ),
            ),
          );
        } else parts.push(h('p', { class: 'card muted' }, t('waitStart')));
      }
      if (v.status === 'active') {
        parts.push(payCard(v, auth, () => refresh(true)));
        if (v.round.recipientId === v.you.id) parts.push(claimCard(v, auth, refresh));
        if (me && !me.paidThisRound) toast.prevPaid = false;
      }
      if (me?.paidThisRound && toast.prevPaid === false) {
        toast(t('paidThanks'));
        toast.prevPaid = true;
      }
      actions.replaceChildren(...parts);
      extras.replaceChildren(
        await ledgerCard(gid),
        helperCard(gid, auth),
        h(
          'details',
          { class: 'card' },
          h('summary', {}, '🔑 ', t('copyMyLink')),
          h('p', { class: 'muted small' }, t('saveLink')),
          h('button', { type: 'button', class: 'secondary', onclick: () => copy(secretLink(gid, auth)) }, t('copyMyLink')),
        ),
      );
    }
  }

  await refresh(true);
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, 4000);
  return [live, actions, extras];
}

// ---------- router ----------

async function render() {
  clearInterval(pollTimer);
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const root = app();

  let nodes;
  if (parts[0] === 'create') nodes = viewCreate();
  else if (parts[0] === 'join' && parts[1]) nodes = await viewJoin(parts[1]);
  else if (parts[0] === 'g' && parts[1]) nodes = await viewGroup(parts[1], params);
  else nodes = viewHome();

  root.replaceChildren(...nodes.filter(Boolean));
  root.focus({ preventScroll: true });
}

function applyLang() {
  document.documentElement.lang = lang;
  // The button shows the language you switch to next.
  const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
  const btn = document.getElementById('lang');
  btn.textContent = next.toUpperCase();
  btn.setAttribute('aria-label', { fr: 'Passer en français', wo: 'Soppi ci wolof', en: 'Switch to English' }[next]);
}

document.getElementById('lang').addEventListener('click', () => {
  lang = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
  store.set('lang', lang);
  applyLang();
  render();
});

window.addEventListener('hashchange', render);

(async () => {
  applyLang();
  try {
    config = await api('GET', '/config');
  } catch {
    /* offline: use defaults */
  }
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
