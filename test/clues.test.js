import test from 'node:test';
import assert from 'node:assert/strict';
import { holds, describeClue, trueCluePool, clueClass } from '../lib/clues.js';
import { roster, attr, rel } from './helpers.js';

const who = (clue) => roster.flatMap((_, i) => (holds(clue, roster, i) ? [roster[i].name] : []));

test('direct clue: matches exactly the suspects with that trait', () => {
  assert.deepEqual(who(attr('hat', 'fedora')), ['Ann', 'Bob']);
  assert.deepEqual(who(attr('coat', 'tan')), ['Dee', 'Eve']);
  assert.deepEqual(who(attr('item', 'cigar')), ['Dee']);
});

test('negative clue: complement of the direct clue', () => {
  assert.deepEqual(who(attr('hat', 'fedora', true)), ['Cy', 'Dee', 'Eve']);
  // A value nobody has rules nobody out
  assert.equal(who(attr('hat', 'top hat', true)).length, roster.length);
  assert.equal(who(attr('hat', 'top hat')).length, 0);
});

test('nextTo: lineup neighbours only, ends of the line handled', () => {
  // red coats: Ann(0), Cy(2). Neighbours of 1 are 0 and 2 -> Bob. Neighbour of 3 is 2 -> Dee.
  // Ann's only neighbour is Bob (grey), so she isn't next to red.
  assert.deepEqual(who(rel('nextTo', 'coat', 'red')), ['Bob', 'Dee']);
  // Eve is last in line: only neighbour is Dee (cigar).
  assert.deepEqual(who(rel('nextTo', 'item', 'cigar')), ['Cy', 'Eve']);
});

test('nextTo never counts the suspect themselves', () => {
  // Only Ann has... Ann and Cy have canes, but they are not adjacent.
  assert.deepEqual(who(rel('nextTo', 'item', 'cane')), ['Bob', 'Dee']);
});

test('negated relational clue is the exact complement', () => {
  const pos = who(rel('nextTo', 'coat', 'red'));
  const neg = who(rel('nextTo', 'coat', 'red', true));
  assert.deepEqual([...pos, ...neg].sort(), roster.map((s) => s.name).sort());
  assert.equal(pos.filter((n) => neg.includes(n)).length, 0);
});

test('sameLocation: other suspects at the same place, never self', () => {
  // Docks: Ann+Bob. Casino: Cy+Dee. Eve is alone in the alley.
  assert.deepEqual(who(rel('sameLocation', 'item', 'umbrella')), ['Ann']);
  assert.deepEqual(who(rel('sameLocation', 'item', 'cane')), ['Bob', 'Dee']);
  // Eve has an umbrella herself but nobody else is in the alley.
  assert.ok(!who(rel('sameLocation', 'item', 'umbrella')).includes('Eve'));
  // Cy shares the casino with Dee (tan), so "not with anyone in tan" is false for Cy but true for Dee (her mate Cy is red).
  assert.deepEqual(who(rel('sameLocation', 'coat', 'tan', true)), ['Ann', 'Bob', 'Dee', 'Eve']);
});

test('malformed clues throw instead of silently matching', () => {
  assert.throws(() => holds({ type: 'attr', attr: 'shoes', value: 'x' }, roster, 0), TypeError);
  assert.throws(() => holds({ type: 'huh', attr: 'hat', value: 'x' }, roster, 0), TypeError);
  assert.throws(() => holds({ type: 'rel', relation: 'above', attr: 'hat', value: 'x' }, roster, 0), TypeError);
});

test('clueClass labels each shape', () => {
  assert.equal(clueClass(attr('hat', 'x')), 'direct');
  assert.equal(clueClass(attr('hat', 'x', true)), 'negative');
  assert.equal(clueClass(rel('nextTo', 'hat', 'x')), 'relational');
  assert.equal(clueClass(rel('nextTo', 'hat', 'x', true)), 'negativeRelational');
});

test('trueCluePool: every clue is true of the culprit and respects kinds', () => {
  for (let culprit = 0; culprit < roster.length; culprit++) {
    const all = trueCluePool(roster, culprit, ['direct', 'negative', 'relational']);
    for (const [cls, clues] of Object.entries(all)) {
      for (const clue of clues) {
        assert.equal(clueClass(clue), cls);
        assert.ok(holds(clue, roster, culprit), `${describeClue(clue)} should be true of ${roster[culprit].name}`);
      }
    }
    assert.deepEqual(Object.keys(trueCluePool(roster, culprit, ['direct'])), ['direct']);
    // negated relational clues need both 'negative' and 'relational'
    assert.deepEqual(Object.keys(trueCluePool(roster, culprit, ['direct', 'relational'])).sort(), ['direct', 'relational']);
  }
});

test('describeClue reads naturally', () => {
  assert.equal(describeClue(attr('hat', 'fedora')), 'The culprit was wearing a fedora.');
  assert.equal(describeClue(attr('coat', 'red', true)), 'The culprit was not in a red coat.');
  assert.equal(describeClue(attr('item', 'umbrella')), 'The culprit was carrying an umbrella.');
  assert.equal(describeClue(attr('location', 'docks')), 'The culprit was at the docks.');
  assert.equal(describeClue(rel('nextTo', 'hat', 'beret')), 'The culprit was standing next to someone wearing a beret.');
  assert.equal(describeClue(rel('sameLocation', 'item', 'cane', true)), 'The culprit was not at the same place as anyone carrying a cane.');
});
