import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant, builtInAnswer } from '../src/assistant.js';

const view = {
  name: 'Natt HLM', status: 'active', contributionSats: 1000, frequency: 'weekly', maxMembers: 3, potSats: 3000,
  you: { id: 'a', name: 'Awa', position: 3, isOrganizer: true },
  members: [
    { id: 'b', name: 'Fatou', position: 1, paidThisRound: true, phone: '+221770000000' },
    { id: 'c', name: 'Moussa', position: 2, paidThisRound: false },
    { id: 'a', name: 'Awa', position: 3, paidThisRound: false },
  ],
  round: { number: 1, recipientId: 'b', paidCount: 1 },
  history: [],
};

test('built-in answers cover turn and payment questions in French and English', () => {
  assert.match(builtInAnswer(view, "C'est quand mon tour ?", 'fr', 0.5), /n°3.*2 tour/);
  assert.match(builtInAnswer(view, 'Who has not paid?', 'en', 0.5), /Moussa, Awa.*includes you/);
});

test('built-in answers work in Wolof', () => {
  assert.match(builtInAnswer(view, 'Kañ la sama wër ?', 'wo', 0.5), /Sa wër mooy 3.*Des na 2 wër/);
  assert.match(builtInAnswer(view, 'Kan moo feyagul ?', 'wo', 0.5), /Feyaguñu : Moussa, Awa.*Yaw itam/);
  assert.match(builtInAnswer({ ...view, status: 'completed' }, 'x', 'wo', 0.5), /jeex na/);
});

test('without an API key the assistant answers offline', async () => {
  const a = createAssistant({ apiKey: '', model: 'x', xofPerSat: 0.5 });
  const res = await a.ask({ view, question: 'bitcoin ?', lang: 'fr' });
  assert.equal(res.source, 'built-in');
});

test('AI request never includes phone numbers and falls back on refusal', async () => {
  let sent;
  const client = {
    beta: {
      messages: {
        create: async (req) => {
          sent = req;
          return { stop_reason: 'refusal', content: [] };
        },
      },
    },
  };
  const a = createAssistant({ model: 'claude-opus-5-5', xofPerSat: 0.5, client });
  const res = await a.ask({ view, question: 'Quand ?', lang: 'fr' });
  assert.ok(!JSON.stringify(sent).includes('221770000000'));
  assert.equal(sent.fallbacks, 'default');
  assert.equal(res.source, 'built-in');
});

test('returns AI text when available', async () => {
  const client = { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Asalaa maalekum ! Votre tour est le 3.' }] }) } } };
  const a = createAssistant({ model: 'm', xofPerSat: 0.5, client });
  assert.deepEqual(await a.ask({ view, question: 'Quand ?', lang: 'fr' }), { answer: 'Asalaa maalekum ! Votre tour est le 3.', source: 'ai' });
});
