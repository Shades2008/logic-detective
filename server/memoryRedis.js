// A small in-memory stand-in for the handful of Redis commands the leaderboard
// uses. It exists so tests (and `DEV_MEMORY_STORE=1 npm run dev`) never need a
// real Redis. It follows Redis semantics for these commands: sorted sets order
// by score then member, negative indexes count from the end, keys expire.
//
// Supported: SET key value [EX s] [NX], INCR, TTL, ZADD, ZCARD, ZREVRANK,
// ZREVRANGE, ZREMRANGEBYRANK. Anything else throws, so a typo in a command
// fails a test instead of silently passing.

export function createMemoryRedis({ now = Date.now } = {}) {
  const strings = new Map(); // key -> { value, expiresAt|null }
  const zsets = new Map(); // key -> Map(member -> score)

  const live = (key) => {
    const item = strings.get(key);
    if (item && item.expiresAt !== null && item.expiresAt <= now()) { strings.delete(key); return undefined; }
    return item;
  };
  // Redis range rules: negative indexes count from the end, a stop that lands
  // before the start of the list means "empty" (it does not wrap around).
  const range = (length, start, stop) => {
    const from = Number(start) < 0 ? Math.max(length + Number(start), 0) : Number(start);
    const to = Number(stop) < 0 ? length + Number(stop) : Math.min(Number(stop), length - 1);
    return to < from || to < 0 ? [] : [from, to];
  };
  const sorted = (key) => [...(zsets.get(key) ?? new Map())]
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); // ascending, like Redis

  const run = ([cmd, ...args]) => {
    switch (String(cmd).toUpperCase()) {
      case 'SET': {
        const [key, value, ...opts] = args;
        const upper = opts.map((o) => String(o).toUpperCase());
        if (upper.includes('NX') && live(key)) return null;
        const ex = upper.indexOf('EX');
        strings.set(key, { value: String(value), expiresAt: ex >= 0 ? now() + Number(opts[ex + 1]) * 1000 : null });
        return 'OK';
      }
      case 'INCR': {
        const [key] = args;
        const item = live(key) ?? { value: '0', expiresAt: null };
        item.value = String(Number(item.value) + 1);
        strings.set(key, item);
        return Number(item.value);
      }
      case 'TTL': {
        const item = live(args[0]);
        if (!item) return -2;
        return item.expiresAt === null ? -1 : Math.ceil((item.expiresAt - now()) / 1000);
      }
      case 'ZADD': {
        const [key, score, member] = args;
        if (!zsets.has(key)) zsets.set(key, new Map());
        const set = zsets.get(key);
        const added = set.has(member) ? 0 : 1;
        set.set(member, Number(score));
        return added;
      }
      case 'ZCARD':
        return (zsets.get(args[0]) ?? new Map()).size;
      case 'ZREVRANK': {
        const asc = sorted(args[0]).map(([m]) => m);
        const at = asc.indexOf(args[1]);
        return at === -1 ? null : asc.length - 1 - at;
      }
      case 'ZREVRANGE': {
        const [key, start, stop] = args;
        const desc = sorted(key).map(([m]) => m).reverse();
        const bounds = range(desc.length, start, stop);
        return bounds.length ? desc.slice(bounds[0], bounds[1] + 1) : [];
      }
      case 'ZREMRANGEBYRANK': {
        const [key, start, stop] = args;
        const asc = sorted(key).map(([m]) => m);
        const bounds = range(asc.length, start, stop);
        const doomed = bounds.length ? asc.slice(bounds[0], bounds[1] + 1) : [];
        for (const member of doomed) zsets.get(key)?.delete(member);
        return doomed.length;
      }
      default:
        throw new Error(`memoryRedis: unsupported command ${cmd}`);
    }
  };

  return {
    async pipeline(commands) {
      return commands.map(run);
    },
    // test helpers
    keys: () => [...strings.keys(), ...zsets.keys()],
    size: (key) => (zsets.get(key) ?? new Map()).size,
  };
}

// A fetch() that behaves like the Upstash REST endpoint in front of a memory
// store, so the real createUpstash client can be tested end to end.
export function createFakeUpstashFetch(memory, { url, token }) {
  const requests = [];
  const fake = async (input, init = {}) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(input), method: init.method, headers: init.headers, body });
    if (String(input) !== `${url.replace(/\/+$/, '')}/pipeline` || init.headers?.Authorization !== `Bearer ${token}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const out = [];
    for (const cmd of body) {
      try {
        out.push({ result: (await memory.pipeline([cmd]))[0] });
      } catch (err) {
        out.push({ error: String(err.message) });
      }
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  fake.requests = requests;
  return fake;
}
