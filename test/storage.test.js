import test from 'node:test';
import assert from 'node:assert/strict';

// storage.js reads window.localStorage; give it controllable fakes.
function install(localStorage) {
  globalThis.window = localStorage === undefined ? {} : { localStorage };
}
const fresh = async () => (await import(`../public/js/storage.js?${Math.random()}`));
const memoryStore = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
};
const KEY = 'logicDetective.v1';
const BLANK = { seenHowTo: false, best: null, name: null, lastRun: null };

test('defaults: first visit, no best', async () => {
  install(memoryStore());
  const { loadProfile } = await fresh();
  assert.deepEqual(loadProfile(), BLANK);
});

test('saves and reloads the first-visit flag and personal best', async () => {
  const store = memoryStore();
  install(store);
  const { loadProfile, saveProfile } = await fresh();
  assert.equal(saveProfile({ seenHowTo: true }), true);
  assert.equal(saveProfile({ best: 2450 }), true);
  assert.deepEqual(JSON.parse(store.data[KEY]), { ...BLANK, seenHowTo: true, best: 2450 });
  const again = await fresh();
  assert.deepEqual(again.loadProfile(), { ...BLANK, seenHowTo: true, best: 2450 });
});

test('works with storage that throws on every access', async () => {
  const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
  install({ getItem: boom, setItem: boom });
  const { loadProfile, saveProfile } = await fresh();
  assert.deepEqual(loadProfile(), BLANK);
  assert.equal(saveProfile({ best: 100 }), false, 'reports that it could not persist');
  assert.equal(loadProfile().best, 100, 'but the value survives in memory for this session');
});

test('works when window.localStorage itself throws or is missing', async () => {
  globalThis.window = { get localStorage() { throw new DOMException('denied', 'SecurityError'); } };
  let mod = await fresh();
  assert.deepEqual(mod.loadProfile(), BLANK);
  assert.equal(mod.saveProfile({ seenHowTo: true }), false);

  install(undefined);
  mod = await fresh();
  assert.deepEqual(mod.loadProfile(), BLANK);
});

test('ignores corrupted or hostile stored values', async () => {
  for (const raw of ['{not json', 'null', '"str"', '{"best":"lots","seenHowTo":"yes"}', '{"best":null}']) {
    install(memoryStore({ [KEY]: raw }));
    const { loadProfile } = await fresh();
    const profile = loadProfile();
    assert.equal(typeof profile.seenHowTo, 'boolean', raw);
    assert.ok(profile.best === null || Number.isFinite(profile.best), raw);
    assert.equal(profile.best, null, raw);
  }
});

test('saves and reloads the nickname and the latest leaderboard run', async () => {
  const store = memoryStore();
  install(store);
  const { saveProfile } = await fresh();
  const lastRun = { id: 'abc123def4567890', rank: 4, score: 3120, name: 'Sam Spade' };
  assert.equal(saveProfile({ name: 'Sam Spade', lastRun }), true);
  const again = await fresh();
  assert.deepEqual(again.loadProfile(), { ...BLANK, name: 'Sam Spade', lastRun });
  // a name can be cleared again
  again.saveProfile({ name: null });
  assert.equal((await fresh()).loadProfile().name, null);
});

test('a stored nickname or latest run that breaks the rules is dropped on load', async () => {
  const bad = [
    { name: '<img src=x onerror=alert(1)>' }, { name: 'a' }, { name: 'x'.repeat(40) }, { name: 'shit' }, { name: 42 }, { name: '  padded  ' },
    { lastRun: { id: 'zz', rank: 1, score: 5, name: 'Sam' } }, // id not hex
    { lastRun: { id: 'abc', rank: 0, score: 5, name: 'Sam' } },
    { lastRun: { id: 'abc', rank: 1, score: -5, name: 'Sam' } },
    { lastRun: { id: 'abc', rank: 1, score: 5, name: '<b>' } },
    { lastRun: { id: 'abc', rank: 1.5, score: 5, name: 'Sam' } },
    { lastRun: 'nope' }, { lastRun: null },
  ];
  for (const extra of bad) {
    install(memoryStore({ [KEY]: JSON.stringify({ seenHowTo: true, best: 10, ...extra }) }));
    const profile = (await fresh()).loadProfile();
    assert.equal(profile.name, null, JSON.stringify(extra));
    assert.equal(profile.lastRun, null, JSON.stringify(extra));
    assert.equal(profile.seenHowTo, true);
  }
  // a rank of null (outside the top 100) is legitimate
  install(memoryStore({ [KEY]: JSON.stringify({ lastRun: { id: 'abc', rank: null, score: 7, name: 'Sam' } }) }));
  assert.deepEqual((await fresh()).loadProfile().lastRun, { id: 'abc', rank: null, score: 7, name: 'Sam' });
});
