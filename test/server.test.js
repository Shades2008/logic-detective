import test from 'node:test';
import assert from 'node:assert/strict';
import { handleScores } from '../server/scores.js';
import { createLeaderboard, BOARD_KEY, sortKey } from '../server/leaderboard.js';
import { createUpstash, StoreError } from '../server/upstash.js';
import { createMemoryRedis, createFakeUpstashFetch } from '../server/memoryRedis.js';
import { LEADERBOARD, scoreSubmission } from '../lib/leaderboard.js';
import { LEVELS } from '../lib/data.js';
import { SCORING, scoreRun } from '../lib/scoring.js';

const c = (level, cardsOpened, wrongAccusations, solved) => ({ level, cardsOpened, wrongAccusations, solved });
const fullRun = () => [c(1, 2, 0, true), c(2, 3, 0, true), c(3, 4, 1, true), c(4, 5, 0, true)];
const FULL_RUN_SCORE = 1000 + 925 + 500 + 625 + 300;

// An app wired to the in-memory store, a controllable clock, and predictable ids.
function makeApp({ start = 1_800_000_000_000 } = {}) {
  let time = start;
  let n = 0;
  const memory = createMemoryRedis({ now: () => time });
  const deps = { redis: memory, now: () => time, newId: () => `id${String(++n).padStart(4, '0')}`, env: { KV_REST_API_TOKEN: 'test-token' } };
  const post = (body, { ip = '203.0.113.7', headers = {}, raw } = {}) => handleScores(new Request('http://localhost/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...headers },
    body: raw ?? JSON.stringify(body),
  }), deps);
  const get = () => handleScores(new Request('http://localhost/api/scores'), deps);
  return { memory, deps, post, get, advance: (ms) => { time += ms; }, setTime: (t) => { time = t; } };
}
const body = async (res) => JSON.parse(await res.text());

// ---- submissions ------------------------------------------------------------------------

test('a valid submission is accepted, scored by the server and appears on the board', async () => {
  const app = makeApp();
  const res = await app.post({ name: 'Sam Spade', cases: fullRun() });
  assert.equal(res.status, 201);
  const out = await body(res);
  assert.deepEqual(Object.keys(out).sort(), ['casesSolved', 'id', 'ok', 'rank', 'score']);
  assert.equal(out.ok, true);
  assert.equal(out.score, FULL_RUN_SCORE);
  assert.equal(out.casesSolved, 4);
  assert.equal(out.rank, 1);
  assert.match(res.headers.get('cache-control'), /no-store/);

  const list = await body(await app.get());
  assert.equal(list.entries.length, 1);
  assert.deepEqual(list.entries[0], { rank: 1, id: out.id, name: 'Sam Spade', score: FULL_RUN_SCORE, solved: 4, at: 1_800_000_000_000 });
});

test('the score is recomputed on the server with scoreRun, using the levels\' minPar', async () => {
  const app = makeApp();
  const cases = [c(1, 2, 0, true), c(2, 3, 1, true), c(3, 3, 0, true), c(4, 6, 0, true)];
  const expected = scoreRun(cases.map((x) => ({ ...x, par: LEVELS[x.level - 1].minPar }))).total;
  const out = await body(await app.post({ name: 'Marlowe', cases }));
  assert.equal(out.score, expected);
  assert.equal(out.score, scoreSubmission(cases).score);
});

test('tampered or inflated totals are ignored', async () => {
  const app = makeApp();
  const inflated = {
    name: 'Cheater', cases: fullRun().map((x) => ({ ...x, score: 99999, total: 99999, par: 99, caseScore: 99999 })),
    total: 123456, score: 123456, runScore: 123456, points: 123456,
  };
  const res = await app.post(inflated);
  assert.equal(res.status, 201);
  const out = await body(res);
  assert.equal(out.score, FULL_RUN_SCORE);
  const stored = (await body(await app.get())).entries[0];
  assert.equal(stored.score, FULL_RUN_SCORE);
  assert.doesNotMatch(JSON.stringify(stored), /123456|99999/);
});

// ---- rejections ---------------------------------------------------------------------------

