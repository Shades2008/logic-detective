// Static game data: traits, names, and difficulty levels.

export const ATTRS = ['hat', 'coat', 'location', 'item'];

// Per-case, each attribute draws a random subset of its pool (see LEVELS.valuesPerAttr)
// so suspects overlap and a single clue rarely identifies anyone.
export const VALUE_POOLS = {
  hat: ['fedora', 'bowler', 'flat cap', 'top hat', 'beret', 'homburg', 'trilby'],
  coat: ['black', 'grey', 'tan', 'red', 'green', 'navy', 'white'],
  location: ['docks', 'jazz club', 'train station', 'casino', 'rooftop', 'alley', 'pier'],
  item: ['briefcase', 'umbrella', 'cigar', 'pocket watch', 'newspaper', 'violin case', 'cane'],
};

export const FIRST_NAMES = [
  'Vincent', 'Dolores', 'Mickey', 'Lola', 'Frankie', 'Velma',
  'Jack', 'Ruby', 'Eddie', 'Gloria', 'Walt', 'Irene',
];
export const LAST_NAMES = [
  'Kessler', 'Duval', 'Mercer', 'Voss', 'Calloway', 'Pryce',
  'Okafor', 'Brandt', 'Fontaine', 'Lindqvist', 'Maddox', 'Santoro',
];

// Clue classes: what a level is allowed to hand out.
//   direct         "The culprit wore a fedora."
//   negative       "The culprit was not carrying a cane."
//   relational     "The culprit stood next to someone in a red coat."
//   (a negated relational clue needs both `negative` and `relational`)
export const CLUE_KINDS = ['direct', 'negative', 'relational'];

const ALL_KINDS = CLUE_KINDS;

// minClues: a case shorter than this is too trivial to be a puzzle and is
// regenerated. The generator also steers towards it while choosing clues.
//
// Pool mode (single-player) pads the minimal deck with extra true clues up to
// poolSize, drawn from poolKinds. Level 1's deck is direct-only, but a culprit
// has just four direct clues (hat, coat, location, item), so its pool of 6
// has to borrow negative clues for the extras.
//
// minPar is the pool-mode floor on par (the smallest sufficient subset). It
// is separate from minClues because the two can't be equal at higher levels:
// a pool with a "strong" clue (rules out half the roster or more) leaves at
// most floor(n/2) suspects, and each of those takes one clue to knock out, so
// par <= floor(n/2) (3 for 7 suspects, 4 for 8). minPar sits at that ceiling.
export const LEVELS = [
  { level: 1, suspects: 5, valuesPerAttr: 4, kinds: ['direct'], minClues: 2, minPar: 2, poolSize: 6, poolKinds: ['direct', 'negative'] },
  { level: 2, suspects: 6, valuesPerAttr: 4, kinds: ['direct', 'negative'], minClues: 3, minPar: 3, poolSize: 7, poolKinds: ['direct', 'negative'] },
  { level: 3, suspects: 7, valuesPerAttr: 5, kinds: ALL_KINDS, minClues: 4, minPar: 3, poolSize: 8, poolKinds: ALL_KINDS },
  { level: 4, suspects: 8, valuesPerAttr: 5, kinds: ALL_KINDS, minClues: 5, minPar: 4, poolSize: 10, poolKinds: ALL_KINDS },
];

export const MODES = ['race', 'pool'];

// Run rule shared by every client and the future server: a player has to open
// this many clue cards before they may accuse anyone. Every level's minPar is
// at least this, so the par bonus stays reachable.
export const MIN_CARDS_TO_ACCUSE = 2;

export function getLevel(level) {
  const config = LEVELS[level - 1];
  if (!config) throw new RangeError(`Unknown level: ${level} (valid: 1-${LEVELS.length})`);
  return config;
}
