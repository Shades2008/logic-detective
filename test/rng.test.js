import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../lib/rng.js';

test('same seed gives the same sequence; different seeds differ', () => {
  const a = createRng('abc');
  const b = createRng('abc');
  const c = createRng('abd');
  const seqA = Array.from({ length: 20 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 20 }, () => b.next()));
  assert.notDeepEqual(seqA, Array.from({ length: 20 }, () => c.next()));
});

test('next() stays in [0, 1) and int(n) in [0, n)', () => {
  const rng = createRng(1);
  for (let i = 0; i < 5000; i++) {
    const x = rng.next();
    assert.ok(x >= 0 && x < 1);
    const k = rng.int(7);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 7);
  }
});

test('sample returns distinct elements and shuffle keeps them all', () => {
  const rng = createRng('s');
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const picked = rng.sample(items, 5);
  assert.equal(new Set(picked).size, 5);
  assert.deepEqual(rng.shuffle(items).sort(), items);
});
