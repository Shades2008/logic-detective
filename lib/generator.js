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
// Same seed + level -> same case. Attempt n uses its own RNG stream, so a
// regeneration never disturbs earlier attempts.

import { ATTRS, FIRST_NAMES, LAST_NAMES, VALUE_POOLS, getLevel } from './data.js';
import { allowedClasses, holds, trueCluePool } from './clues.js';
import { createRng, randomSeed } from './rng.js';
import { solve } from './solver.js';

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
function chooseClues(rng, suspects, culprit, config) {
  const pool = trueCluePool(suspects, culprit, config.kinds);
  let candidates = suspects.map((_, i) => i);
  const chosen = [];

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
    candidates = entry.remaining;
  }
  return chosen;
}

export function generateCase({ seed = randomSeed(), level = 1, maxAttempts = 200 } = {}) {
  const config = getLevel(level);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = createRng(`${seed}:${level}:${attempt}`);
    const suspects = buildRoster(rng, config);
    const culprit = rng.int(suspects.length);
    const clues = chooseClues(rng, suspects, culprit, config);
    if (!clues || clues.length < config.minClues) continue; // unsolvable or too trivial

    const survivors = solve(suspects, clues);
    if (survivors.length !== 1 || survivors[0] !== culprit) continue;

    return { seed: String(seed), level, attempt, suspects, culprit, clues };
  }
  throw new Error(`No uniquely solvable case for seed "${seed}", level ${level} in ${maxAttempts} attempts`);
}
