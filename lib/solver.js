// The solver knows only the public roster and the clues, never the culprit.

import { holds } from './clues.js';

// Indices of every suspect consistent with ALL the clues.
export function solve(suspects, clues) {
  const out = [];
  for (let i = 0; i < suspects.length; i++) {
    if (clues.every((clue) => holds(clue, suspects, i))) out.push(i);
  }
  return out;
}

// Exactly one suspect fits. If `expected` is given, it must be that suspect.
export function isUnique(suspects, clues, expected) {
  const survivors = solve(suspects, clues);
  return survivors.length === 1 && (expected === undefined || survivors[0] === expected);
}

// Candidate counts after 0, 1, 2 ... clues. Handy for hints and for checking
// that each revealed clue actually narrows the field.
export function narrowing(suspects, clues) {
  const counts = [suspects.length];
  let candidates = suspects.map((_, i) => i);
  for (const clue of clues) {
    candidates = candidates.filter((i) => holds(clue, suspects, i));
    counts.push(candidates.length);
  }
  return counts;
}

// ---- subsets, par and verification ---------------------------------------
// Suspects fit in a bitmask (<= 8, well under 31), which keeps the subset
// search over a 10-clue pool at ~1000 cheap steps.

// Bit i is set when clue holds for suspect i.
export function survivorMask(suspects, clue) {
  let mask = 0;
  for (let i = 0; i < suspects.length; i++) if (holds(clue, suspects, i)) mask |= 1 << i;
  return mask;
}

export const popcount = (x) => {
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
};

// Smallest subset of clues (given as survivor masks) that leaves only the
// culprit. Returns { size, subset } with subset as clue indices, or null.
export function smallestSufficientSubset(masks, suspectCount, culprit) {
  const k = masks.length;
  const all = (1 << suspectCount) - 1;
  const target = 1 << culprit;
  const meet = new Int32Array(1 << k); // meet[s] = suspects fitting every clue in subset s
  meet[0] = all;
  let best = null;
  for (let s = 1; s < 1 << k; s++) {
    const lowest = 31 - Math.clz32(s & -s);
    meet[s] = meet[s & (s - 1)] & masks[lowest];
    if (meet[s] === target) {
      const size = popcount(s);
      if (!best || size < best.size) best = { size, subset: s };
    }
  }
  if (!best) return null;
  const subset = [];
  for (let j = 0; j < k; j++) if (best.subset & (1 << j)) subset.push(j);
  return { size: best.size, subset };
}

// The generator's last gate, kept separate from the code that builds cases.
// Returns { ok: true } or { ok: false, reason, ... }:
//   false-clue    a clue that is not true of the culprit
//   ambiguous     the clues leave more than one suspect
//   par-mismatch  (cases with a par) par is not the true smallest sufficient subset
export function verifyCase({ suspects, culprit, clues, par }) {
  const falseAt = clues.findIndex((clue) => !holds(clue, suspects, culprit));
  if (falseAt !== -1) return { ok: false, reason: 'false-clue', clueIndex: falseAt };

  const survivors = solve(suspects, clues);
  if (survivors.length !== 1 || survivors[0] !== culprit) {
    return { ok: false, reason: 'ambiguous', survivors };
  }

  if (par !== undefined) {
    // Plain enumeration over per-clue truth tables (deliberately not the
    // bitmask walk the generator uses to compute par).
    const fits = clues.map((clue) => suspects.map((_, i) => holds(clue, suspects, i)));
    let smallest = Infinity;
    for (let s = 1; s < 1 << clues.length; s++) {
      const members = [];
      for (let j = 0; j < clues.length; j++) if (s & (1 << j)) members.push(j);
      if (members.length >= smallest) continue;
      const identifies = suspects.every((_, i) => i === culprit || members.some((j) => !fits[j][i]));
      if (identifies) smallest = members.length;
    }
    if (smallest !== par) return { ok: false, reason: 'par-mismatch', claimed: par, actual: smallest };
  }
  return { ok: true };
}
