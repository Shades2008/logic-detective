import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateName, validateRun, validateSubmission, scoreSubmission, isBlockedName,
  LEADERBOARD, NAME_RULES, MAX_CASES,
} from '../lib/leaderboard.js';
import { LEVELS, MIN_CARDS_TO_ACCUSE } from '../lib/data.js';
import { SCORING, scoreRun } from '../lib/scoring.js';
import { createGameClient } from '../public/js/gameClient.js';
import { generateCase } from '../lib/generator.js';
import { createRng } from '../lib/rng.js';

const c = (level, cardsOpened, wrongAccusations, solved) => ({ level, cardsOpened, wrongAccusations, solved });
// A clean four-case run, and a run that ended on the third strike in case 2.
const fullRun = () => [c(1, 2, 0, true), c(2, 3, 0, true), c(3, 4, 1, true), c(4, 5, 0, true)];
const strikeOut = () => [c(1, 2, 1, true), c(2, 3, 2, false)];

// ---- names ----------------------------------------------------------------------

test('constants are what the spec says', () => {
  assert.deepEqual(NAME_RULES, { min: 2, max: 16 });
  assert.equal(LEADERBOARD.stored, 100);
  assert.equal(LEADERBOARD.shown, 20);
  assert.deepEqual(LEADERBOARD.rateLimit, { max: 10, windowSeconds: 3600 });
});

test('names: accepted shapes', () => {
  for (const name of ['Ab', 'Sam', 'sam_the-man 42', 'A1', '1234567890123456', 'under_score', 'dash-ed', 'Two Words']) {
    assert.deepEqual(validateName(name), { ok: true, name }, name);
  }
});

test('names: length boundaries after trimming', () => {
  assert.equal(validateName('a').error, 'name-length');
  assert.equal(validateName('').error, 'name-length');
  assert.equal(validateName('   ').error, 'name-length');
  assert.equal(validateName(' a ').error, 'name-length');
  assert.equal(validateName('ab').ok, true);
  assert.equal(validateName('x'.repeat(16)).ok, true);
  assert.equal(validateName('x'.repeat(17)).error, 'name-length');
  assert.equal(validateName('x'.repeat(10000)).error, 'name-length');
});

test('names: trims, and collapses runs of spaces so lookalikes are not distinct', () => {
  assert.deepEqual(validateName('  Sam   Spade  '), { ok: true, name: 'Sam Spade' });
});

test('names: only letters, numbers, space, hyphen and underscore', () => {
  for (const name of ['sam!', 'a.b', 'a@b', 'a/b', "o'neil", 'a\tb', 'a\nb', 'émile', '名前です', 'a😀b', 'a;b', 'a,b', 'a:b', 'a+b', 'a=b', 'a#b', 'a%b', 'a\\b', 'a\u0000b', 'ａｂｃ']) {
    assert.equal(validateName(name).error, 'name-chars', JSON.stringify(name));
  }
  assert.equal(validateName('--').error, 'name-chars', 'needs at least one letter or number');
  assert.equal(validateName('__ __').error, 'name-chars');
});