test('every rejection returns 400, stores nothing, and says which rule failed', async () => {
  const app = makeApp();
  const cases = {
    'more than 4 cases': { name: 'Sam', cases: [...fullRun(), c(5, 2, 0, true)], error: 'cases-count' },
    'zero cases': { name: 'Sam', cases: [], error: 'cases-count' },
    'levels out of order': { name: 'Sam', cases: [c(2, 2, 0, true), c(1, 2, 0, true)], error: 'level-order' },
    'total strikes above 3': { name: 'Sam', cases: [c(1, 2, 2, true), c(2, 2, 2, false)], error: 'too-many-strikes' },
    'solved with 1 card': { name: 'Sam', cases: [c(1, 1, 0, true), ...fullRun().slice(1)], error: 'too-few-cards' },
    'solved with 0 cards': { name: 'Sam', cases: [c(1, 0, 0, true), ...fullRun().slice(1)], error: 'too-few-cards' },
    'more cards than the pool': { name: 'Sam', cases: [c(1, LEVELS[0].poolSize + 1, 0, true), ...fullRun().slice(1)], error: 'cards-range' },
    'malformed case': { name: 'Sam', cases: [{ level: 1 }], error: 'malformed' },
    'string numbers': { name: 'Sam', cases: [c('1', 2, 0, true)], error: 'malformed' },
    'cases not an array': { name: 'Sam', cases: 'nope', error: 'cases-count' },
    'impossible run': { name: 'Sam', cases: [c(1, 2, 3, true)], error: 'inconsistent-run' },
    'unfinished run': { name: 'Sam', cases: [c(1, 2, 0, true)], error: 'incomplete-run' },
    'name too short': { name: 'S', cases: fullRun(), error: 'name-length' },
    'name too long': { name: 'S'.repeat(17), cases: fullRun(), error: 'name-length' },
    'name with bad characters': { name: 'Sam!', cases: fullRun(), error: 'name-chars' },
    'blocked name': { name: 'shit', cases: fullRun(), error: 'name-blocked' },
    'obfuscated blocked name': { name: 'f u c k', cases: fullRun(), error: 'name-blocked' },
    'missing name': { cases: fullRun(), error: 'name-type' },
    'name not a string': { name: 12345, cases: fullRun(), error: 'name-type' },
  };
  for (const [label, { error, ...payload }] of Object.entries(cases)) {
    const res = await app.post(payload, { ip: `198.51.100.${Object.keys(cases).indexOf(label) + 1}` });
    assert.equal(res.status, 400, label);
    const out = await body(res);
    assert.equal(out.error, error, label);
    assert.equal(typeof out.message, 'string', label);
  }
  assert.equal(app.memory.size(BOARD_KEY), 0, 'nothing was stored');
});

test('bad JSON, wrong method, wrong content type and oversized bodies', async () => {
  const app = makeApp();
  assert.equal((await app.post(null, { raw: '{not json' })).status, 400);
  assert.equal((await app.post(null, { raw: 'null' })).status, 400);
  assert.equal((await app.post(null, { raw: '[]' })).status, 400);
  assert.equal((await app.post({ name: 'Sam', cases: fullRun() }, { headers: { 'content-type': 'text/plain' } })).status, 415);
  const huge = await app.post(null, { raw: JSON.stringify({ name: 'Sam', cases: fullRun(), junk: 'x'.repeat(5000) }) });
  assert.equal(huge.status, 413);
  const put = await handleScores(new Request('http://localhost/api/scores', { method: 'PUT' }), app.deps);
  assert.equal(put.status, 405);
  assert.equal(put.headers.get('allow'), 'GET, POST');
  assert.equal(app.memory.size(BOARD_KEY), 0);
});

// ---- names ----------------------------------------------------------------------------------

test('names are trimmed and normalised before storing', async () => {
  const app = makeApp();
  await app.post({ name: '  Sam    Spade ', cases: fullRun() });
  assert.equal((await body(await app.get())).entries[0].name, 'Sam Spade');
});

test('a name containing HTML is rejected on the way in and never stored or returned', async () => {
  const app = makeApp();
  for (const name of ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '"><svg/onload=alert(1)>']) {
    assert.equal((await app.post({ name, cases: fullRun() })).status, 400, name);
  }
  assert.doesNotMatch(await (await app.get()).text(), /[<>]/);
  assert.deepEqual((await body(await app.get())).entries, []);
});

