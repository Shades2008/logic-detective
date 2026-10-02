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

test('defaults: first visit, no best', async () => {
  install(memoryStore());
  const { loadProfile } = await fresh();
  assert.deepEqual(loadProfile(), { seenHowTo: false, best: null });
});

test('saves and reloads the first-visit flag and personal best', async () => {
  const store = memoryStore();
  install(store);
  const { loadProfile, saveProfile } = await fresh();
  assert.equal(saveProfile({ seenHowTo: true }), true);
  assert.equal(saveProfile({ best: 2450 }), true);
  assert.deepEqual(JSON.parse(store.data[KEY]), { seenHowTo: true, best: 2450 });
  const again = await fresh();
  assert.deepEqual(again.loadProfile(), { seenHowTo: true, best: 2450 });
});

test('works with storage that throws on every access', async () => {
  const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
  install({ getItem: boom, setItem: boom });
  const { loadProfile, saveProfile } = await fresh();
  assert.deepEqual(loadProfile(), { seenHowTo: false, best: null });
  assert.equal(saveProfile({ best: 100 }), false, 'reports that it could not persist');
  assert.equal(loadProfile().best, 100, 'but the value survives in memory for this session');
});

test('works when window.localStorage itself throws or is missing', async () => {
  globalThis.window = { get localStorage() { throw new DOMException('denied', 'SecurityError'); } };
  let mod = await fresh();
  assert.deepEqual(mod.loadProfile(), { seenHowTo: false, best: null });
  assert.equal(mod.saveProfile({ seenHowTo: true }), false);

  install(undefined);
  mod = await fresh();
  assert.deepEqual(mod.loadProfile(), { seenHowTo: false, best: null });
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
