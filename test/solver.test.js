import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, isUnique, narrowing } from '../lib/solver.js';
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