test('if something odd ever got into the store, GET still never returns it', async () => {
  const app = makeApp();
  const evil = [
    { id: 'e1', name: '<img src=x onerror=alert(1)>', score: 9000, solved: 4, at: 1 },
    { id: 'e2', name: 'shit', score: 8000, solved: 4, at: 1 }, // fails today's word list
    { id: 'e3', name: 'Fine Name', score: 7000, solved: 4, at: 1 },
  ];
  for (const e of evil) await app.memory.pipeline([['ZADD', BOARD_KEY, sortKey(e.score, 1), JSON.stringify(e)]]);
  await app.memory.pipeline([['ZADD', BOARD_KEY, 1, 'not even json']]);
  const out = await body(await app.get());
  assert.deepEqual(out.entries.map((e) => e.name), ['Fine Name']);
});

// ---- rate limiting --------------------------------------------------------------------------

test('rate limit: 10 submissions per IP per hour, then 429 with Retry-After', async () => {
  const app = makeApp();
  const ok = { name: 'Sam', cases: fullRun() };
  for (let i = 1; i <= LEADERBOARD.rateLimit.max; i++) assert.equal((await app.post(ok)).status, 201, `submission ${i}`);
  const blocked = await app.post(ok);
  assert.equal(blocked.status, 429);
  assert.equal((await body(blocked)).error, 'rate-limited');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0 && Number(blocked.headers.get('retry-after')) <= 3600);
  assert.equal(app.memory.size(BOARD_KEY), 10, 'the blocked submission was not stored');
});

test('rate limit: per IP, and the counter expires after the window', async () => {
  const app = makeApp();
  const ok = { name: 'Sam', cases: fullRun() };
  for (let i = 0; i < 10; i++) await app.post(ok, { ip: '203.0.113.1' });
  assert.equal((await app.post(ok, { ip: '203.0.113.1' })).status, 429);
  assert.equal((await app.post(ok, { ip: '203.0.113.2' })).status, 201, 'a different IP is unaffected');
  app.advance(3599 * 1000);
  assert.equal((await app.post(ok, { ip: '203.0.113.1' })).status, 429, 'still inside the hour');
  app.advance(2 * 1000);
  assert.equal((await app.post(ok, { ip: '203.0.113.1' })).status, 201, 'a new window has begun');
});

test('rate limit: rejected submissions count too, and the raw IP is never stored', async () => {
  const app = makeApp();
  for (let i = 0; i < 10; i++) assert.equal((await app.post({ name: 'x', cases: [] })).status, 400);
  assert.equal((await app.post({ name: 'Sam', cases: fullRun() })).status, 429);
  const keys = app.memory.keys().join(' ');
  assert.doesNotMatch(keys, /203\.0\.113\.7/);
  assert.match(keys, /ld:rl:[0-9a-f]{32}/);
});

test('rate limit: the client IP comes from x-forwarded-for first, then x-real-ip', async () => {
  const app = makeApp();
  const ok = { name: 'Sam', cases: fullRun() };
  for (let i = 0; i < 10; i++) await app.post(ok, { ip: '203.0.113.9, 10.0.0.1' });
  assert.equal((await app.post(ok, { ip: '203.0.113.9, 10.9.9.9' })).status, 429, 'same first entry, same client');
  const viaReal = (ip) => handleScores(new Request('http://localhost/api/scores', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(ok),
  }), app.deps);
  assert.equal((await viaReal('198.51.100.5')).status, 201);
});

// ---- ordering, trimming, top 20 --------------------------------------------------------------

test('ordering: higher score first; equal scores put the earlier run first', async () => {
  const app = makeApp();
  const run = (cardsLevel4) => [c(1, 2, 0, true), c(2, 3, 0, true), c(3, 4, 0, true), c(4, cardsLevel4, 0, true)];
  await app.post({ name: 'Mid', cases: run(6) }, { ip: '1.1.1.1' }); // lower score
  app.advance(5000);
  await app.post({ name: 'TopLate', cases: run(4) }, { ip: '1.1.1.2' }); // high score, later
  app.advance(-3000); // an earlier timestamp than TopLate
  await app.post({ name: 'TopEarly', cases: run(4) }, { ip: '1.1.1.3' });
  const names = (await body(await app.get())).entries.map((e) => e.name);
  assert.deepEqual(names, ['TopEarly', 'TopLate', 'Mid']);
  const entries = (await body(await app.get())).entries;
  assert.deepEqual(entries.map((e) => e.rank), [1, 2, 3]);
  assert.ok(entries[0].score === entries[1].score && entries[1].score > entries[2].score);
});

