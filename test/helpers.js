// Hand-built roster used by the semantics tests. Lineup order = array order.
//
//   0 Ann    fedora  red   docks    cane
//   1 Bob    fedora  grey  docks    umbrella
//   2 Cy     beret   red   casino   cane
//   3 Dee    beret   tan   casino   cigar
//   4 Eve    cap     tan   alley    umbrella
export const roster = [
  { name: 'Ann', hat: 'fedora', coat: 'red', location: 'docks', item: 'cane' },
  { name: 'Bob', hat: 'fedora', coat: 'grey', location: 'docks', item: 'umbrella' },
  { name: 'Cy', hat: 'beret', coat: 'red', location: 'casino', item: 'cane' },
  { name: 'Dee', hat: 'beret', coat: 'tan', location: 'casino', item: 'cigar' },
  { name: 'Eve', hat: 'cap', coat: 'tan', location: 'alley', item: 'umbrella' },
];

export const attr = (a, value, negate = false) => ({ type: 'attr', attr: a, value, negate });
export const rel = (relation, a, value, negate = false) => ({ type: 'rel', relation, attr: a, value, negate });

// ---- independent oracle ---------------------------------------------------
// Re-states the clue rules from the spec in a different shape from
// lib/clues.js (index arithmetic, explicit loops, no shared code), so a bug in
// `holds` can't also hide inside the check that is meant to catch it.
export function oracleFits(suspects, clues, i) {
  for (const c of clues) {
    let result;
    if (c.type === 'attr') {
      result = suspects[i][c.attr] === c.value;
    } else {
      result = false;
      for (let j = 0; j < suspects.length; j++) {
        if (j === i) continue;
        const related = c.relation === 'nextTo'
          ? Math.abs(j - i) === 1
          : suspects[j].location === suspects[i].location;
        if (related && suspects[j][c.attr] === c.value) result = true;
      }
    }
    if (c.negate) result = !result;
    if (!result) return false;
  }
  return true;
}

export const oracleSolve = (suspects, clues) =>
  suspects.map((_, i) => i).filter((i) => oracleFits(suspects, clues, i));

// Brute-force par: try every subset of the clues, keep the smallest that
// leaves only the culprit. Returns { par, minimalSubsets } where
// minimalSubsets lists every subset (as clue indices) of that smallest size.
export function oraclePar(suspects, clues, culprit) {
  const k = clues.length;
  const fits = clues.map((clue) => suspects.map((_, i) => oracleFits(suspects, [clue], i)));
  let par = Infinity;
  let minimalSubsets = [];
  for (let s = 1; s < 2 ** k; s++) {
    const members = [];
    for (let j = 0; j < k; j++) if ((s >> j) & 1) members.push(j);
    if (members.length > par) continue;
    const survivors = suspects.map((_, i) => i).filter((i) => members.every((j) => fits[j][i]));
    if (survivors.length === 1 && survivors[0] === culprit) {
      if (members.length < par) { par = members.length; minimalSubsets = []; }
      minimalSubsets.push(members);
    }
  }
  return { par, minimalSubsets };
}
