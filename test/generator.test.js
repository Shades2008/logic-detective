import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCase } from '../lib/generator.js';
import { solve, narrowing } from '../lib/solver.js';
import { clueClass } from '../lib/clues.js';
import { ATTRS, LEVELS } from '../lib/data.js';

const CASES_PER_LEVEL = 1000;

// Independent oracle: re-states the clue rules from the spec in a different
// shape from lib/clues.js (index arithmetic, explicit loops, no shared code),
// so a bug in `holds` can't also hide inside the check that catches it.
function oracleFits(suspects, clues, i) {
  for (const c of clues) {
    let result;
    if (c.type === 'attr') {
      result = suspects[i][c.attr] === c.value;
    } else {
      result = false;
      for (let j = 0; j < suspects.length; j++) {
        if (j === i) continue;
        const related = c.relation === 'nextTo'
          ? Math.abs(j - i) === 1
          : suspects[j].location === suspects[i].location;
        if (related && suspects[j][c.attr] === c.value) result = true;
      }
    }
    if (c.negate) result = !result;
    if (!result) return false;
  }
  return true;
}
const oracleSolve = (suspects, clues) => suspects.map((_, i) => i).filter((i) => oracleFits(suspects, clues, i));

for (const config of LEVELS) {
  test(`level ${config.level}: ${CASES_PER_LEVEL} random cases each have exactly one solution`, (t) => {
    const stats = { clues: 0, minClues: Infinity, maxClues: 0, attempts: 0, maxAttempts: 0, classes: {} };

    for (let n = 0; n < CASES_PER_LEVEL; n++) {
      const seed = `uniq-${config.level}-${n}`;
      const c = generateCase({ seed, level: config.level });
      const ctx = `seed=${seed}`;

      // 1. Uniqueness: the solver and the independent oracle agree on exactly the culprit.
      assert.deepEqual(solve(c.suspects, c.clues), [c.culprit], `solver: ${ctx}`);
      assert.deepEqual(oracleSolve(c.suspects, c.clues), [c.culprit], `oracle: ${ctx}`);

      // 2. Every clue is true of the culprit.
      for (const clue of c.clues) assert.ok(oracleFits(c.suspects, [clue], c.culprit), `false clue: ${ctx}`);

      // 3. Every clue earns its place: it strictly narrows the field, and the case
      //    is not solved before the last clue (so dropping any tail clue breaks uniqueness).
      const counts = narrowing(c.suspects, c.clues);
      for (let k = 1; k < counts.length; k++) assert.ok(counts[k] < counts[k - 1], `redundant clue ${k}: ${ctx}`);
      assert.equal(counts.at(-1), 1, ctx);
      assert.ok(counts.slice(0, -1).every((x) => x > 1), `solved early: ${ctx}`);
      assert.ok(solve(c.suspects, c.clues.slice(0, -1)).length > 1, `last clue not needed: ${ctx}`);

      assert.ok(c.clues.length >= config.minClues, `too trivial: ${ctx}`);

      // 4. Roster shape for this level.
      assert.equal(c.suspects.length, config.suspects, ctx);
      assert.equal(new Set(c.suspects.map((s) => s.name)).size, config.suspects, `duplicate names: ${ctx}`);
      assert.equal(new Set(c.suspects.map((s) => ATTRS.map((a) => s[a]).join('|'))).size, config.suspects, `twins: ${ctx}`);
      assert.ok(c.culprit >= 0 && c.culprit < config.suspects);

      // 5. Only clue classes this level allows.
      const allowed = new Set(['direct', ...(config.kinds.includes('negative') ? ['negative'] : []),
        ...(config.kinds.includes('relational') ? ['relational'] : []),
        ...(config.kinds.includes('negative') && config.kinds.includes('relational') ? ['negativeRelational'] : [])]);
      for (const clue of c.clues) {
        const cls = clueClass(clue);
        assert.ok(allowed.has(cls), `${cls} clue not allowed at level ${config.level}: ${ctx}`);
        stats.classes[cls] = (stats.classes[cls] ?? 0) + 1;
      }

      stats.clues += c.clues.length;
      stats.minClues = Math.min(stats.minClues, c.clues.length);
      stats.maxClues = Math.max(stats.maxClues, c.clues.length);
      stats.attempts += c.attempt + 1;
      stats.maxAttempts = Math.max(stats.maxAttempts, c.attempt + 1);
    }

    t.diagnostic(
      `clues/case avg ${(stats.clues / CASES_PER_LEVEL).toFixed(2)} ` +
      `(min ${stats.minClues}, max ${stats.maxClues}); ` +
      `attempts/case avg ${(stats.attempts / CASES_PER_LEVEL).toFixed(3)} (max ${stats.maxAttempts}); ` +
      `classes ${JSON.stringify(stats.classes)}`,
    );

    // The level's clue mix is actually exercised, not just permitted.
    for (const kind of config.kinds) {
      assert.ok(stats.classes[kind] > 0, `level ${config.level} never produced a ${kind} clue`);
    }
    if (config.kinds.length === 3) assert.ok(stats.classes.negativeRelational > 0);
  });
}

test('same seed and level reproduce the identical case', () => {
  for (const level of [1, 2, 3, 4]) {
    assert.deepEqual(generateCase({ seed: 'repeat', level }), generateCase({ seed: 'repeat', level }));
  }
  assert.notDeepEqual(generateCase({ seed: 'one', level: 3 }), generateCase({ seed: 'two', level: 3 }));
});

test('harder levels need more clues on average', () => {
  const avg = (level) => {
    let total = 0;
    for (let n = 0; n < 300; n++) total += generateCase({ seed: `avg-${n}`, level }).clues.length;
    return total / 300;
  };
  const [a1, a4] = [avg(1), avg(4)];
  assert.ok(a4 > a1, `level 4 avg ${a4} should exceed level 1 avg ${a1}`);
});

test('cases never carry the answer inside the roster or clues', () => {
  const c = generateCase({ seed: 'leak', level: 4 });
  for (const s of c.suspects) assert.deepEqual(Object.keys(s).sort(), ['coat', 'hat', 'item', 'location', 'name']);
  assert.ok(!JSON.stringify(c.clues).includes(c.suspects[c.culprit].name));
});

test('invalid level and impossible configurations fail loudly', () => {
  assert.throws(() => generateCase({ seed: 'x', level: 0 }), RangeError);
  assert.throws(() => generateCase({ seed: 'x', level: 5 }), RangeError);
  // maxAttempts: 0 means no attempt can succeed, so the regenerate loop exhausts.
  assert.throws(() => generateCase({ seed: 'x', level: 1, maxAttempts: 0 }), /No uniquely solvable case/);
});
