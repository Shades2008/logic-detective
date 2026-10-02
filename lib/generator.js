// Case generator: truth first, clues second, solver as the judge.
//
//   1. Build a random roster (the lineup) and pick the culprit.
//   2. Collect every clue that is true of the culprit.
//   3. Greedily reveal clues, each one ruling out at least one remaining
//      suspect, until only the culprit is left. Cases shorter than the level's
//      minClues are discarded as too easy.
//   4. Run the solver over the final clue list. If it does not leave exactly
//      the culprit, throw the attempt away and regenerate.
//
// Two modes:
//   race  the minimal deck above, revealed in order (multiplayer).
//   pool  single-player: the same deck padded with extra true clues into a
//         shuffled pool the player picks from. `par` is the size of the
//         smallest subset of the pool that identifies the culprit.
//
// Same seed + level + mode -> same case. Attempt n uses its own RNG stream, so a
// regeneration never disturbs earlier attempts.

import { ATTRS, FIRST_NAMES, LAST_NAMES, MODES, VALUE_POOLS, getLevel } from './data.js';
import { allowedClasses, holds, trueCluePool } from './clues.js';
import { createRng, randomSeed } from './rng.js';
import { popcount, smallestSufficientSubset, survivorMask, verifyCase } from './solver.js';

function buildRoster(rng, config) {
  const values = {};
  for (const attr of ATTRS) values[attr] = rng.sample(VALUE_POOLS[attr], config.valuesPerAttr);

  const firsts = rng.sample(FIRST_NAMES, config.suspects);
  const lasts = rng.sample(LAST_NAMES, config.suspects);

  // No two suspects share all four traits, so traits alone can always tell
  // them apart (relational clues may still be needed to do it economically).
  const seen = new Set();
  const suspects = [];
  while (suspects.length < config.suspects) {
    const traits = {};
    for (const attr of ATTRS) traits[attr] = rng.pick(values[attr]);
    const key = ATTRS.map((a) => traits[a]).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const n = suspects.length;
    suspects.push({ name: `${firsts[n]} ${lasts[n]}`, ...traits });
  }
  return suspects;
}

// Returns an ordered clue list, or null if the culprit cannot be isolated.
//
// Each clue narrows the field given the ones before it, but a later clue can
// still make an earlier one redundant, so the deck is not always the
// smallest set that works. Pool mode passes `minPar` to rule out deck clues
// that would open a route to the culprit shorter than that.
function chooseClues(rng, suspects, culprit, config, minPar) {
  const pool = trueCluePool(suspects, culprit, config.kinds);
  let candidates = suspects.map((_, i) => i);
  const chosen = [];
  const chosenMasks = [];

  while (candidates.length > 1) {
    // Clues that rule out at least one remaining suspect, by class.
    const useful = {};
    for (const cls of allowedClasses(config.kinds)) {
      for (const clue of pool[cls]) {
        const remaining = candidates.filter((i) => holds(clue, suspects, i));
        if (remaining.length < candidates.length) {
          (useful[cls] ??= []).push({ clue, remaining });
        }
      }
    }

    if (minPar !== undefined) {
      for (const [cls, entries] of Object.entries(useful)) {
        const ok = entries.filter(({ clue }) => {
          const masks = [...chosenMasks, survivorMask(suspects, clue)];
          return (smallestSufficientSubset(masks, suspects.length, culprit)?.size ?? Infinity) >= minPar;
        });
        if (ok.length) useful[cls] = ok;
        else delete useful[cls];
      }
    }

    // While the case is shorter than minClues, prefer clues that leave enough
    // suspects for it to still reach that length (each later clue rules out
    // at least one). If nothing qualifies, take whatever is useful.
    let options = useful;
    if (chosen.length < config.minClues - 1) {
      const needed = config.minClues - chosen.length;
      const preferred = {};
      for (const [cls, entries] of Object.entries(useful)) {
        const keepGoing = entries.filter((e) => e.remaining.length >= needed);
        if (keepGoing.length) preferred[cls] = keepGoing;
      }
      if (Object.keys(preferred).length) options = preferred;
    }

    const classes = Object.keys(options);
    if (classes.length === 0) return null; // twins: nothing left can tell them apart
    // Pick the class first so rare classes (direct) aren't drowned out by common ones.
    const entry = rng.pick(options[rng.pick(classes)]);
    chosen.push(entry.clue);
    chosenMasks.push(survivorMask(suspects, entry.clue));
    candidates = entry.remaining;
  }
  return chosen;
}

// Extra true clues must not be redundant with what's already in the pool
// (same effect on the roster), must rule out somebody, and must not open a
// shorter route to the culprit than the level's minPar.
const isStrong = (mask, n) => (n - popcount(mask)) * 2 >= n; // rules out half or more
const isWeak = (mask, n) => n - popcount(mask) <= 2; // rules out one or two

function buildPool(rng, suspects, culprit, config, deck) {
  const n = suspects.length;
  const all = (1 << n) - 1;
  const parOf = (masks) => smallestSufficientSubset(masks, n, culprit)?.size ?? Infinity;

  const masks = deck.map((clue) => survivorMask(suspects, clue));
  if (deck.length > config.poolSize || parOf(masks) < config.minPar) return null;

  const pool = deck.slice();
  const seen = new Set(masks);
  const candidates = rng.shuffle(
    Object.values(trueCluePool(suspects, culprit, config.poolKinds)).flat(),
  ).map((clue) => ({ clue, mask: survivorMask(suspects, clue) }))
    .filter(({ mask }) => mask !== all);

  while (pool.length < config.poolSize) {
    // Make sure the pool offers both a big cut and a small one, then fill freely.
    const wanted = !masks.some((m) => isStrong(m, n)) ? (m) => isStrong(m, n)
      : !masks.some((m) => isWeak(m, n)) ? (m) => isWeak(m, n)
      : () => true;
    const pick = candidates.find(({ mask }) => !seen.has(mask) && wanted(mask)
      && parOf([...masks, mask]) >= config.minPar);
    if (!pick) return null;
    pool.push(pick.clue);
    masks.push(pick.mask);
    seen.add(pick.mask);
  }

  return { pool: rng.shuffle(pool), par: parOf(masks) };
}

export function generateCase({ seed = randomSeed(), level = 1, mode = 'race', maxAttempts = 200 } = {}) {
  if (!MODES.includes(mode)) throw new RangeError(`Unknown mode: ${mode} (valid: ${MODES.join(', ')})`);
  const config = getLevel(level);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = createRng(`${seed}:${level}:${attempt}`);
    const suspects = buildRoster(rng, config);
    const culprit = rng.int(suspects.length);
    const deck = chooseClues(rng, suspects, culprit, config, mode === 'pool' ? config.minPar : undefined);
    if (!deck || deck.length < config.minClues) continue; // unsolvable or too trivial

    let result = { seed: String(seed), level, attempt, suspects, culprit, clues: deck };
    if (mode === 'pool') {
      const built = buildPool(rng, suspects, culprit, config, deck);
      if (!built) continue;
      result = { seed: String(seed), level, mode, attempt, suspects, culprit, par: built.par, clues: built.pool };
    }

    if (verifyCase(result).ok) return result;
  }
  throw new Error(`No uniquely solvable ${mode} case for seed "${seed}", level ${level} in ${maxAttempts} attempts`);
}
