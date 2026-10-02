import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCase, scoreBreakdown, scoreRun, SCORING } from '../lib/scoring.js';

const solvedCase = (over = {}) => ({ cardsOpened: 4, wrongAccusations: 0, par: 3, solved: true, ...over });

test('constants live in one object', () => {
  assert.deepEqual(Object.keys(SCORING).sort(), [
    'baseScore', 'maxStrikes', 'parBonus', 'perCard', 'perWrongAccusation', 'streakCap', 'streakStep',
  ]);
  assert.equal(SCORING.baseScore, 1000);
  assert.equal(SCORING.perCard, 75);
  assert.equal(SCORING.perWrongAccusation, 200);
  assert.equal(SCORING.parBonus, 150);
  assert.equal(SCORING.maxStrikes, 3);
});

test('zero cards opened: full base plus the par bonus', () => {
  assert.equal(scoreCase(solvedCase({ cardsOpened: 0 })), 1000 + 150);
});

test('opening every card costs 75 each', () => {
  // 10-card pool, par 4: no bonus.
  assert.equal(scoreCase(solvedCase({ cardsOpened: 10, par: 4 })), 1000 - 750);
});

test('score floors at zero', () => {
  assert.equal(scoreCase(solvedCase({ cardsOpened: 14, par: 4 })), 0); // 1000 - 1050
  assert.equal(scoreCase(solvedCase({ cardsOpened: 10, wrongAccusations: 2, par: 4 })), 0); // 1000 - 750 - 400
  assert.equal(scoreCase(solvedCase({ cardsOpened: 100, wrongAccusations: 9, par: 1 })), 0);
});

test('each wrong accusation costs 200', () => {
  const clean = scoreCase(solvedCase());
  assert.equal(scoreCase(solvedCase({ wrongAccusations: 1 })), clean - 200);
  assert.equal(scoreCase(solvedCase({ wrongAccusations: 2 })), clean - 400);
});

test('par bonus applies at cards == par, not at par + 1', () => {
  const atPar = scoreCase(solvedCase({ cardsOpened: 3, par: 3 }));
  const overPar = scoreCase(solvedCase({ cardsOpened: 4, par: 3 }));
  const underPar = scoreCase(solvedCase({ cardsOpened: 2, par: 3 }));
  assert.equal(atPar, 1000 - 225 + 150);
  assert.equal(overPar, 1000 - 300);
  assert.equal(underPar, 1000 - 150 + 150);
  assert.equal(atPar - overPar, 75 + 150); // one more card, and the bonus is gone
});

test('par bonus still applies with strikes, but not to an unsolved case', () => {
  assert.equal(scoreCase(solvedCase({ cardsOpened: 3, par: 3, wrongAccusations: 1 })), 1000 - 225 - 200 + 150);
  assert.equal(scoreCase({ cardsOpened: 1, wrongAccusations: 0, par: 3, solved: false }), 0);
  assert.equal(scoreCase({ cardsOpened: 0, wrongAccusations: 3, par: 3, solved: false }), 0);
});

test('rejects nonsense input', () => {
  assert.throws(() => scoreCase(solvedCase({ cardsOpened: -1 })), RangeError);
  assert.throws(() => scoreCase(solvedCase({ wrongAccusations: 1.5 })), RangeError);
  assert.throws(() => scoreCase(solvedCase({ par: undefined })), RangeError);
});

test('rules can be overridden without touching the defaults', () => {
  assert.equal(scoreCase(solvedCase({ cardsOpened: 4 }), { ...SCORING, perCard: 100, parBonus: 0 }), 600);
  assert.equal(SCORING.perCard, 75);
});

test('run score is the sum of case scores', () => {
  const run = scoreRun([solvedCase({ cardsOpened: 3 }), { ...solvedCase(), solved: false, wrongAccusations: 1 }]);
  assert.deepEqual(run.caseScores, [1000 - 225 + 150, 0]);
  assert.equal(run.total, 925);
  assert.equal(run.strikes, 1);
  assert.equal(run.ended, false);
});

test('streak bonus grows with consecutive solved cases and resets on a miss', () => {
  const win = () => solvedCase({ cardsOpened: 3 }); // 925 each
  const miss = () => ({ cardsOpened: 2, wrongAccusations: 0, par: 3, solved: false });
  const run = scoreRun([win(), win(), win(), miss(), win(), win()]);
  assert.deepEqual(run.streakBonuses, [0, 50, 100, 0, 0, 50]);
  assert.equal(run.total, 5 * 925 + 200);
  assert.equal(scoreRun([win()]).total, 925); // a single win has no streak
});

test('streak bonus is capped', () => {
  const win = () => solvedCase({ cardsOpened: 3 });
  const run = scoreRun(Array.from({ length: 9 }, win));
  assert.equal(Math.max(...run.streakBonuses), SCORING.streakCap * SCORING.streakStep);
  assert.deepEqual(run.streakBonuses.slice(-2), [250, 250]);
});

test('a solved case whose score floors at 0 still counts toward the streak', () => {
  const grim = solvedCase({ cardsOpened: 14, par: 4 }); // scores 0
  const run = scoreRun([grim, grim]);
  assert.deepEqual(run.caseScores, [0, 0]);
  assert.deepEqual(run.streakBonuses, [0, 50]);
});

test('three strikes end the run; later cases are ignored', () => {
  const strike = (n, solved) => ({ cardsOpened: 2, wrongAccusations: n, par: 3, solved });
  const run = scoreRun([strike(1, true), strike(1, true), strike(1, false), solvedCase()]);
  assert.equal(run.strikes, 3);
  assert.equal(run.ended, true);
  assert.equal(run.casesCounted, 3);
  assert.equal(run.caseScores.length, 3);
});

test('strikes accumulate across cases but two do not end the run', () => {
  const run = scoreRun([
    { cardsOpened: 2, wrongAccusations: 2, par: 3, solved: true },
    solvedCase(),
  ]);
  assert.equal(run.strikes, 2);
  assert.equal(run.ended, false);
  assert.equal(run.casesCounted, 2);
});

test('empty run', () => {
  assert.deepEqual(scoreRun([]), { total: 0, caseScores: [], streakBonuses: [], casesCounted: 0, strikes: 0, ended: false });
});

test('scoreBreakdown itemises the same total scoreCase returns', () => {
  const cases = [
    solvedCase({ cardsOpened: 3, par: 3 }),
    solvedCase({ cardsOpened: 4, par: 3, wrongAccusations: 1 }),
    solvedCase({ cardsOpened: 14, par: 4 }),
    { cardsOpened: 2, wrongAccusations: 3, par: 3, solved: false },
  ];
  for (const c of cases) {
    const b = scoreBreakdown(c);
    assert.equal(b.total, scoreCase(c));
    assert.equal(b.total, Math.max(0, b.subtotal));
    assert.equal(b.subtotal, b.base + b.cardPenalty + b.strikePenalty + b.parBonus);
  }
  assert.deepEqual(scoreBreakdown(solvedCase({ cardsOpened: 4, par: 3, wrongAccusations: 1 })), {
    solved: true, base: 1000, cardPenalty: -300, strikePenalty: -200, parBonus: 0, subtotal: 500, total: 500, floored: false,
  });
  assert.equal(scoreBreakdown(solvedCase({ cardsOpened: 14, par: 4 })).floored, true);
  assert.equal(scoreBreakdown(solvedCase({ cardsOpened: 3, par: 3 })).parBonus, 150);
});
