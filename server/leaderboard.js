// The leaderboard on top of a Redis-like `redis.pipeline(commands)`.
//
//   ld:leaderboard:v1   sorted set of the best 100 runs. Member = a JSON string
//                       { id, name, score, solved, at }. Redis score = sortKey().
//   ld:rl:<hash>        per-IP submission counter that expires on its own.

import { LEADERBOARD, validateName } from '../lib/leaderboard.js';

export const BOARD_KEY = 'ld:leaderboard:v1';
const RATE_PREFIX = 'ld:rl:';

// One number that sorts by score (higher first) and, on equal scores, by time
// (earlier first). Scores stay far below 1e5 and times far below 1e10 seconds,
// so the product stays an exact integer in a double.
const SPAN = 1e10;
export function sortKey(score, atSeconds) {
  return score * SPAN + (SPAN - 1 - atSeconds);
}

function defaultId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseEntry(member, rank) {
  try {
    const e = JSON.parse(member);
    // Names are re-checked on the way out, so a stricter word list takes effect
    // retroactively and nothing odd in the store can reach a page.
    if (!validateName(e.name).ok || validateName(e.name).name !== e.name) return null;
    if (!Number.isSafeInteger(e.score) || !Number.isInteger(e.solved) || typeof e.id !== 'string') return null;
    return { rank, id: e.id, name: e.name, score: e.score, solved: e.solved, at: e.at };
  } catch {
    return null;
  }
}

export function createLeaderboard({ redis, now = Date.now, newId = defaultId }) {
  return {
    // Record a run. Returns the new entry's id and its 1-based rank, or a null
    // rank if it did not make the stored top list.
    async submit({ name, score, casesSolved }) {
      if (!Number.isSafeInteger(score) || score < 0 || score >= 1e5) throw new RangeError('score out of range');
      const at = now();
      const id = newId();
      const member = JSON.stringify({ id, name, score, solved: casesSolved, at });
      const [, , rank] = await redis.pipeline([
        ['ZADD', BOARD_KEY, sortKey(score, Math.floor(at / 1000)), member],
        ['ZREMRANGEBYRANK', BOARD_KEY, 0, -(LEADERBOARD.stored + 1)], // keep only the best `stored`
        ['ZREVRANK', BOARD_KEY, member],
      ]);
      return { id, rank: rank === null ? null : rank + 1 };
    },

    // The best `count` entries, best first.
    async top(count = LEADERBOARD.shown) {
      const [members] = await redis.pipeline([['ZREVRANGE', BOARD_KEY, 0, count - 1]]);
      return members.map((m, i) => parseEntry(m, i + 1)).filter(Boolean);
    },

    // Count one submission against `ipHash`. allowed is false past the limit.
    async hit(ipHash, { max, windowSeconds } = LEADERBOARD.rateLimit) {
      const key = `${RATE_PREFIX}${ipHash}`;
      const [, count, ttl] = await redis.pipeline([
        ['SET', key, 0, 'EX', windowSeconds, 'NX'], // creates the counter with its expiry, once
        ['INCR', key],
        ['TTL', key],
      ]);
      return { allowed: count <= max, count, retryAfter: ttl > 0 ? ttl : windowSeconds };
    },
  };
}
