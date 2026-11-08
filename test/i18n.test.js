import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from '../public/i18n.js';

test('every language has exactly the same UI strings and placeholders', () => {
  const keys = Object.keys(STRINGS.fr).sort();
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const lang of ['wo', 'en']) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), keys, `${lang} keys differ from fr`);
    for (const k of keys) assert.equal(vars(STRINGS[lang][k]), vars(STRINGS.fr[k]), `${lang}.${k} placeholders differ`);
  }
});
