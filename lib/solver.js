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
