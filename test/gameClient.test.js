import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameClient, GameError, TOTAL_CASES } from '../public/js/gameClient.js';
import { generateCase } from '../lib/generator.js';
import { LEVELS } from '../lib/data.js';
import { SCORING, scoreRun } from '../lib/scoring.js';
import { clueToText } from '../lib/text.js';

// A client whose generated cases we can see, so tests know the culprit even
// though the adapter never reveals it.
function recordingClient(tamper = (c) => c) {
  const cases = [];
  const client = createGameClient({
    generate: (opts) => {
      const c = tamper(generateCase(opts));
      cases.push(c);
      return c;
    },
  });
  return { client, cases, current: () => cases[cases.length - 1] };
}

const innocentFor = (view, culprit) => view.suspects.find((s) => s.index !== culprit && !view.innocents.includes(s.index)).index;
const solveCase = (client, rec) => client.accuse(rec.current().culprit);
const wrongGuess = (client, rec) => client.accuse(innocentFor(client.getCase(), rec.current().culprit));

const expectCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected GameError ${code}`);

test('a run is 4 cases, one per level in order, with the level sizes from LEVELS', () => {
  const rec = recordingClient();
  let view = rec.client.startRun();
  assert.equal(TOTAL_CASES, 4);
  for (let n = 1; n <= 4; n++) {
    const config = LEVELS[n - 1];
    assert.equal(view.caseNumber, n);
    assert.equal(view.totalCases, 4);
    assert.equal(view.level, n);
    assert.equal(view.suspects.length, config.suspects);
    assert.equal(view.cards.length, config.poolSize);
    assert.deepEqual(view.suspects.map((s) => s.position), view.suspects.map((_, i) => i + 1));
    assert.equal(view.status, 'playing');
    const { correct, case: done } = solveCase(rec.client, rec);
    assert.equal(correct, true);
    assert.equal(done.status, 'solved');
    assert.equal(done.runOver, n === 4);
    if (n < 4) view = rec.client.nextCase();
  }
  expectCode(() => rec.client.nextCase(), 'run-over');
  const summary = rec.client.getRunSummary();
  assert.equal(summary.over, true);
  assert.equal(summary.endedBy, 'completed');
  assert.equal(summary.casesSolved, 4);
  assert.equal(summary.cases.length, 4);
});

test('every card is face-down (label only) until opened', () => {
  const rec = recordingClient();
  const view = rec.client.startRun();
  for (const card of view.cards) {
    assert.deepEqual(Object.keys(card).sort(), ['index', 'label', 'opened']);
    assert.equal(card.opened, false);
  }
  assert.deepEqual(view.log, []);
  const after = rec.client.openCard(3);
  assert.equal(after.cards[3].opened, true);
  assert.equal(after.cards[3].text, clueToText(rec.current().clues[3]));
  assert.equal(after.cards[2].opened, false);
  assert.equal(after.cards[2].text, undefined);
  assert.deepEqual(after.log.map((l) => l.index), [3]);
});

test('opening a card does not eliminate or reveal anyone', () => {
  const rec = recordingClient();
  const before = rec.client.startRun();
  const after = rec.client.openCard(0);
  assert.deepEqual(after.innocents, []);
  assert.deepEqual(after.suspects, before.suspects);
  assert.equal(after.status, 'playing');
});

test('opening the same card twice is not double-counted', () => {
  const rec = recordingClient();
  rec.client.startRun();
  rec.client.openCard(0);
  const again = rec.client.openCard(0);
  assert.equal(again.cardsOpened, 1);
  assert.equal(again.log.length, 1);
  rec.client.openCard(1);
  assert.equal(rec.client.getCase().cardsOpened, 2);
  const { case: done } = solveCase(rec.client, rec);
  assert.equal(done.result.cardsOpened, 2);
  assert.equal(done.result.breakdown.cardPenalty, -2 * SCORING.perCard);
});

test('a wrong accusation is a strike: suspect cleared, same case continues, cards stay open', () => {
  const rec = recordingClient();
  rec.client.startRun();
  rec.client.openCard(4);
  const wrong = innocentFor(rec.client.getCase(), rec.current().culprit);
  const { correct, case: view } = rec.client.accuse(wrong);
  assert.equal(correct, false);
  assert.equal(view.strikes, 1);
  assert.deepEqual(view.innocents, [wrong]);
  assert.equal(view.status, 'playing');
  assert.equal(view.cards[4].opened, true);
  assert.equal(view.cardsOpened, 1);
  expectCode(() => rec.client.accuse(wrong), 'already-cleared'); // no double strike
  assert.equal(rec.client.getCase().strikes, 1);
  const { correct: ok, case: done } = solveCase(rec.client, rec);
  assert.equal(ok, true);
  assert.equal(done.result.wrongAccusations, 1);
  assert.equal(done.result.breakdown.strikePenalty, -SCORING.perWrongAccusation);
});

test('strikes carry across cases', () => {
  const rec = recordingClient();
  rec.client.startRun();
  wrongGuess(rec.client, rec); // strike 1 in case 1
  solveCase(rec.client, rec);
  const c2 = rec.client.nextCase();
  assert.equal(c2.strikes, 1, 'case 2 starts with the strike from case 1');
  const { case: afterWrong } = wrongGuess(rec.client, rec);
  assert.equal(afterWrong.strikes, 2);
  solveCase(rec.client, rec);
  const c3 = rec.client.nextCase();
  assert.equal(c3.strikes, 2);
  assert.equal(rec.client.getRunSummary().strikes, 2);
});

test('the third strike ends the run immediately, even across cases', () => {
  const rec = recordingClient();
  rec.client.startRun();
  wrongGuess(rec.client, rec);
  solveCase(rec.client, rec);
  rec.client.nextCase();
  wrongGuess(rec.client, rec);
  solveCase(rec.client, rec);
  rec.client.nextCase(); // case 3, 2 strikes banked
  const { case: view } = wrongGuess(rec.client, rec); // strike 3
  assert.equal(view.strikes, 3);
  assert.equal(view.status, 'failed');
  assert.equal(view.runOver, true);
  assert.equal(view.result.solved, false);
  assert.equal(view.result.caseScore, 0);
  expectCode(() => rec.client.nextCase(), 'run-over');
  const summary = rec.client.getRunSummary();
  assert.equal(summary.over, true);
  assert.equal(summary.endedBy, 'strikes');
  assert.equal(summary.cases.length, 3, 'case 4 is never played');
});

test('three strikes inside one case also end the run', () => {
  const rec = recordingClient();
  rec.client.startRun();
  wrongGuess(rec.client, rec);
  wrongGuess(rec.client, rec);
  const { case: view } = wrongGuess(rec.client, rec);
  assert.equal(view.status, 'failed');
  assert.equal(view.runOver, true);
  assert.equal(view.result.culprit, rec.current().culprit); // revealed now that it has ended
  assert.equal(rec.client.getRunSummary().endedBy, 'strikes');
});

test('run score equals scoreRun of the case results', () => {
  const rec = recordingClient();
  rec.client.startRun();
  // case 1: 2 cards, clean; case 2: 4 cards + 1 strike; case 3: 0 cards; case 4: 10 cards
  const plan = [
    { open: 2, wrong: 0 },
    { open: 4, wrong: 1 },
    { open: 0, wrong: 0 },
    { open: 10, wrong: 0 },
  ];
  plan.forEach((p, i) => {
    for (let c = 0; c < p.open; c++) rec.client.openCard(c);
    for (let w = 0; w < p.wrong; w++) wrongGuess(rec.client, rec);
    const { case: done } = solveCase(rec.client, rec);
    assert.ok(done.runScore >= 0);
    if (i < 3) rec.client.nextCase();
  });
  const expected = scoreRun(plan.map((p, i) => ({
    cardsOpened: p.open, wrongAccusations: p.wrong, par: LEVELS[i].minPar, solved: true,
  })));
  const summary = rec.client.getRunSummary();
  assert.equal(summary.total, expected.total);
  assert.deepEqual(summary.cases.map((c) => c.caseScore), expected.caseScores);
  assert.deepEqual(summary.cases.map((c) => c.streakBonus), expected.streakBonuses);
  assert.equal(summary.streakBonusTotal, expected.streakBonuses.reduce((a, b) => a + b, 0));
  assert.equal(rec.client.getCase().runScore, expected.total);
});

test('par comes from minPar in LEVELS, never from the per-case computed par', () => {
  const rec = recordingClient((c) => ({ ...c, par: 99 })); // a wildly different computed par
  let view = rec.client.startRun();
  for (let n = 1; n <= 4; n++) {
    assert.equal(view.par, LEVELS[n - 1].minPar);
    // open exactly minPar cards: the par bonus must apply
    for (let i = 0; i < view.par; i++) rec.client.openCard(i);
    const { case: done } = solveCase(rec.client, rec);
    assert.equal(done.result.par, LEVELS[n - 1].minPar);
    assert.equal(done.result.breakdown.parBonus, SCORING.parBonus);
    if (n < 4) view = rec.client.nextCase();
  }
  const source = readFileSync(new URL('../public/js/gameClient.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bdata\.par\b/, 'the adapter must not read a par off the case data');
});

test('calls in the wrong state are rejected', () => {
  const rec = recordingClient();
  expectCode(() => rec.client.getCase(), 'no-run');
  expectCode(() => rec.client.openCard(0), 'no-run');
  expectCode(() => rec.client.accuse(0), 'no-run');
  expectCode(() => rec.client.nextCase(), 'no-run');
  expectCode(() => rec.client.getRunSummary(), 'no-run');

  rec.client.startRun();
  expectCode(() => rec.client.nextCase(), 'case-not-over');
  expectCode(() => rec.client.openCard(-1), 'bad-index');
  expectCode(() => rec.client.openCard(99), 'bad-index');
  expectCode(() => rec.client.openCard(1.5), 'bad-index');
  expectCode(() => rec.client.accuse(-1), 'bad-index');
  expectCode(() => rec.client.accuse(99), 'bad-index');
  expectCode(() => rec.client.accuse('0'), 'bad-index');
  assert.equal(rec.client.getCase().strikes, 0, 'rejected calls cost nothing');
});

test('accusing or opening after a case has ended is rejected', () => {
  const rec = recordingClient();
  rec.client.startRun();
  solveCase(rec.client, rec);
  expectCode(() => rec.client.accuse(0), 'case-over');
  expectCode(() => rec.client.accuse(rec.current().culprit), 'case-over');
  expectCode(() => rec.client.openCard(0), 'case-over');
  // ...including after a run-ending third strike
  const rec2 = recordingClient();
  rec2.client.startRun();
  for (let i = 0; i < 3; i++) wrongGuess(rec2.client, rec2);
  expectCode(() => rec2.client.accuse(rec2.current().culprit), 'case-over');
  assert.equal(rec2.client.getCase().strikes, 3);
});

test('startRun starts afresh: strikes, score and cases reset', () => {
  const rec = recordingClient();
  rec.client.startRun();
  wrongGuess(rec.client, rec);
  solveCase(rec.client, rec);
  const fresh = rec.client.startRun();
  assert.equal(fresh.caseNumber, 1);
  assert.equal(fresh.strikes, 0);
  assert.equal(fresh.runScore, 0);
  assert.equal(rec.client.getRunSummary().cases.length, 0);
});

// ---- leaks ----------------------------------------------------------------

function keysOf(x, out = new Set()) {
  if (Array.isArray(x)) x.forEach((v) => keysOf(v, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.add(k); keysOf(v, out); }
  return out;
}

function assertNoLeak(label, exposed, rec, openedIndices, allowedKeys = []) {
  const json = JSON.stringify(exposed);
  const keys = keysOf(exposed);
  for (const forbidden of ['culprit', 'culpritName', 'seed', 'attempt', 'negate', 'relation', 'type', 'value', 'clues', 'mode']) {
    if (allowedKeys.includes(forbidden)) continue;
    assert.ok(!keys.has(forbidden), `${label}: exposed key "${forbidden}"`);
  }
  assert.ok(!json.includes(rec.current().seed), `${label}: seed leaked`);
  if (!allowedKeys.includes('par')) assert.ok((json.match(/"par":/g) ?? []).length <= 1, `${label}: more than one par`);
  rec.current().clues.forEach((clue, i) => {
    if (!openedIndices.has(i)) assert.ok(!json.includes(clueToText(clue)), `${label}: unopened card ${i} text leaked`);
  });
}

test('nothing the adapter exposes during a case contains the culprit, par (other than the shown one), seed or unopened clues', () => {
  for (const startLevelCases of [0, 1, 2, 3]) {
    const rec = recordingClient();
    rec.client.startRun();
    for (let n = 0; n < startLevelCases; n++) { solveCase(rec.client, rec); rec.client.nextCase(); }
    const opened = new Set();
    const check = (label, exposed) => assertNoLeak(`${label} (case ${startLevelCases + 1})`, exposed, rec, opened);

    check('fresh case', rec.client.getCase());
    const poolSize = rec.current().clues.length;
    for (const i of [0, Math.floor(poolSize / 2), poolSize - 1]) {
      opened.add(i);
      check(`after opening ${i}`, rec.client.openCard(i));
      check(`after opening ${i}, getCase`, rec.client.getCase());
    }
    const { case: afterWrong } = wrongGuess(rec.client, rec);
    check('after wrong accusation', afterWrong);
    // The summary may name culprits of cases that have already ended, but never the current one.
    const midSummary = rec.client.getRunSummary();
    assertNoLeak(`run summary mid-case (case ${startLevelCases + 1})`, midSummary, rec, opened, ['culpritName', 'par']);
    assert.equal(midSummary.cases.length, startLevelCases, 'the unfinished case is not in the summary');
    assert.equal(midSummary.over, false);
    // The "culprit" is only revealed once the case has ended.
    const { case: ended } = solveCase(rec.client, rec);
    assert.equal(ended.result.culprit, rec.current().culprit);
  }
});

test('the exposed par is the level constant, not the computed per-case value', () => {
  const rec = recordingClient();
  const view = rec.client.startRun();
  assert.equal(view.par, LEVELS[0].minPar);
});

test('returned views are copies: mutating one cannot change the game', () => {
  const rec = recordingClient();
  const view = rec.client.startRun();
  view.cards[0].opened = true;
  view.cards[0].text = 'forged';
  view.suspects[0].name = 'Forged';
  view.innocents.push(1);
  view.log.push({ index: 0, label: 'Hat', text: 'forged' });
  view.strikes = 99;
  const again = rec.client.getCase();
  assert.equal(again.cards[0].opened, false);
  assert.equal(again.cards[0].text, undefined);
  assert.notEqual(again.suspects[0].name, 'Forged');
  assert.deepEqual(again.innocents, []);
  assert.deepEqual(again.log, []);
  assert.equal(again.strikes, 0);
  assert.equal(rec.client.getCase().cardsOpened, 0);
});

// ---- seeding ----------------------------------------------------------------

test('each run is seeded from crypto.getRandomValues', () => {
  const calls = [];
  const random = { getRandomValues(arr) { calls.push(arr.length); arr.set([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x67]); return arr; } };
  const seeds = [];
  const client = createGameClient({ random, generate: (o) => { seeds.push(o.seed); return generateCase(o); } });
  client.startRun();
  assert.deepEqual(calls, [8]);
  assert.equal(seeds[0], 'deadbeef01234567-1');
  client.startRun();
  assert.equal(calls.length, 2, 'a new run draws new randomness');
});

test('default seeding really is random: runs differ, and the seed is 64 bits of hex', () => {
  const seeds = new Set();
  const client = createGameClient({ generate: (o) => { seeds.add(o.seed); return generateCase(o); } });
  for (let i = 0; i < 20; i++) client.startRun();
  assert.equal(seeds.size, 20);
  for (const s of seeds) assert.match(s, /^[0-9a-f]{16}-1$/);
});
