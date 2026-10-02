import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateCase } from '../lib/generator.js';

// Snapshot of race-mode output taken before pool mode existed. Race mode is
// the future multiplayer deck, so its output must not drift.
const golden = JSON.parse(readFileSync(new URL('./fixtures/race-golden.json', import.meta.url), 'utf8'));

test('race mode output is unchanged from the pre-pool-mode snapshot', () => {
  assert.equal(golden.length, 60);
  for (const expected of golden) {
    const actual = generateCase({ seed: expected.seed, level: expected.level });
    assert.deepEqual(actual, expected, `seed=${expected.seed} level=${expected.level}`);
  }
});

test("mode 'race' is the default and matches an explicit mode: 'race'", () => {
  for (const level of [1, 2, 3, 4]) {
    assert.deepEqual(generateCase({ seed: 'dflt', level }), generateCase({ seed: 'dflt', level, mode: 'race' }));
  }
});
