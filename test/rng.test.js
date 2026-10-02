import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randomSeed } from '../lib/rng.js';
import { generateCase } from '../lib/generator.js';

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

test('randomSeed is 64 bits of hex from crypto.getRandomValues, never a counter or the clock', () => {
  const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  let calls = 0;
  globalThis.crypto.getRandomValues = (arr) => { calls++; return real(arr); };
  try {
    const seeds = new Set(Array.from({ length: 200 }, () => randomSeed()));
    assert.equal(calls, 200);
    assert.equal(seeds.size, 200);
    for (const s of seeds) assert.match(s, /^[0-9a-f]{16}$/);
  } finally {
    globalThis.crypto.getRandomValues = real;
  }
  // The generator's default seed uses it too.
  assert.match(generateCase({ level: 1 }).seed, /^[0-9a-f]{16}$/);
});
