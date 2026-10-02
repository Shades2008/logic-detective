import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCase } from '../lib/generator.js';
import { solve, verifyCase } from '../lib/solver.js';
import { clueClass } from '../lib/clues.js';
import { LEVELS } from '../lib/data.js';
import { oracleFits, oracleSolve, oraclePar } from './helpers.js';

const CASES_PER_LEVEL = 1000;

for (const config of LEVELS) {
  test(`pool level ${config.level}: ${CASES_PER_LEVEL} random cases are unique, true, sized, distinct, spread, with a verified par`, (t) => {
    const n = config.suspects;
    const stats = { par: 0, atFloor: 0, attempts: 0, maxAttempts: 0, strongest: 0, weakest: 0 };
    const allowed = new Set(['direct', ...(config.poolKinds.includes('negative') ? ['negative'] : []),
      ...(config.poolKinds.includes('relational') ? ['relational'] : []),
      ...(config.poolKinds.includes('negative') && config.poolKinds.includes('relational') ? ['negativeRelational'] : [])]);

    for (let k = 0; k < CASES_PER_LEVEL; k++) {
      const seed = `pool-${config.level}-${k}`;
      const c = generateCase({ seed, level: config.level, mode: 'pool' });
      const ctx = `seed=${seed}`;

      assert.equal(c.mode, 'pool');
      assert.equal(c.suspects.length, n, ctx);

      // Exactly one suspect fits the full pool, and it is the culprit (solver and oracle agree).
      assert.deepEqual(solve(c.suspects, c.clues), [c.culprit], `solver: ${ctx}`);
      assert.deepEqual(oracleSolve(c.suspects, c.clues), [c.culprit], `oracle: ${ctx}`);

      // Pool size matches the level; every clue is true of the culprit.
      assert.equal(c.clues.length, config.poolSize, `pool size: ${ctx}`);
      for (const clue of c.clues) {
        assert.ok(oracleFits(c.suspects, [clue], c.culprit), `false clue in pool: ${ctx}`);
        assert.ok(allowed.has(clueClass(clue)), `${clueClass(clue)} not allowed in pool at level ${config.level}: ${ctx}`);
      }

      // No duplicates, and none equivalent in effect (same set of suspects left standing).
      const signatures = c.clues.map((clue) => c.suspects.map((_, i) => (oracleFits(c.suspects, [clue], i) ? 1 : 0)).join(''));
      assert.equal(new Set(signatures).size, c.clues.length, `duplicate or equivalent clues: ${ctx}`);
      assert.equal(new Set(c.clues.map((x) => JSON.stringify(x))).size, c.clues.length, `identical clues: ${ctx}`);
      for (const sig of signatures) assert.ok(sig.includes('0'), `a card rules out nobody: ${ctx}`);

      // Par matches an independent brute force, respects the floor, and the solver agrees.
      const { par, minimalSubsets } = oraclePar(c.suspects, c.clues, c.culprit);
      assert.equal(c.par, par, `par: ${ctx}`);
      assert.ok(c.par >= config.minPar, `par ${c.par} < minPar ${config.minPar}: ${ctx}`);
      assert.ok(c.par <= Math.floor(n / 2), `par ${c.par} above the strong-clue ceiling: ${ctx}`);
      assert.deepEqual(oracleSolve(c.suspects, minimalSubsets[0].map((j) => c.clues[j])), [c.culprit], `par subset: ${ctx}`);
      assert.deepEqual(verifyCase(c), { ok: true }, ctx);

      // Strength spread: a strong card (rules out half or more) and a weak one (one or two).
      const ruledOut = signatures.map((sig) => [...sig].filter((ch) => ch === '0').length);
      assert.ok(ruledOut.some((r) => r * 2 >= n), `no strong clue: ${ctx}`);
      assert.ok(ruledOut.some((r) => r >= 1 && r <= 2), `no weak clue: ${ctx}`);

      stats.par += c.par;
      stats.atFloor += c.par === config.minPar ? 1 : 0;
      stats.attempts += c.attempt + 1;
      stats.maxAttempts = Math.max(stats.maxAttempts, c.attempt + 1);
    }

    t.diagnostic(
      `avg par ${(stats.par / CASES_PER_LEVEL).toFixed(2)}, par at minPar floor ${(100 * stats.atFloor / CASES_PER_LEVEL).toFixed(1)}%, ` +
      `attempts avg ${(stats.attempts / CASES_PER_LEVEL).toFixed(2)} (max ${stats.maxAttempts})`,
    );
  });
}

test('the poolSize / minPar levels are internally consistent', () => {
  for (const config of LEVELS) {
    assert.ok(config.poolSize > config.minClues, `level ${config.level}`);
    // A strong clue leaves at most floor(n/2) suspects, which caps par; minPar above that is unreachable.
    assert.ok(config.minPar <= Math.floor(config.suspects / 2), `level ${config.level} minPar unreachable`);
    assert.ok(config.minPar <= config.minClues);
  }
  assert.deepEqual(LEVELS.map((l) => l.poolSize), [6, 7, 8, 10]);
});

test('pool mode is deterministic for a given seed, level and mode', () => {
  for (const level of [1, 2, 3, 4]) {
    assert.deepEqual(
      generateCase({ seed: 'same', level, mode: 'pool' }),
      generateCase({ seed: 'same', level, mode: 'pool' }),
    );
  }
  assert.notDeepEqual(generateCase({ seed: 'a', level: 3, mode: 'pool' }), generateCase({ seed: 'b', level: 3, mode: 'pool' }));
});

test('pool and race cases for one seed are different modes of the same game, not the same object', () => {
  const race = generateCase({ seed: 'm', level: 2, mode: 'race' });
  const pool = generateCase({ seed: 'm', level: 2, mode: 'pool' });
  assert.equal(race.mode, undefined); // race output keeps its original shape
  assert.equal(pool.mode, 'pool');
  assert.equal(race.par, undefined);
  assert.equal(typeof pool.par, 'number');
});

test('unknown mode fails loudly', () => {
  assert.throws(() => generateCase({ seed: 'x', mode: 'zen' }), RangeError);
});
