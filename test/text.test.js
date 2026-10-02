import test from 'node:test';
import assert from 'node:assert/strict';
import { clueToText } from '../lib/text.js';
import { generateCase } from '../lib/generator.js';
import { ATTRS, VALUE_POOLS } from '../lib/data.js';
import { RELATIONS } from '../lib/clues.js';

const NEGATION = /\b(not|neither|no other)\b/i;

// What each attribute's wording must mention besides the value itself.
const ATTR_MARKER = {
  hat: (v) => new RegExp(`wearing an? ${v}\\b`),
  coat: (v) => new RegExp(`${v} coat\\b`),
  location: (v) => new RegExp(`at the ${v}\\b`),
  item: (v) => new RegExp(`carrying an? ${v}\\b`),
};

function check(clue) {
  const text = clueToText(clue);
  const ctx = JSON.stringify(clue);
  assert.equal(typeof text, 'string', ctx);
  assert.ok(text.length > 10, `empty-ish text for ${ctx}`);
  assert.ok(text.endsWith('.'), ctx);
  assert.ok(text.includes(clue.value), `"${text}" lacks value for ${ctx}`);
  assert.match(text, ATTR_MARKER[clue.attr](clue.value), `"${text}" lacks the ${clue.attr} wording for ${ctx}`);
  if (clue.negate) assert.match(text, NEGATION, `negated clue without a negation: "${text}"`);
  else assert.doesNotMatch(text, NEGATION, `positive clue reads as negative: "${text}"`);
  if (clue.type === 'rel' && clue.relation === 'nextTo') assert.match(text, /neighbors? in the lineup/, ctx);
  if (clue.type === 'rel' && clue.relation === 'sameLocation') assert.match(text, /culprit's location/, ctx);
  return text;
}

test('every clue shape x attribute x value x polarity renders correct text', () => {
  const seen = new Set();
  for (const attr of ATTRS) {
    for (const value of VALUE_POOLS[attr]) {
      for (const negate of [false, true]) {
        seen.add(check({ type: 'attr', attr, value, negate }));
        for (const relation of RELATIONS) {
          if (relation === 'sameLocation' && attr === 'location') continue; // never generated
          seen.add(check({ type: 'rel', relation, attr, value, negate }));
        }
      }
    }
  }
  // 4 attrs x 7 values x 2 polarities x (attr + nextTo) + 3 attrs x 7 x 2 sameLocation
  assert.equal(seen.size, 4 * 7 * 2 * 2 + 3 * 7 * 2);
});

test('clues from real cases across all levels and both modes render correctly', () => {
  for (const level of [1, 2, 3, 4]) {
    for (let k = 0; k < 40; k++) {
      for (const mode of ['pool', 'race']) {
        const c = generateCase({ seed: `text-${level}-${k}`, level, mode });
        for (const clue of c.clues) check(clue);
      }
    }
  }
});

test('articles and the location lead-in read naturally', () => {
  assert.equal(clueToText({ type: 'attr', attr: 'item', value: 'umbrella', negate: false }), 'The culprit was carrying an umbrella.');
  assert.equal(clueToText({ type: 'attr', attr: 'hat', value: 'fedora', negate: true }), 'The culprit was not wearing a fedora.');
  assert.equal(clueToText({ type: 'attr', attr: 'coat', value: 'red', negate: false }), 'The culprit was wearing a red coat.');
  assert.equal(clueToText({ type: 'attr', attr: 'location', value: 'docks', negate: true }), 'That night, the culprit was not at the docks.');
});

test('relational wording spells out what "next to" and "same place" mean', () => {
  assert.equal(
    clueToText({ type: 'rel', relation: 'nextTo', attr: 'coat', value: 'red', negate: false }),
    "At least one of the culprit's neighbors in the lineup (directly left or right) was wearing a red coat.",
  );
  assert.equal(
    clueToText({ type: 'rel', relation: 'sameLocation', attr: 'item', value: 'cane', negate: true }),
    "No other suspect at the culprit's location was carrying a cane.",
  );
});

test('wording never depends on, or hints at, the lineup position', () => {
  // Text is a pure function of the clue alone: same clue, same text.
  const clue = { type: 'rel', relation: 'nextTo', attr: 'hat', value: 'beret', negate: false };
  assert.equal(clueToText(clue), clueToText({ ...clue }));
  assert.doesNotMatch(clueToText(clue), /\b(first|last|left end|right end|position \d)\b/i);
});

test('malformed clues throw', () => {
  assert.throws(() => clueToText({ type: 'attr', attr: 'shoes', value: 'x' }), TypeError);
  assert.throws(() => clueToText({ type: 'rel', relation: 'above', attr: 'hat', value: 'x' }), TypeError);
  assert.throws(() => clueToText({ type: 'huh', attr: 'hat', value: 'x' }), TypeError);
});