test('sortKey ranks by score, then earlier time, and stays an exact integer', () => {
  assert.ok(sortKey(2000, 100) > sortKey(1999, 1));
  assert.ok(sortKey(1000, 100) > sortKey(1000, 101));
  assert.ok(Number.isSafeInteger(sortKey(99999, 1_900_000_000)));
  assert.ok(sortKey(99999, 4_000_000_000) > sortKey(99998, 0));
});

test('trimming: only the best 100 runs are kept', async () => {
  const app = makeApp();
  const board = createLeaderboard({ redis: app.memory, now: () => 1_800_000_000_000, newId: (() => { let i = 0; return () => `t${++i}`; })() });
  for (let i = 0; i < 130; i++) await board.submit({ name: `P${i}`, score: 100 + i, casesSolved: 1 });
  assert.equal(app.memory.size(BOARD_KEY), LEADERBOARD.stored);
  const all = await board.top(200);
  assert.equal(all.length, 100);
  assert.equal(all[0].score, 229); // best kept
  assert.equal(all[99].score, 130); // 100th best; scores 100..129 were trimmed
  assert.ok(all.every((e) => e.score >= 130));
});

test('trimming: a run too low for the top 100 gets a null rank; one that makes it gets its rank', async () => {
  const app = makeApp();
  const board = createLeaderboard({ redis: app.memory, now: () => 1_800_000_000_000 });
  for (let i = 0; i < 100; i++) await board.submit({ name: `P${i}`, score: 1000 + i, casesSolved: 2 });
  assert.equal((await board.submit({ name: 'Low', score: 10, casesSolved: 0 })).rank, null);
  assert.equal(app.memory.size(BOARD_KEY), 100);
  assert.equal((await board.submit({ name: 'High', score: 5000, casesSolved: 4 })).rank, 1);
  assert.equal(app.memory.size(BOARD_KEY), 100, 'still capped');
});

test('GET returns the top 20 only, even with more stored', async () => {
  const app = makeApp();
  const board = createLeaderboard({ redis: app.memory, now: () => 1_800_000_000_000 });
  for (let i = 0; i < 45; i++) await board.submit({ name: `P${i}`, score: 500 + i, casesSolved: 1 });
  const out = await body(await app.get());
  assert.equal(out.entries.length, 20);
  assert.equal(LEADERBOARD.shown, 20);
  assert.deepEqual(out.entries.map((e) => e.score), Array.from({ length: 20 }, (_, i) => 544 - i));
  assert.deepEqual(out.entries.map((e) => e.rank), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.deepEqual(Object.keys(out), ['entries']);
});

test('GET on an empty board returns an empty list', async () => {
  const app = makeApp();
  const res = await app.get();
  assert.equal(res.status, 200);
  assert.deepEqual(await body(res), { entries: [] });
});

// ---- 503 fallback --------------------------------------------------------------------------------

test('without the Redis variables both GET and POST answer 503', async () => {
  for (const env of [{}, { KV_REST_API_URL: 'https://x.upstash.io' }, { KV_REST_API_TOKEN: 't' }, { KV_REST_API_URL: '', KV_REST_API_TOKEN: '' }, undefined]) {
    const get = await handleScores(new Request('http://localhost/api/scores'), { env });
    assert.equal(get.status, 503, JSON.stringify(env));
    const post = await handleScores(new Request('http://localhost/api/scores', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sam', cases: fullRun() }),
    }), { env });
    assert.equal(post.status, 503);
    assert.equal((await body(post)).error, 'unavailable');
  }
});

test('if Redis fails (down, timing out, rejecting commands) the API answers 503, not 500', async () => {
  const get = () => new Request('http://localhost/api/scores');
  const post = () => new Request('http://localhost/api/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sam', cases: fullRun() }) });
  const env = { KV_REST_API_URL: 'https://x.upstash.io', KV_REST_API_TOKEN: 'secret-token' };
  const failures = {
    'network error': async () => { throw new TypeError('fetch failed'); },
    'HTTP 500': async () => new Response('boom', { status: 500 }),
    'HTTP 401': async () => new Response('{}', { status: 401 }),
    'garbage body': async () => new Response('<html>', { status: 200 }),
    'command error': async () => new Response(JSON.stringify([{ error: 'ERR boom' }]), { status: 200 }),
  };
  for (const [label, fetchImpl] of Object.entries(failures)) {
    for (const req of [get(), post()]) {
      const res = await handleScores(req, { env, fetchImpl });
      assert.equal(res.status, 503, label);
      assert.doesNotMatch(await res.text(), /secret-token|upstash\.io/, `${label}: leaked store details`);
    }
  }
});

