import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDom } from './fakeDom.js';
import { createH } from '../public/js/dom.js';
import { renderLeaderboard } from '../public/js/leaderboardView.js';
import { renderNameForm } from '../public/js/nameForm.js';
import { createLeaderboardClient, toSubmission } from '../public/js/leaderboardClient.js';
import { createGameClient } from '../public/js/gameClient.js';
import { generateCase } from '../lib/generator.js';

const setup = () => { const dom = createFakeDom(); return { dom, h: createH(dom.document) }; };
const entry = (rank, name, score, solved = 4, id = `id${rank}`) => ({ rank, id, name, score, solved, at: 1 });

// ---- rendering ------------------------------------------------------------------------

test('the board shows rank, name, score and cases solved', () => {
  const { dom, h } = setup();
  const node = renderLeaderboard({ h, state: { status: 'ok', entries: [entry(1, 'Marlowe', 3850), entry(2, 'Velma', 1200, 2)] } });
  const rows = dom.findAll(node, (n) => n.tag === 'tr');
  assert.equal(rows.length, 3); // header + 2
  assert.deepEqual(dom.findAll(rows[0], (n) => n.tag === 'th').map(dom.textOf), ['#', 'Name', 'Score', 'Solved']);
  assert.deepEqual(dom.findAll(rows[1], (n) => n.tag === 'th' || n.tag === 'td').map(dom.textOf), ['1', 'Marlowe', '3,850', '4 of 4']);
  assert.deepEqual(dom.findAll(rows[2], (n) => n.tag === 'th' || n.tag === 'td').map(dom.textOf), ['2', 'Velma', '1,200', '2 of 4']);
});

test('a name containing HTML is rendered as text, never as markup', () => {
  const { dom, h } = setup();
  const nasty = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '"><svg onload=alert(1)>', '&lt;b&gt;'];
  const node = renderLeaderboard({
    h, state: { status: 'ok', entries: nasty.map((n, i) => entry(i + 1, n, 100 - i)) }, latest: { id: 'id2', rank: 2, score: 99, name: nasty[1] },
  });
  assert.deepEqual(dom.writes.innerHTML, [], 'innerHTML must never be written by the leaderboard');
  const texts = dom.textNodes(node);
  for (const n of nasty) assert.ok(texts.includes(n), `${n} should be a plain text node`);
  assert.equal(dom.findAll(node, (x) => ['img', 'script', 'svg'].includes(x.tag)).length, 0, 'no element was created from a name');
});

test('the player\'s latest run is highlighted with a class, aria-current and a visible "You"', () => {
  const { dom, h } = setup();
  const node = renderLeaderboard({ h, state: { status: 'ok', entries: [entry(1, 'A1', 900), entry(2, 'Me', 800), entry(3, 'C3', 700)] }, latest: { id: 'id2', rank: 2, score: 800, name: 'Me' } });
  const mine = dom.findAll(node, (n) => n.tag === 'tr' && n.className === 'mine');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].getAttribute('aria-current'), 'true');
  assert.match(dom.textOf(mine[0]), /Me You/);
  assert.equal(dom.findAll(node, (n) => n.getAttribute('aria-current') === 'true').length, 1);
});

