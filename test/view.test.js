import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCase } from '../lib/generator.js';
import { publicView, revealClue, cardLabel, CARD_LABELS } from '../lib/view.js';
import { LEVELS } from '../lib/data.js';
import { oraclePar } from './helpers.js';

const SECRET_SEED = 'zq9-very-secret-seed';

test('publicView has only suspects and category-labelled cards', () => {
  const c = generateCase({ seed: SECRET_SEED, level: 4, mode: 'pool' });
  const view = publicView(c);
  assert.deepEqual(Object.keys(view).sort(), ['cards', 'level', 'mode', 'suspects']);
  assert.equal(view.cards.length, c.clues.length);
  view.cards.forEach((card, i) => {
    assert.deepEqual(Object.keys(card).sort(), ['index', 'label']);
    assert.equal(card.index, i);
    assert.ok(CARD_LABELS.includes(card.label));
    assert.equal(card.label, cardLabel(c.clues[i]));
  });
  for (const s of view.suspects) assert.deepEqual(Object.keys(s).sort(), ['coat', 'hat', 'item', 'location', 'name']);
});

test('publicView never contains the culprit, par, clue values or the seed, even after JSON.stringify', () => {
  for (const level of [1, 2, 3, 4]) {
    for (let k = 0; k < 50; k++) {
      const seed = `${SECRET_SEED}-${level}-${k}`;
      const c = generateCase({ seed, level, mode: 'pool' });
      const json = JSON.stringify(publicView(c));
      for (const forbidden of ['culprit', 'par', 'seed', 'attempt', 'negate', 'relation', 'value', 'type', seed]) {
        assert.ok(!json.includes(forbidden), `view leaked "${forbidden}" (seed ${seed})`);
      }
      // Clue wording and values must not appear in the card section either.
      const cards = JSON.stringify(publicView(c).cards);
      for (const clue of c.clues) assert.ok(!cards.includes(`"${clue.value}"`), `card leaked value ${clue.value}`);
    }
  }
});

test('revealClue returns the full clue behind a card (and only on request)', () => {
  const c = generateCase({ seed: 'rev', level: 3, mode: 'pool' });
  c.clues.forEach((clue, i) => assert.deepEqual(revealClue(c, i), clue));
  // The revealed clue matches the card's label.
  const view = publicView(c);
  view.cards.forEach((card) => assert.equal(cardLabel(revealClue(c, card.index)), card.label));
  // Returned clues are copies: editing one must not change the case.
  const first = revealClue(c, 0);
  first.value = 'tampered';
  assert.notEqual(c.clues[0].value, 'tampered');
  assert.throws(() => revealClue(c, -1), RangeError);
  assert.throws(() => revealClue(c, c.clues.length), RangeError);
  assert.throws(() => revealClue(c, 1.5), RangeError);
});

test('publicView and revealClue refuse race-mode cases', () => {
  const race = generateCase({ seed: 'r', level: 1 });
  assert.throws(() => publicView(race), TypeError);
  assert.throws(() => revealClue(race, 0), TypeError);
});

test('same seed gives the identical public view', () => {
  for (const level of [1, 2, 3, 4]) {
    const a = publicView(generateCase({ seed: 'det', level, mode: 'pool' }));
    const b = publicView(generateCase({ seed: 'det', level, mode: 'pool' }));
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  }
});

// A leak through card order would look like the solution cards sitting at the
// front (or back). For every smallest sufficient subset, average the card
// positions: under a fair shuffle that mean is the middle of the pool.
for (const config of LEVELS) {
  test(`level ${config.level}: card order does not correlate with the solution`, () => {
    let sum = 0;
    let count = 0;
    let solutionAtFront = 0;
    const cases = 600;
    for (let k = 0; k < cases; k++) {
      const c = generateCase({ seed: `order-${config.level}-${k}`, level: config.level, mode: 'pool' });
      const { par, minimalSubsets } = oraclePar(c.suspects, c.clues, c.culprit);
      let allFront = false;
      for (const subset of minimalSubsets) {
        for (const index of subset) { sum += index / (c.clues.length - 1); count++; }
        if (subset.every((index) => index < par)) allFront = true;
      }
      if (allFront) solutionAtFront++;
    }
    const mean = sum / count;
    assert.ok(mean > 0.45 && mean < 0.55, `mean normalised position of solution cards ${mean.toFixed(3)}, expected ~0.5`);
    // Pool-order-first would put a minimal subset in the first `par` slots every time.
    assert.ok(solutionAtFront < cases * 0.5, `solution cards sat at the front in ${solutionAtFront}/${cases} cases`);
  });
}