// ---- the Upstash client ----------------------------------------------------------------------------

test('Upstash client: one POST to /pipeline with the bearer token and commands as JSON arrays', async () => {
  const memory = createMemoryRedis();
  const fakeFetch = createFakeUpstashFetch(memory, { url: 'https://example.upstash.io/', token: 'tok' });
  const redis = createUpstash({ url: 'https://example.upstash.io/', token: 'tok', fetchImpl: fakeFetch });
  const results = await redis.pipeline([['SET', 'k', 0, 'EX', 60, 'NX'], ['INCR', 'k'], ['TTL', 'k']]);
  assert.deepEqual(results, ['OK', 1, 60]);
  assert.equal(fakeFetch.requests.length, 1);
  const [req] = fakeFetch.requests;
  assert.equal(req.url, 'https://example.upstash.io/pipeline');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.Authorization, 'Bearer tok');
  assert.deepEqual(req.body, [['SET', 'k', '0', 'EX', '60', 'NX'], ['INCR', 'k'], ['TTL', 'k']]);
});

test('Upstash client: injection-shaped player input stays an argument, never a command', async () => {
  const memory = createMemoryRedis();
  const fakeFetch = createFakeUpstashFetch(memory, { url: 'https://example.upstash.io', token: 'tok' });
  const app = makeApp();
  const redis = createUpstash({ url: 'https://example.upstash.io', token: 'tok', fetchImpl: fakeFetch });
  const out = await handleScores(new Request('http://localhost/api/scores', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ name: 'Sam', cases: fullRun() }),
  }), { redis, now: app.deps.now });
  assert.equal(out.status, 201);
  const commands = fakeFetch.requests.flatMap((r) => r.body.map((cmd) => cmd[0]));
  assert.deepEqual([...new Set(commands)].sort(), ['INCR', 'SET', 'TTL', 'ZADD', 'ZREMRANGEBYRANK', 'ZREVRANK']);
});

test('the real handler talks to Upstash with only KV_REST_API_URL and KV_REST_API_TOKEN', async () => {
  const memory = createMemoryRedis();
  const env = {
    KV_REST_API_URL: 'https://example.upstash.io', KV_REST_API_TOKEN: 'the-write-token',
    KV_REST_API_READ_ONLY_TOKEN: 'read-only-NEVER', KV_URL: 'rediss://nope', REDIS_URL: 'rediss://nope',
  };
  const fakeFetch = createFakeUpstashFetch(memory, { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN });
  const res = await handleScores(new Request('http://localhost/api/scores', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' }, body: JSON.stringify({ name: 'Sam', cases: fullRun() }),
  }), { env, fetchImpl: fakeFetch });
  assert.equal(res.status, 201);
  assert.ok(fakeFetch.requests.length >= 2);
  for (const r of fakeFetch.requests) {
    assert.equal(r.url, 'https://example.upstash.io/pipeline');
    assert.equal(r.headers.Authorization, 'Bearer the-write-token');
    assert.doesNotMatch(JSON.stringify(r), /read-only-NEVER|rediss:/);
  }
  // Reads work through the same path.
  const read = await handleScores(new Request('http://localhost/api/scores'), { env, fetchImpl: fakeFetch });
  assert.equal((await body(read)).entries.length, 1);
});

test('Upstash client: timeouts and failures become StoreError without leaking the token or URL', async () => {
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const slow = createUpstash({ url: 'https://example.upstash.io', token: 'tok-secret', fetchImpl: hang, timeoutMs: 20 });
  await assert.rejects(() => slow.pipeline([['INCR', 'k']]), (e) => e instanceof StoreError && /timed out/.test(e.message) && !/tok-secret|example/.test(e.message));
  const down = createUpstash({ url: 'https://example.upstash.io', token: 'tok-secret', fetchImpl: async () => { throw new TypeError('connect ECONNREFUSED example.upstash.io tok-secret'); } });
  await assert.rejects(() => down.pipeline([['INCR', 'k']]), (e) => e instanceof StoreError && !/tok-secret|example/.test(e.message));
  const wrongLength = createUpstash({ url: 'https://x', token: 't', fetchImpl: async () => new Response('[]', { status: 200 }) });
  await assert.rejects(() => wrongLength.pipeline([['INCR', 'k']]), StoreError);
});

// ---- the in-memory Redis behaves like Redis for what we use ------------------------------------------

