// What a client is allowed to see of a pool-mode case.
//
// The server holds the full case and sends publicView(case) up front, then
// revealClue(case, index) only when a player opens a card. Nothing here may
// reveal the culprit, par, a clue's value, or anything that lets the client
// rebuild the case: that includes `seed` and `attempt`, because the generator
// in /lib is public and would reproduce the whole thing from the seed.
//
// Card order is the pool order, which the generator already shuffled with the
// seeded RNG, so a card's position says nothing about whether it belongs to
// the minimal solution deck.

export const CARD_LABELS = ['Hat', 'Coat', 'Location', 'Item', 'Neighbors', 'Same place'];

// Category only: which trait (or which kind of relation) the clue is about.
export function cardLabel(clue) {
  if (clue.type === 'attr') return clue.attr[0].toUpperCase() + clue.attr.slice(1);
  return clue.relation === 'nextTo' ? 'Neighbors' : 'Same place';
}

function assertPool(c) {
  if (c.mode !== 'pool') throw new TypeError('publicView/revealClue only apply to pool-mode cases');
}

export function publicView(c) {
  assertPool(c);
  return {
    level: c.level,
    mode: c.mode,
    suspects: c.suspects.map((s) => ({ ...s })),
    cards: c.clues.map((clue, index) => ({ index, label: cardLabel(clue) })),
  };
}

// The full clue behind one card.
export function revealClue(c, index) {
  assertPool(c);
  if (!Number.isInteger(index) || index < 0 || index >= c.clues.length) {
    throw new RangeError(`No such card: ${index}`);
  }
  return { ...c.clues[index] };
}
