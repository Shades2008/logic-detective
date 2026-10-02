import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, isUnique, narrowing, verifyCase, survivorMask, smallestSufficientSubset } from '../lib/solver.js';
import { roster, attr, rel } from './helpers.js';

test('no clues: everyone is a suspect', () => {
  assert.deepEqual(solve(roster, []), [0, 1, 2, 3, 4]);
});

test('clues intersect', () => {
  const clues = [attr('hat', 'beret'), attr('coat', 'tan')];
  assert.deepEqual(solve(roster, clues), [3]);
  assert.ok(isUnique(roster, clues));
  assert.ok(isUnique(roster, clues, 3));
  assert.ok(!isUnique(roster, clues, 2));
});

test('ambiguous clue set is reported as not unique', () => {
  const clues = [attr('hat', 'fedora')];
  assert.deepEqual(solve(roster, clues), [0, 1]);
  assert.ok(!isUnique(roster, clues));
});

test('contradictory clue set leaves nobody (and is not unique)', () => {
  const clues = [attr('hat', 'fedora'), attr('hat', 'beret')];
  assert.deepEqual(solve(roster, clues), []);
  assert.ok(!isUnique(roster, clues));
});

test('mixes direct, negative and relational clues', () => {
  const clues = [
    attr('coat', 'tan', true), // Ann, Bob, Cy
    rel('nextTo', 'coat', 'red'), // Bob, (Dee, Eve ruled out above)
  ];
  assert.deepEqual(solve(roster, clues), [1]);
});

test('narrowing counts candidates after each clue', () => {
  const clues = [attr('hat', 'beret'), attr('coat', 'tan')];
  assert.deepEqual(narrowing(roster, clues), [5, 2, 1]);
});

test('identical-looking suspects cannot be separated by attribute clues', () => {
  const twins = [
    { name: 'X', hat: 'fedora', coat: 'red', location: 'docks', item: 'cane' },
    { name: 'Y', hat: 'fedora', coat: 'red', location: 'docks', item: 'cane' },
  ];
  assert.deepEqual(solve(twins, [attr('hat', 'fedora'), attr('item', 'cane')]), [0, 1]);
});

// ---- the solver must reject bad cases -------------------------------------
// Culprit is Dee (3): beret, tan coat, casino, cigar.
const dee = 3;

test('rejects (a) a clue that is false of the culprit, even when it leaves a different single suspect', () => {
  // Dee does not carry an umbrella. With "tan coat" it leaves only Eve: a lone
  // survivor, so plain uniqueness passes, but it is the wrong person.
  const clues = [attr('coat', 'tan'), attr('item', 'umbrella')];
  assert.deepEqual(solve(roster, clues), [4]);
  assert.ok(isUnique(roster, clues), 'uniqueness alone cannot see the problem');
  assert.ok(!isUnique(roster, clues, dee));
  const verdict = verifyCase({ suspects: roster, culprit: dee, clues });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'false-clue');
  assert.equal(verdict.clueIndex, 1);
});

test('rejects (b) a clue list that leaves two suspects', () => {
  const clues = [attr('hat', 'beret')]; // Cy and Dee
  assert.deepEqual(solve(roster, clues), [2, 3]);
  assert.ok(!isUnique(roster, clues, dee));
  const verdict = verifyCase({ suspects: roster, culprit: dee, clues });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'ambiguous');
  assert.deepEqual(verdict.survivors, [2, 3]);
});

test('rejects (c) a clue list that eliminates the culprit', () => {
  const clues = [attr('hat', 'fedora'), attr('hat', 'beret')]; // contradictory: nobody fits
  assert.deepEqual(solve(roster, clues), []);
  assert.ok(!isUnique(roster, clues, dee));
  assert.equal(verifyCase({ suspects: roster, culprit: dee, clues }).ok, false);
  // Culprit eliminated while someone else is left alone.
  const clues2 = [attr('hat', 'fedora')]; // Ann, Bob; culprit Dee is gone
  assert.equal(verifyCase({ suspects: roster, culprit: dee, clues: clues2 }).ok, false);
});

test('accepts a sound case, with and without par', () => {
  const clues = [attr('hat', 'beret'), attr('coat', 'tan')];
  assert.deepEqual(verifyCase({ suspects: roster, culprit: dee, clues }), { ok: true });
  assert.deepEqual(verifyCase({ suspects: roster, culprit: dee, clues, par: 2 }), { ok: true });
});

test('rejects a par that is off by one in either direction', () => {
  // Pool: beret {Cy,Dee}, tan {Dee,Eve}, cigar {Dee}, casino {Cy,Dee}. Smallest sufficient subset: just cigar.
  const clues = [attr('hat', 'beret'), attr('coat', 'tan'), attr('item', 'cigar'), attr('location', 'casino')];
  assert.deepEqual(verifyCase({ suspects: roster, culprit: dee, clues, par: 1 }), { ok: true });
  for (const wrong of [0, 2]) {
    const verdict = verifyCase({ suspects: roster, culprit: dee, clues, par: wrong });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, 'par-mismatch');
    assert.equal(verdict.actual, 1);
  }
  // Pool with no single-clue route: par is 2.
  const pool2 = [attr('hat', 'beret'), attr('coat', 'tan')];
  assert.equal(verifyCase({ suspects: roster, culprit: dee, clues: pool2, par: 1 }).ok, false);
});

test('smallestSufficientSubset finds the cheapest route, or null', () => {
  const masks = (clues) => clues.map((c) => survivorMask(roster, c));
  const pool = [attr('hat', 'beret'), attr('coat', 'tan'), attr('item', 'cigar')];
  assert.deepEqual(smallestSufficientSubset(masks(pool), roster.length, dee), { size: 1, subset: [2] });
  assert.deepEqual(smallestSufficientSubset(masks(pool.slice(0, 2)), roster.length, dee), { size: 2, subset: [0, 1] });
  assert.equal(smallestSufficientSubset(masks([attr('hat', 'beret')]), roster.length, dee), null);
  assert.equal(smallestSufficientSubset([], roster.length, dee), null);
});
