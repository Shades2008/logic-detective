// Tiny persistence layer: first-visit flag and personal best.
// localStorage can throw (private mode, blocked site data) or be missing, so
// every access is wrapped and the game falls back to memory for the session.
//
// Stored: whether How to Play was seen, the personal best, the nickname, and
// the player's latest leaderboard entry (so it can be highlighted later).
// Anything read back is re-validated, never trusted.

import { validateName } from '../lib/leaderboard.js';

const KEY = 'logicDetective.v1';
const blank = () => ({ seenHowTo: false, best: null, name: null, lastRun: null });
let memory = blank();

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const checked = validateName(value);
  return checked.ok && checked.name === value ? value : null;
}

function cleanLastRun(value) {
  if (!value || typeof value !== 'object') return null;
  const name = cleanName(value.name);
  const okRank = value.rank === null || (Number.isInteger(value.rank) && value.rank > 0);
  if (typeof value.id !== 'string' || !/^[0-9a-f]{1,32}$/.test(value.id) || !Number.isSafeInteger(value.score) || value.score < 0 || !okRank || !name) return null;
  return { id: value.id, rank: value.rank, score: value.score, name };
}

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      seenHowTo: data.seenHowTo === true,
      best: Number.isFinite(data.best) ? data.best : null,
      name: cleanName(data.name),
      lastRun: cleanLastRun(data.lastRun),
    };
  } catch {
    return null;
  }
}

export function loadProfile() {
  const stored = read();
  if (stored) memory = stored;
  return { ...memory };
}

export function saveProfile(patch) {
  memory = { ...memory, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
    return true;
  } catch {
    return false; // memory-only this session
  }
}