test('a latest run outside the top 20 gets a line below the table; outside the top 100 says so', () => {
  const { dom, h } = setup();
  const entries = [entry(1, 'Top', 900)];
  const below = renderLeaderboard({ h, state: { status: 'ok', entries }, latest: { id: 'zz', rank: 37, score: 640, name: 'Sam' } });
  assert.match(dom.textOf(below), /Your latest run: #37, Sam, 640 points\./);
  const out = renderLeaderboard({ h, state: { status: 'ok', entries }, latest: { id: 'zz', rank: null, score: 120, name: 'Sam' } });
  assert.match(dom.textOf(out), /did not make the top 100/);
  const none = renderLeaderboard({ h, state: { status: 'ok', entries }, latest: null });
  assert.doesNotMatch(dom.textOf(none), /latest run/);
});

test('loading, empty, unavailable and error states, with Try again where it helps', () => {
  const { dom, h } = setup();
  let retried = 0;
  const onRetry = () => { retried++; };
  assert.match(dom.textOf(renderLeaderboard({ h, state: { status: 'loading' } })), /Loading/);
  assert.match(dom.textOf(renderLeaderboard({ h, state: { status: 'ok', entries: [] } })), /No runs yet/);

  for (const [status, pattern] of [['unavailable', /unavailable right now.*can still play/], ['error', /Could not load/]]) {
    const node = renderLeaderboard({ h, state: { status }, onRetry });
    assert.match(dom.textOf(node), pattern);
    const button = dom.find(node, (n) => n.tag === 'button');
    assert.equal(dom.textOf(button), 'Try again');
    button.listeners.click[0]();
  }
  assert.equal(retried, 2);
  // status messages are announced politely to screen readers
  assert.equal(renderLeaderboard({ h, state: { status: 'loading' } }).getAttribute('role'), 'status');
});

// ---- nickname form ------------------------------------------------------------------------------

function submitName(dom, form, text) {
  const input = dom.find(form, (n) => n.tag === 'input');
  input.value = text;
  form.listeners.submit[0]({ preventDefault() {} });
  return { input, error: dom.find(form, (n) => n.attrs.role === 'alert') };
}

test('the name form saves a valid, cleaned-up name', () => {
  const { dom, h } = setup();
  const saved = [];
  const form = renderNameForm({ h, onSave: (n) => saved.push(n) });
  const { error } = submitName(dom, form, '  Sam   Spade ');
  assert.deepEqual(saved, ['Sam Spade']);
  assert.equal(dom.textOf(error), '');
});

test('the name form shows the rule that was broken and does not save', () => {
  const { dom, h } = setup();
  const saved = [];
  const form = renderNameForm({ h, onSave: (n) => saved.push(n) });
  for (const [text, message] of [['a', /2 to 16 characters/], ['Sam!', /Letters, numbers/], ['<b>hi</b>', /Letters, numbers/], ['f u c k', /different nickname/], ['x'.repeat(17), /2 to 16/]]) {
    const { input, error } = submitName(dom, form, text);
    assert.match(dom.textOf(error), message, text);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
  }
  assert.deepEqual(saved, []);
});

test('a blank name clears it (a nickname is optional); the form prefills the current name', () => {
  const { dom, h } = setup();
  const saved = [];
  const form = renderNameForm({ h, currentName: 'Marlowe', onSave: (n) => saved.push(n) });
  assert.equal(dom.find(form, (n) => n.tag === 'input').getAttribute('value'), 'Marlowe');
  submitName(dom, form, '   ');
  assert.deepEqual(saved, [null]);
});

test('the name field is built for touch and keyboards: label, 16 char limit, no autocapitalise', () => {
  const { dom, h } = setup();
  const form = renderNameForm({ h, onSave() {} });
  const input = dom.find(form, (n) => n.tag === 'input');
  assert.equal(input.getAttribute('maxlength'), '16');
  assert.equal(input.getAttribute('autocomplete'), 'off');
  assert.equal(input.getAttribute('autocapitalize'), 'off');
  const label = dom.find(form, (n) => n.tag === 'label');
  assert.equal(label.getAttribute('for'), input.getAttribute('id'));
  assert.ok(input.getAttribute('aria-describedby').includes('-error'));
});

// ---- the fetch client -------------------------------------------------------------------------------

const res = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

test('fetchTop maps every outcome to a status and never throws', async () => {
  const run = (fetchImpl) => createLeaderboardClient({ fetchImpl }).fetchTop();
  assert.deepEqual(await run(async () => res(200, { entries: [entry(1, 'A1', 5)] })), { status: 'ok', entries: [entry(1, 'A1', 5)] });
  assert.deepEqual(await run(async () => res(503, { error: 'unavailable' })), { status: 'unavailable' });
  assert.deepEqual(await run(async () => res(500, {})), { status: 'error' });
  assert.deepEqual(await run(async () => res(200, { nope: 1 })), { status: 'error' });
  assert.deepEqual(await run(async () => new Response('<html>', { status: 200 })), { status: 'error' });
  assert.deepEqual(await run(async () => { throw new TypeError('offline'); }), { status: 'error' });
});

test('submit maps every outcome to a status and never throws', async () => {
  const summary = { cases: [] };
  const run = (fetchImpl) => createLeaderboardClient({ fetchImpl }).submit('Sam', summary);
  assert.deepEqual(await run(async () => res(201, { ok: true, id: 'abc', score: 4000, casesSolved: 4, rank: 3 })), { status: 'ok', id: 'abc', score: 4000, rank: 3 });
  assert.deepEqual(await run(async () => res(201, { ok: true, id: 'abc', score: 10, casesSolved: 0, rank: null })), { status: 'ok', id: 'abc', score: 10, rank: null });
  assert.deepEqual(await run(async () => res(429, { error: 'rate-limited' }, { 'Retry-After': '120' })), { status: 'rate-limited', retryAfter: 120 });
  assert.deepEqual(await run(async () => res(400, { error: 'x', message: 'Bad run.' })), { status: 'rejected', message: 'Bad run.' });
  assert.deepEqual(await run(async () => res(503, { error: 'unavailable' })), { status: 'unavailable' });
  assert.deepEqual(await run(async () => res(500, {})), { status: 'error' });
  assert.deepEqual(await run(async () => res(201, { ok: false })), { status: 'error' });
  assert.deepEqual(await run(async () => { throw new TypeError('offline'); }), { status: 'error' });
});

test('what the browser sends: the nickname and four fields per case, and nothing else', async () => {
  // Play a real run so the summary has everything the game knows (culprit names, par, breakdowns...).
  const cases = [];
  const game = createGameClient({ generate: (o) => { const g = generateCase(o); cases.push(g); return g; } });
  game.startRun();
  for (;;) {
    game.openCard(0); game.openCard(1);
    const out = game.accuse(cases[cases.length - 1].culprit);
    if (out.case.runOver) break;
    game.nextCase();
  }
  const summary = game.getRunSummary();
  assert.ok('culpritName' in summary.cases[0] && 'breakdown' in summary.cases[0] && summary.total > 0, 'the summary itself is rich');

  let sent;
  const client = createLeaderboardClient({ fetchImpl: async (url, init) => { sent = { url, init }; return res(201, { ok: true, id: 'a', score: 1, casesSolved: 4, rank: 1 }); } });
  await client.submit('Sam Spade', summary);
  assert.equal(sent.url, 'api/scores');
  assert.equal(sent.init.method, 'POST');
  const body = JSON.parse(sent.init.body);
  assert.deepEqual(Object.keys(body).sort(), ['cases', 'name']);
  assert.equal(body.name, 'Sam Spade');
  assert.equal(body.cases.length, 4);
  for (const c of body.cases) assert.deepEqual(Object.keys(c).sort(), ['cardsOpened', 'level', 'solved', 'wrongAccusations']);
  const wire = sent.init.body;
  for (const forbidden of ['total', 'score', 'par', 'seed', 'culprit', 'breakdown', 'caseScore', 'streak']) {
    assert.ok(!wire.includes(forbidden), `the request body contains "${forbidden}"`);
  }
  assert.deepEqual(toSubmission('X1', summary).cases, body.cases);
});