test('memory Redis: zset ordering, ranks, negative indexes and expiry', async () => {
  let t = 0;
  const r = createMemoryRedis({ now: () => t });
  await r.pipeline([['ZADD', 'z', 1, 'a'], ['ZADD', 'z', 3, 'c'], ['ZADD', 'z', 2, 'b'], ['ZADD', 'z', 2, 'a2']]);
  assert.deepEqual((await r.pipeline([['ZREVRANGE', 'z', 0, -1]]))[0], ['c', 'b', 'a2', 'a']); // ties: lexicographic, reversed
  assert.deepEqual((await r.pipeline([['ZREVRANK', 'z', 'c'], ['ZREVRANK', 'z', 'a'], ['ZREVRANK', 'z', 'nope']])), [0, 3, null]);
  assert.equal((await r.pipeline([['ZREMRANGEBYRANK', 'z', 0, -3]]))[0], 2); // removes the two lowest, keeps top 2
  assert.deepEqual((await r.pipeline([['ZREVRANGE', 'z', 0, -1]]))[0], ['c', 'b']);
  assert.deepEqual(await r.pipeline([['SET', 'k', 0, 'EX', 10, 'NX'], ['SET', 'k', 5, 'EX', 10, 'NX'], ['INCR', 'k'], ['TTL', 'k']]), ['OK', null, 1, 10]);
  t = 11_000;
  assert.deepEqual(await r.pipeline([['TTL', 'k'], ['SET', 'k', 0, 'EX', 10, 'NX']]), [-2, 'OK']);
  await assert.rejects(() => r.pipeline([['FLUSHALL']]), /unsupported/);
  // a negative stop that overshoots the start is empty, not a wrap-around (the trim command depends on it)
  const small = createMemoryRedis();
  for (let i = 0; i < 60; i++) await small.pipeline([['ZADD', 'z', i, `m${i}`]]);
  assert.equal((await small.pipeline([['ZREMRANGEBYRANK', 'z', 0, -101]]))[0], 0);
  assert.equal(small.size('z'), 60);
  assert.deepEqual((await small.pipeline([['ZREVRANGE', 'z', 0, -61]]))[0], []);
  assert.equal((await small.pipeline([['ZREMRANGEBYRANK', 'z', 0, -51]]))[0], 10);
});

// ---- leaks ---------------------------------------------------------------------------------------------

test('leak check: no response or stored entry exposes a culprit, par or seed, and client-sent ones are not kept', async () => {
  const app = makeApp();
  const res = await app.post({
    name: 'Sam', cases: fullRun().map((x) => ({ ...x, par: 2, seed: 'SEEDSEED', culprit: 3, culpritName: 'Eddie' })),
    seed: 'SEEDSEED', culprit: 3, par: 2,
  });
  const text = await res.text();
  const listText = await (await app.get()).text();
  for (const output of [text, listText]) {
    for (const key of ['culprit', 'par', 'seed', 'SEEDSEED', 'Eddie']) assert.ok(!output.includes(key), `output exposed ${key}`);
  }
  const stored = (await app.memory.pipeline([['ZREVRANGE', BOARD_KEY, 0, -1]]))[0].join('');
  for (const key of ['culprit', 'par', 'seed', 'SEEDSEED', 'Eddie']) assert.ok(!stored.includes(key), `store holds ${key}`);
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['at', 'id', 'name', 'score', 'solved']);
  assert.equal(SCORING.maxStrikes, 3);
});

// ---- structure -----------------------------------------------------------------------------------------

test('server modules use only web-standard APIs; api/scores.js is a thin wrapper', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  for (const file of readdirSync(new URL('../server/', import.meta.url)).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(new URL(`../server/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /from\s+['"]node:/, `${file} imports a node: module`);
    assert.doesNotMatch(src, /\bprocess\./, `${file} reads process (only api/scores.js may)`);
    assert.doesNotMatch(src, /\brequire\s*\(/, file);
    assert.doesNotMatch(src, /KV_REST_API_READ_ONLY_TOKEN|REDIS_URL|KV_URL\b/, `${file} must not use the unused connection strings`);
  }
  const route = readFileSync(new URL('../api/scores.js', import.meta.url), 'utf8');
  assert.match(route, /export function GET/);
  assert.match(route, /export function POST/);
  assert.match(route, /handleScores\(request, \{ env: process\.env \}\)/);
  assert.equal(readdirSync(new URL('../api/', import.meta.url)).join(','), 'scores.js', 'api/ holds only route files');
});
