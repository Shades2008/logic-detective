// Request handling for /api/scores, written against the web-standard Request
// and Response so it runs on Vercel and in plain Node tests alike.
//
//   GET   -> 200 { entries: [{ rank, id, name, score, solved, at }] }  (top 20)
//   POST  -> 201 { ok, id, score, casesSolved, rank }
//            body { name, cases: [{ level, cardsOpened, wrongAccusations, solved }] }
//
// The client never sends a score: the server recomputes it with scoreRun.
// Without Redis configured, or if Redis fails, the API answers 503 and the game
// carries on without a leaderboard.

import { LEADERBOARD, scoreSubmission, validateSubmission } from '../lib/leaderboard.js';
import { createLeaderboard } from './leaderboard.js';
import { StoreError, createUpstash } from './upstash.js';

const MAX_BODY_BYTES = 4096;

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

const unavailable = () => json(503, { error: 'unavailable', message: 'The leaderboard is unavailable right now.' });

// Vercel overwrites x-forwarded-for, so the first entry is the real client.
function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') ?? 'unknown').trim() || 'unknown';
}

// Hashed so no raw IP is stored; salted with the server-only token so the hash
// can't be reversed by trying every IPv4 address.
async function hashIp(ip, salt) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ld-rl:${salt}:${ip}`));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

function storeFrom({ env = {}, redis, fetchImpl }) {
  if (redis) return redis;
  const url = env.KV_REST_API_URL;
  const token = env.KV_REST_API_TOKEN;
  if (!url || !token) return null; // only these two variables are ever read
  return createUpstash({ url, token, fetchImpl });
}

// deps: { env, redis, fetchImpl, now, newId } - all optional; tests inject redis/now.
export async function handleScores(request, deps = {}) {
  const redis = storeFrom(deps);
  if (!redis) return unavailable();
  const board = createLeaderboard({ redis, now: deps.now, newId: deps.newId });

  try {
    if (request.method === 'GET') {
      return json(200, { entries: await board.top(LEADERBOARD.shown) });
    }
    if (request.method !== 'POST') {
      return json(405, { error: 'method-not-allowed', message: 'Use GET or POST.' }, { Allow: 'GET, POST' });
    }

    // Cheap checks first, before any Redis work.
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return json(415, { error: 'unsupported-media-type', message: 'Send JSON.' });
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json(413, { error: 'too-large', message: 'That request is too big.' });

    // Every POST counts, valid or not, so the limit also slows down probing.
    const salt = deps.env?.KV_REST_API_TOKEN ?? 'dev';
    const limit = await board.hit(await hashIp(clientIp(request), salt), LEADERBOARD.rateLimit);
    if (!limit.allowed) {
      return json(429, { error: 'rate-limited', message: 'Too many submissions. Please try again later.' },
        { 'Retry-After': String(limit.retryAfter) });
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: 'malformed', message: 'That was not valid JSON.' });
    }
    const checked = validateSubmission(body);
    if (!checked.ok) return json(400, { error: checked.error, message: checked.message });

    // The score is ours alone. Nothing the client sent can change it.
    const { score, casesSolved } = scoreSubmission(checked.cases);
    const { id, rank } = await board.submit({ name: checked.name, score, casesSolved });
    return json(201, { ok: true, id, score, casesSolved, rank });
  } catch (err) {
    if (err instanceof StoreError) return unavailable();
    throw err;
  }
}