test('names: HTML and script payloads are rejected by the character rule', () => {
  for (const name of ['<b>hi</b>', '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'a&lt;b', "'; DROP TABLE"]) {
    assert.equal(validateName(name).ok, false, name);
  }
});

test('names: non-strings are rejected', () => {
  for (const v of [undefined, null, 42, true, {}, [], ['Sam']]) assert.equal(validateName(v).error, 'name-type');
});

test('names: blocked words, including simple obfuscation', () => {
  for (const name of ['fuck', 'FUCK', 'Fuck You', 'sh1t', 'f u c k', 'f_u-c_k', 'fuuuuck', 'xxshitxx', 'b1tch', 'wh0re', 'Nazi', 'n4z1', 'hitler', 'Adolf Hitler', 'kkk', 'rape', 'r4pe']) {
    assert.equal(validateName(name).error, 'name-blocked', name);
  }
});

test('names: ordinary words that merely contain a blocked word are allowed', () => {
  for (const name of ['grape', 'Grapes', 'therapist', 'Hitchcock', 'Class', 'Scrape r', 'agape']) {
    assert.deepEqual(validateName(name), { ok: true, name }, name);
  }
  assert.equal(isBlockedName('Sam Spade'), false);
});

test('known limitation: substring matching has false positives (documented, accepted)', () => {
  // Collapsing repeated letters catches "fuuuck" but also turns "Shiitake" into "shitake".
  // A best-effort filter is a floor, not a promise; the player can pick another name.
  assert.equal(validateName('Shiitake').error, 'name-blocked');
  assert.equal(validateName('Scunthorpe').error, 'name-blocked');
});

test('name errors carry a friendly message and never reveal the blocked word', () => {
  const r = validateName('fuck');
  assert.equal(r.message, 'Please pick a different nickname.');
  assert.doesNotMatch(JSON.stringify(r), /fuck/);
});

// ---- runs -------------------------------------------------------------------------

test('valid runs: full, and ended by three strikes in one case or across cases', () => {
  assert.equal(validateRun(fullRun()).ok, true);
  assert.equal(validateRun(strikeOut()).ok, true);
  assert.equal(validateRun([c(1, 2, 3, false)]).ok, true); // three strikes in the first case
  assert.equal(validateRun([c(1, 2, 0, true), c(2, 2, 0, true), c(3, 2, 0, true), c(4, 2, 2, true)]).ok, true); // 2 strikes, finished
});

test('rejects: not an array, empty, or more than 4 cases', () => {
  for (const v of [undefined, null, 'x', {}, 5]) assert.equal(validateRun(v).error, 'cases-count');
  assert.equal(validateRun([]).error, 'cases-count');
  assert.equal(MAX_CASES, 4);
  assert.equal(validateRun([...fullRun(), c(5, 2, 0, true)]).error, 'cases-count');
  assert.equal(validateRun([...fullRun(), ...fullRun()]).error, 'cases-count');
});

test('rejects: levels out of order, repeated, skipped or out of range', () => {
  assert.equal(validateRun([c(2, 2, 0, true), c(1, 2, 0, true)]).error, 'level-order');
  assert.equal(validateRun([c(1, 2, 0, true), c(1, 2, 0, true)]).error, 'level-order');
  assert.equal(validateRun([c(1, 2, 0, true), c(3, 2, 0, true)]).error, 'level-order');
  assert.equal(validateRun([c(2, 2, 0, true)]).error, 'level-order');
  assert.equal(validateRun([c(5, 2, 0, true)]).error, 'level-order');
  assert.equal(validateRun([c(0, 2, 0, true)]).error, 'level-order');
});

test('rejects: total strikes above 3, including split across cases', () => {
  assert.equal(validateRun([c(1, 2, 4, false)]).error, 'strikes-range');
  assert.equal(validateRun([c(1, 2, 2, true), c(2, 2, 2, false)]).error, 'too-many-strikes');
  assert.equal(validateRun([c(1, 2, 2, true), c(2, 2, 2, true), c(3, 2, 0, true), c(4, 2, 0, true)]).error, 'too-many-strikes');
});

test('rejects: a solved case with fewer than MIN_CARDS_TO_ACCUSE cards', () => {
  assert.equal(MIN_CARDS_TO_ACCUSE, 2);
  for (const cards of [0, 1]) {
    const run = fullRun();
    run[0] = c(1, cards, 0, true);
    assert.equal(validateRun(run).error, 'too-few-cards', `${cards} cards`);
  }
  assert.equal(validateRun([c(1, 1, 1, false)]).error, 'too-few-cards', 'a strike also needs an accusation');
});

test('rejects: more cards than the level pool size, at every level', () => {
  for (const level of LEVELS) {
    const run = fullRun();
    run[level.level - 1] = c(level.level, level.poolSize + 1, 0, true);
    assert.equal(validateRun(run).error, 'cards-range', `level ${level.level}`);
    // exactly the pool size is fine
    run[level.level - 1] = c(level.level, level.poolSize, 0, true);
    assert.equal(validateRun(run).ok, true, `level ${level.level} at the limit`);
  }
});

test('rejects: runs the rules cannot produce', () => {
  // solved after the third strike
  assert.equal(validateRun([c(1, 2, 3, true)]).error, 'inconsistent-run');
  // unsolved without three strikes
  assert.equal(validateRun([c(1, 2, 1, false)]).error, 'inconsistent-run');
  assert.equal(validateRun([c(1, 2, 0, false)]).error, 'inconsistent-run');
  // a case after the run already ended on strikes
  assert.equal(validateRun([c(1, 2, 3, false), c(2, 2, 0, true)]).error, 'inconsistent-run');
  // unfinished run: solved but not all four cases
  assert.equal(validateRun([c(1, 2, 0, true), c(2, 2, 0, true)]).error, 'incomplete-run');
  assert.equal(validateRun([c(1, 2, 0, true)]).error, 'incomplete-run');
});

test('rejects: malformed case entries', () => {
  const base = c(1, 2, 0, true);
  const variants = [
    null, 'x', 5, [], {},
    { ...base, level: '1' }, { ...base, level: 1.5 }, { ...base, level: -1 }, { ...base, level: NaN }, { ...base, level: null },
    { ...base, cardsOpened: '2' }, { ...base, cardsOpened: 2.5 }, { ...base, cardsOpened: -2 }, { ...base, cardsOpened: Infinity }, { ...base, cardsOpened: undefined },
    { ...base, wrongAccusations: '0' }, { ...base, wrongAccusations: -1 }, { ...base, wrongAccusations: 0.5 },
    { ...base, solved: 'true' }, { ...base, solved: 1 }, { ...base, solved: null }, { ...base, solved: undefined },
    { cardsOpened: 2, wrongAccusations: 0, solved: true },
  ];
  for (const v of variants) {
    assert.equal(validateRun([v, ...fullRun().slice(1)]).ok, false, JSON.stringify(v));
  }
});

test('extra fields on cases are ignored and stripped, never trusted', () => {
  const run = fullRun().map((x) => ({ ...x, par: 0, seed: 'abc', culprit: 3, score: 99999, total: 99999 }));
  const out = validateRun(run);
  assert.equal(out.ok, true);
  for (const k of out.cases) assert.deepEqual(Object.keys(k).sort(), ['cardsOpened', 'level', 'solved', 'wrongAccusations']);
});

// ---- submissions & scoring -----------------------------------------------------------

test('validateSubmission returns the cleaned name and cases, ignoring extra top-level fields', () => {
  const out = validateSubmission({ name: '  Sam  Spade ', cases: fullRun(), total: 999999, score: 1, par: 1, seed: 's' });
  assert.equal(out.ok, true);
  assert.equal(out.name, 'Sam Spade');
  assert.equal(out.cases.length, 4);
  assert.deepEqual(Object.keys(out).sort(), ['cases', 'name', 'ok']);
});

test('validateSubmission rejects non-objects and reports the first problem', () => {
  for (const v of [null, undefined, 'x', 5, [], [{ name: 'Sam' }]]) assert.equal(validateSubmission(v).error, 'malformed');
  assert.equal(validateSubmission({ name: 'x', cases: fullRun() }).error, 'name-length');
  assert.equal(validateSubmission({ name: 'Sam', cases: [] }).error, 'cases-count');
  assert.equal(validateSubmission({ cases: fullRun() }).error, 'name-type');
});

test('score is recomputed with scoreRun and the levels\' minPar; no client number can change it', () => {
  const cases = fullRun();
  const expected = scoreRun(cases.map((x) => ({ ...x, par: LEVELS[x.level - 1].minPar })));
  const result = scoreSubmission(validateSubmission({ name: 'Sam', cases, total: 123456, score: 123456 }).cases);
  assert.equal(result.score, expected.total);
  assert.equal(result.casesSolved, 4);
  assert.equal(result.strikes, 1);
  assert.notEqual(result.score, 123456);
  // hand-computed: L1 2 cards par2 -> 1000; L2 3 cards par3 -> 925; L3 4 cards,1 strike par3 -> 1000-300-200=500; L4 5 cards par4 -> 625; streak 0+50+100+150
  assert.equal(result.score, 1000 + 925 + 500 + 625 + 300);
});

test('a struck-out run scores only its solved cases', () => {
  const r = scoreSubmission(validateRun(strikeOut()).cases);
  assert.equal(r.casesSolved, 1);
  assert.equal(r.strikes, 3);
  assert.equal(r.score, 1000 - 150 - 200 + 150); // case 1: 2 cards, 1 strike, par 2
});

// ---- cross-check against the real game ---------------------------------------------------

test('every run the real game can produce passes validation and scores identically', () => {
  const rng = createRng('leaderboard-property');
  for (let n = 0; n < 400; n++) {
    const cases = [];
    const client = createGameClient({
      generate: (o) => { const g = generateCase(o); cases.push(g); return g; },
    });
    client.startRun();
    for (;;) {
      const g = cases[cases.length - 1];
      let view = client.getCase();
      // open between MIN and poolSize cards, in a random order
      const want = MIN_CARDS_TO_ACCUSE + rng.int(g.clues.length - MIN_CARDS_TO_ACCUSE + 1);
      for (const i of rng.shuffle(view.cards.map((card) => card.index)).slice(0, want)) view = client.openCard(i);
      // some wrong guesses first, sometimes striking out
      const wrongs = rng.int(4);
      let ended = false;
      for (let w = 0; w < wrongs && !ended; w++) {
        const guess = view.suspects.find((s) => s.index !== g.culprit && !view.innocents.includes(s.index));
        view = client.accuse(guess.index).case;
        ended = view.status !== 'playing';
      }
      if (!ended) view = client.accuse(g.culprit).case;
      if (view.runOver) break;
      client.nextCase();
    }
    const summary = client.getRunSummary();
    const body = { name: 'Sam', cases: summary.cases.map(({ level, cardsOpened, wrongAccusations, solved }) => ({ level, cardsOpened, wrongAccusations, solved })) };
    const checked = validateSubmission(body);
    assert.equal(checked.ok, true, `run ${n}: ${JSON.stringify(checked)} for ${JSON.stringify(body.cases)}`);
    assert.equal(scoreSubmission(checked.cases).score, summary.total, `run ${n}: server score differs from the game's`);
  }
});
