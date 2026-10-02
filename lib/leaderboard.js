// Leaderboard rules shared by the browser (nickname check) and the server
// (submission check). Pure functions, no I/O.
//
// The leaderboard is HONOR-SYSTEM: the game runs in the browser, so a client
// can always lie about what happened in a run. These checks make the lies
// expensive (a submission must describe a run the rules allow, and the server
// recomputes the score so a client can never send a total), but they cannot
// prove a run was played.

import { LEVELS, MIN_CARDS_TO_ACCUSE } from './data.js';
import { SCORING, scoreRun } from './scoring.js';

export const LEADERBOARD = {
  stored: 100, // entries kept in the sorted set; the rest are trimmed
  shown: 20, // entries GET /api/scores returns
  rateLimit: { max: 10, windowSeconds: 3600 }, // submissions per IP per window
};

export const NAME_RULES = { min: 2, max: 16 };

const NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

// Best effort, not a promise. Two lists so common words stay usable:
//  - SUBSTRINGS are blocked anywhere in the name (after normalising).
//  - WORDS are blocked only as a whole word ("grape" and "therapist" are fine).
const BLOCKED_SUBSTRINGS = ['fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'nigg'];
const BLOCKED_WORDS = ['fag', 'faggot', 'retard', 'rape', 'rapist', 'nazi', 'hitler', 'kkk'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };

// lower-case, undo simple leetspeak, collapse repeated letters ("fuuuck" -> "fuck")
const squash = (text) => text
  .toLowerCase()
  .replace(/[013457]/g, (d) => LEET[d])
  .replace(/(.)\1+/g, '$1');

const BLOCKED_SUBSTRINGS_SQUASHED = BLOCKED_SUBSTRINGS.map(squash);
const BLOCKED_WORDS_SQUASHED = new Set(BLOCKED_WORDS.map(squash));

export function isBlockedName(name) {
  const tokens = name.split(/[ _-]+/).filter(Boolean).map(squash);
  if (tokens.some((t) => BLOCKED_WORDS_SQUASHED.has(t))) return true;
  // Substring check on the whole name with separators removed, so "f u c k" is caught too.
  const joined = squash(name.replace(/[ _-]+/g, ''));
  return BLOCKED_SUBSTRINGS_SQUASHED.some((bad) => joined.includes(bad));
}

const NAME_MESSAGES = {
  'name-type': 'Enter a nickname.',
  'name-length': `Use ${NAME_RULES.min} to ${NAME_RULES.max} characters.`,
  'name-chars': 'Letters, numbers, spaces, hyphens and underscores only.',
  'name-blocked': 'Please pick a different nickname.',
};

const nameError = (error) => ({ ok: false, error, message: NAME_MESSAGES[error] });

// Returns { ok: true, name } with the cleaned-up name, or { ok: false, error, message }.
export function validateName(input) {
  if (typeof input !== 'string') return nameError('name-type');
  const name = input.trim().replace(/ {2,}/g, ' ');
  if (name.length < NAME_RULES.min || name.length > NAME_RULES.max) return nameError('name-length');
  if (!NAME_PATTERN.test(name) || !/[A-Za-z0-9]/.test(name)) return nameError('name-chars');
  if (isBlockedName(name)) return nameError('name-blocked');
  return { ok: true, name };
}

// ---- runs ---------------------------------------------------------------------

export const MAX_CASES = LEVELS.length;

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isCount = (x) => Number.isInteger(x) && x >= 0;
const bad = (error, message) => ({ ok: false, error, message });

// Validate the per-case results a client sends. Only these four fields are read;
// anything else (a `total`, a `par`, a `seed`...) is ignored, never trusted.
// Returns { ok: true, cases } with cleaned cases, or { ok: false, error, message }.
export function validateRun(input) {
  if (!Array.isArray(input) || input.length < 1) return bad('cases-count', 'A run needs at least one case.');
  if (input.length > MAX_CASES) return bad('cases-count', `A run has at most ${MAX_CASES} cases.`);

  const cases = [];
  let strikes = 0;

  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (!isObject(raw) || !isCount(raw.level) || !isCount(raw.cardsOpened)
      || !isCount(raw.wrongAccusations) || typeof raw.solved !== 'boolean') {
      return bad('malformed', `Case ${i + 1} is malformed.`);
    }
    const { level, cardsOpened, wrongAccusations, solved } = raw;
    const config = LEVELS[level - 1];

    if (level !== i + 1 || !config) return bad('level-order', 'Cases must be levels 1, 2, 3... in order.');
    if (cardsOpened > config.poolSize) return bad('cards-range', `Case ${level} cannot have more than ${config.poolSize} cards.`);
    if ((solved || wrongAccusations > 0) && cardsOpened < MIN_CARDS_TO_ACCUSE) {
      return bad('too-few-cards', `Case ${level}: accusing needs at least ${MIN_CARDS_TO_ACCUSE} cards open.`);
    }
    if (wrongAccusations > Math.min(SCORING.maxStrikes, config.suspects - 1)) {
      return bad('strikes-range', `Case ${level} has too many wrong accusations.`);
    }

    strikes += wrongAccusations;
    if (strikes > SCORING.maxStrikes) return bad('too-many-strikes', `A run allows ${SCORING.maxStrikes} strikes at most.`);

    // The rules end a run on the third strike and never let a case be solved after it.
    const lastCase = i === input.length - 1;
    if (solved && strikes >= SCORING.maxStrikes) return bad('inconsistent-run', 'A case cannot be solved after the final strike.');
    if (!solved && !(lastCase && strikes === SCORING.maxStrikes)) {
      return bad('inconsistent-run', 'A case can only end unsolved on the final strike.');
    }

    cases.push({ level, cardsOpened, wrongAccusations, solved });
  }

  if (cases[cases.length - 1].solved && cases.length !== MAX_CASES) {
    return bad('incomplete-run', 'Only finished runs can be submitted.');
  }
  return { ok: true, cases };
}

// Validate a whole POST body: { name, cases }. Extra fields are ignored.
export function validateSubmission(body) {
  if (!isObject(body)) return bad('malformed', 'Expected a JSON object.');
  const name = validateName(body.name);
  if (!name.ok) return name;
  const run = validateRun(body.cases);
  if (!run.ok) return run;
  return { ok: true, name: name.name, cases: run.cases };
}

// The server's own score for a validated run. par is the level's minPar, the
// same par the game shows and scores against; nothing here is client-supplied.
export function scoreSubmission(cases) {
  const scored = scoreRun(cases.map((c) => ({ ...c, par: LEVELS[c.level - 1].minPar })));
  return {
    score: scored.total,
    casesSolved: cases.filter((c) => c.solved).length,
    strikes: scored.strikes,
  };
}
